import { IntercomClient } from "intercom-client";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { cohortTag } from "./lib/cohort.js";
import { intercomApiBase, loadEnv, requireEnv } from "./lib/config.js";
import { closePool, getPool } from "./lib/db.js";
import { generateTicketMessage, mapWithConcurrency } from "./lib/content.js";
import { Rng } from "./lib/rng.js";
import { SCENARIOS, type Scenario } from "./fixtures/scenarios.js";
import { personaById, type PersonaId } from "./fixtures/personas.js";
import type { SynthUser } from "./generate-users.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const USERS_PATH = resolve(__dirname, "../../data/synth-users.json");
const OUTPUT_PATH = resolve(__dirname, "../../data/synth-intercom.json");
const CONTENT_CACHE_PATH = resolve(__dirname, "../../data/synth-intercom-content.json");

const REQUIRED_CONTACT_ATTRIBUTES: { name: string; data_type: "string" }[] = [
  { name: "persona", data_type: "string" },
  { name: "plan", data_type: "string" },
  { name: "status", data_type: "string" },
  { name: "primary_sport", data_type: "string" },
  { name: "city", data_type: "string" },
  { name: "country", data_type: "string" },
  { name: "cohort_id", data_type: "string" },
];

async function ensureContactDataAttributes(token: string, region: "us" | "eu" | "au"): Promise<void> {
  const base = intercomApiBase(region);
  const headers = {
    Authorization: `Bearer ${token}`,
    "Intercom-Version": "2.11",
    Accept: "application/json",
    "Content-Type": "application/json",
  };
  const listRes = await fetch(`${base}/data_attributes?model=contact&include_archived=true`, { headers });
  if (!listRes.ok) throw new Error(`list data_attributes failed: ${listRes.status} ${await listRes.text()}`);
  const listJson = (await listRes.json()) as { data: { name: string; custom?: boolean }[] };
  const existing = new Set(listJson.data.filter((a) => a.custom === true).map((a) => a.name));

  for (const attr of REQUIRED_CONTACT_ATTRIBUTES) {
    if (existing.has(attr.name)) continue;
    const res = await fetch(`${base}/data_attributes`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        name: attr.name,
        model: "contact",
        data_type: attr.data_type,
        description: `Synth-generated attribute for course data`,
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      if (res.status === 400 && body.includes("already")) continue;
      throw new Error(`create data_attribute ${attr.name} failed: ${res.status} ${body}`);
    }
    console.log(`  created data attribute: ${attr.name}`);
  }
}

interface IntercomOutput {
  cohortId: string;
  contacts: { userId: string; intercomId: string; email: string }[];
  conversations: { userId: string; intercomContactId: string; conversationId: string; scenario: string; title: string }[];
  tickets: { userId: string; intercomContactId: string; ticketId: string; scenario: string; title: string }[];
  failures: { userId: string; stage: string; error: string }[];
}

interface UserWithLatestActivity extends SynthUser {
  latestActivityTitle?: string;
  latestActivityDate?: string;
}

async function loadUsers(): Promise<SynthUser[]> {
  const raw = await readFile(USERS_PATH, "utf8");
  const parsed = JSON.parse(raw) as SynthUser[];
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error(`No users in ${USERS_PATH} — run synth:users first`);
  }
  return parsed;
}

async function loadLatestActivities(userIds: string[]): Promise<Map<string, { title: string; date: Date }>> {
  const pool = getPool();
  const { rows } = await pool.query<{ athlete_id: string; title: string; date: Date }>(
    `
      SELECT DISTINCT ON (athlete_id) athlete_id, title, date
      FROM activities
      WHERE athlete_id = ANY($1)
      ORDER BY athlete_id, date DESC
    `,
    [userIds],
  );
  const map = new Map<string, { title: string; date: Date }>();
  for (const row of rows) {
    map.set(row.athlete_id, { title: row.title, date: row.date });
  }
  return map;
}

function pickTicketFilers(users: SynthUser[], rng: Rng, target: number): SynthUser[] {
  const weighted = users.map((u) => ({
    value: u,
    weight: Math.max(0.01, u.supportLikelihood) * (u.status === "dormant" ? 0.3 : 1),
  }));
  const picked: SynthUser[] = [];
  const seen = new Set<string>();
  while (picked.length < target && seen.size < users.length) {
    const candidate = rng.weighted(weighted);
    if (!seen.has(candidate.id)) {
      seen.add(candidate.id);
      picked.push(candidate);
    }
  }
  return picked;
}

function pickScenarioFor(user: SynthUser, rng: Rng): Scenario {
  const weighted = SCENARIOS.map((s) => {
    const bias = s.personaBias[user.persona as PersonaId] ?? 1;
    return { value: s, weight: s.weight * bias };
  });
  return rng.weighted(weighted);
}

async function upsertContact(
  client: IntercomClient,
  user: SynthUser,
): Promise<string> {
  try {
    const existing = await client.contacts.showContactByExternalId({ external_id: user.id });
    if (existing && (existing as { id?: string }).id) {
      return (existing as { id: string }).id;
    }
  } catch {
    // Not found — fall through to create
  }
  const created = await client.contacts.create({
    email: user.email,
    name: user.name,
    role: "user",
    external_id: user.id,
    signed_up_at: Math.floor(new Date(user.signupDate).getTime() / 1000),
    custom_attributes: {
      persona: user.persona,
      plan: user.plan,
      status: user.status,
      city: user.city,
      country: user.country,
      primary_sport: user.primarySport,
      cohort_id: cohortTag(),
    },
  } as Parameters<typeof client.contacts.create>[0]);
  if (!created || typeof (created as { id?: string }).id !== "string") {
    throw new Error(`Unexpected contacts.create response: ${JSON.stringify(created)}`);
  }
  return (created as { id: string }).id;
}

async function createConversation(
  client: IntercomClient,
  intercomContactId: string,
  body: string,
): Promise<string> {
  const response = await client.conversations.create({
    from: { type: "user", id: intercomContactId },
    body,
  } as Parameters<typeof client.conversations.create>[0]);
  const id =
    (response as { conversation_id?: string; id?: string }).conversation_id ??
    (response as { conversation_id?: string; id?: string }).id;
  if (!id) throw new Error(`No conversation id in response: ${JSON.stringify(response)}`);
  return id;
}

async function createTicket(
  client: IntercomClient,
  intercomContactId: string,
  title: string,
  body: string,
  scenario: Scenario,
  platform: string,
): Promise<string> {
  const response = await client.tickets.create({
    ticket_type_id: requireEnv("INTERCOM_TICKET_TYPE_ID"),
    contacts: [{ id: intercomContactId }],
    ticket_attributes: {
      _default_title_: title,
      _default_description_: body,
      Platforms: platform,
      "Root cause": scenario.rootCause,
    },
  } as Parameters<typeof client.tickets.create>[0]);
  const id = (response as { id?: string })?.id;
  if (!id) throw new Error(`No ticket id in response: ${JSON.stringify(response)}`);
  return id;
}

interface WorkItem {
  user: SynthUser;
  scenario: Scenario;
  platform: string;
  kind: "conversation" | "ticket";
}

async function main() {
  loadEnv();
  requireEnv("INTERCOM_ACCESS_TOKEN");
  requireEnv("INTERCOM_TICKET_TYPE_ID");
  requireEnv("ANTHROPIC_API_KEY");

  const users = await loadUsers();
  const rng = new Rng(loadEnv().SYNTH_RNG_SEED + 2);

  const conversationCount = 100;
  const ticketCount = 45;
  const totalFilers = conversationCount + ticketCount;

  const filers = pickTicketFilers(users, rng, totalFilers);
  console.log(`Sampled ${filers.length} filers of ${users.length} total.`);

  const latestByUser = await loadLatestActivities(filers.map((u) => u.id));

  const usersWithActivity: UserWithLatestActivity[] = filers.map((u) => {
    const latest = latestByUser.get(u.id);
    return latest
      ? { ...u, latestActivityTitle: latest.title, latestActivityDate: latest.date.toISOString().slice(0, 10) }
      : u;
  });

  const workItems: WorkItem[] = usersWithActivity.map((user, index) => {
    const scenario = pickScenarioFor(user, rng);
    const platform = rng.pick(scenario.platforms);
    const kind: "conversation" | "ticket" = index < conversationCount ? "conversation" : "ticket";
    return { user, scenario, platform, kind };
  });

  let cached: { title: string; body: string }[] | null = null;
  try {
    const raw = await readFile(CONTENT_CACHE_PATH, "utf8");
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length === workItems.length) {
      cached = parsed;
      console.log(`Reusing ${parsed.length} cached message bodies from ${CONTENT_CACHE_PATH}`);
    }
  } catch {
    // No cache yet — will generate.
  }

  let contents: { title: string; body: string }[];
  if (cached) {
    contents = cached;
  } else {
    console.log(`Generating ${workItems.length} message bodies via Claude Haiku (concurrency 6)…`);
    const t0 = Date.now();
    contents = await mapWithConcurrency(workItems, 6, async (item, i) => {
      const ctx = {
        userName: item.user.name,
        userFirstName: item.user.firstName,
        persona: personaById(item.user.persona).label,
        plan: item.user.plan,
        status: item.user.status,
        city: item.user.city,
        primarySport: item.user.primarySport,
        recentActivityTitle: (item.user as UserWithLatestActivity).latestActivityTitle,
        recentActivityDate: (item.user as UserWithLatestActivity).latestActivityDate,
      };
      try {
        const msg = await generateTicketMessage(item.scenario.instructions, ctx);
        if ((i + 1) % 25 === 0) console.log(`  generated ${i + 1}/${workItems.length}`);
        return msg;
      } catch {
        return { title: item.scenario.label, body: `Having trouble with ${item.scenario.label.toLowerCase()}. Can someone help?` };
      }
    });
    console.log(`Content generation took ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    await mkdir(dirname(CONTENT_CACHE_PATH), { recursive: true });
    await writeFile(CONTENT_CACHE_PATH, `${JSON.stringify(contents, null, 2)}\n`, "utf8");
  }

  const token = requireEnv("INTERCOM_ACCESS_TOKEN");
  const region = loadEnv().INTERCOM_REGION;
  console.log("Ensuring Intercom data attributes exist…");
  await ensureContactDataAttributes(token, region);
  const client = new IntercomClient({ token });

  const output: IntercomOutput = {
    cohortId: cohortTag(),
    contacts: [],
    conversations: [],
    tickets: [],
    failures: [],
  };

  const contactCache = new Map<string, string>();

  console.log("Upserting contacts + creating conversations/tickets (concurrency 4)…");
  await mapWithConcurrency(workItems, 4, async (item, i) => {
    try {
      let intercomId = contactCache.get(item.user.id);
      if (!intercomId) {
        intercomId = await upsertContact(client, item.user);
        contactCache.set(item.user.id, intercomId);
        output.contacts.push({ userId: item.user.id, intercomId, email: item.user.email });
      }
      const content = contents[i];
      if (item.kind === "conversation") {
        const conversationId = await createConversation(client, intercomId, content.body);
        output.conversations.push({
          userId: item.user.id,
          intercomContactId: intercomId,
          conversationId,
          scenario: item.scenario.id,
          title: content.title,
        });
      } else {
        const ticketId = await createTicket(client, intercomId, content.title, content.body, item.scenario, item.platform);
        output.tickets.push({
          userId: item.user.id,
          intercomContactId: intercomId,
          ticketId,
          scenario: item.scenario.id,
          title: content.title,
        });
      }
      if ((i + 1) % 20 === 0) console.log(`  processed ${i + 1}/${workItems.length}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      output.failures.push({ userId: item.user.id, stage: item.kind, error: message });
    }
  });

  await mkdir(dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, `${JSON.stringify(output, null, 2)}\n`, "utf8");

  console.log({
    contacts: output.contacts.length,
    conversations: output.conversations.length,
    tickets: output.tickets.length,
    failures: output.failures.length,
  });

  await closePool();
}

main().catch(async (err) => {
  console.error(err);
  await closePool().catch(() => {});
  process.exit(1);
});
