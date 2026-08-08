import Anthropic from "@anthropic-ai/sdk";
import { faker } from "@faker-js/faker";
import { IntercomClient } from "intercom-client";
import { LinearClient } from "@linear/sdk";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { PoolClient } from "pg";

import type { Sport } from "../../server/seed.js";
import { cohortTag } from "./lib/cohort.js";
import { intercomApiBase, loadEnv, requireEnv } from "./lib/config.js";
import { bulkInsert, closePool, getPool } from "./lib/db.js";
import { mapWithConcurrency } from "./lib/content.js";
import { Rng } from "./lib/rng.js";
import {
  AREA_LABELS,
  ENG_BUG_THEMES,
  ENG_INSTRUCTIONS,
  FEATURE_THEMES,
  PROJECTS,
  SCENARIO_TO_AREAS,
  TECH_DEBT_THEMES,
  TYPE_LABELS,
  type AreaLabel,
  type IssueType,
  type ProjectName,
} from "./fixtures/engineering.js";
import {
  PERSONAS,
  personaById,
  type Persona,
  type PersonaId,
  type Plan,
  type UserStatus,
} from "./fixtures/personas.js";
import { PLACES } from "./fixtures/places.js";
import { SCENARIOS, scenarioById, type Scenario } from "./fixtures/scenarios.js";
import { ACTIVITY_DESCRIPTIONS, ACTIVITY_PHOTOS, SPORT_PROFILES, USER_AVATARS } from "./fixtures/sports.js";
import type { SynthUser } from "./generate-users.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const BASE_USERS_PATH = resolve(__dirname, "../../data/synth-users.json");
const WEEKLY_USERS_PATH = resolve(__dirname, "../../data/synth-users-weekly.json");
const WEEKLY_LOG_PATH = resolve(__dirname, "../../data/synth-weekly-log.json");

const WEEK_DAYS = 7;
const WEEK_MS = WEEK_DAYS * 86_400_000;

// Per-run volumes (tune here)
const NEW_USERS_PER_RUN = 8;
const INTERCOM_CONVERSATIONS_PER_RUN = 8;
const INTERCOM_TICKETS_PER_RUN = 2;
const LINEAR_ISSUES_PER_RUN = 4;

type WeeklyLogEntry = {
  runAt: string;
  weekStart: string;
  newUsers: number;
  newActivities: number;
  newPosthogEvents: number;
  newConversations: number;
  newTickets: number;
  newLinearIssues: number;
};

async function fileExists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

async function loadBaseUsers(): Promise<SynthUser[]> {
  const raw = await readFile(BASE_USERS_PATH, "utf8");
  return JSON.parse(raw) as SynthUser[];
}

async function loadWeeklyUsers(): Promise<SynthUser[]> {
  if (!(await fileExists(WEEKLY_USERS_PATH))) return [];
  const raw = await readFile(WEEKLY_USERS_PATH, "utf8");
  return JSON.parse(raw) as SynthUser[];
}

async function saveWeeklyUsers(all: SynthUser[]): Promise<void> {
  await mkdir(dirname(WEEKLY_USERS_PATH), { recursive: true });
  await writeFile(WEEKLY_USERS_PATH, `${JSON.stringify(all, null, 2)}\n`, "utf8");
}

function weekStartFrom(now: Date): Date {
  return new Date(now.getTime() - WEEK_MS);
}

function handleFromName(first: string, last: string, used: Set<string>, rng: Rng): string {
  const base = `${first}.${last}`
    .toLowerCase()
    .replace(/[^a-z0-9.]/g, "")
    .slice(0, 20);
  for (const candidate of [base, `${first.toLowerCase()}${last.charAt(0).toLowerCase()}`, `${base}${rng.int(10, 9999)}`]) {
    if (candidate && !used.has(candidate)) {
      used.add(candidate);
      return candidate;
    }
  }
  let i = 1;
  while (used.has(`${base}${i}`)) i += 1;
  used.add(`${base}${i}`);
  return `${base}${i}`;
}

function generateNewUsers(count: number, existing: SynthUser[], now: Date, rng: Rng): SynthUser[] {
  const activePersonas = PERSONAS.filter((p): p is Persona => p.status === "active");
  const weightedPersonas = activePersonas.map((p) => ({ value: p, weight: p.weight }));
  const usedHandles = new Set(existing.map((u) => u.handle));
  const usedEmails = new Set(existing.map((u) => u.email));
  const users: SynthUser[] = [];
  for (let i = 0; i < count; i += 1) {
    const persona = rng.weighted(weightedPersonas);
    const firstName = faker.person.firstName();
    const lastName = faker.person.lastName();
    const handle = handleFromName(firstName, lastName, usedHandles, rng);
    const domain = faker.helpers.arrayElement(["gmail.com", "hotmail.com", "outlook.com", "proton.me", "icloud.com"]);
    let email = `${handle}@${domain}`.toLowerCase();
    while (usedEmails.has(email)) email = `${handle}.${rng.int(10, 9999)}@${domain}`.toLowerCase();
    usedEmails.add(email);
    const signupDate = new Date(now.getTime() - rng.int(0, WEEK_DAYS - 1) * 86_400_000);
    signupDate.setUTCHours(rng.int(0, 23), rng.int(0, 59), 0, 0);
    const place = rng.weighted(PLACES.map((p) => ({ value: p, weight: p.weight })));
    const plan = rng.weighted<Plan>(persona.planMix.map((pm) => ({ value: pm.plan, weight: pm.weight })));
    const primarySport = rng.pick(persona.primarySports);
    users.push({
      id: faker.string.uuid(),
      email,
      name: `${firstName} ${lastName}`,
      firstName,
      lastName,
      handle,
      avatar: USER_AVATARS[rng.int(0, USER_AVATARS.length - 1)],
      city: place.city,
      country: place.country,
      bio: rng.pick(persona.bioSamples),
      signupDate: signupDate.toISOString(),
      persona: persona.id,
      status: "active" as UserStatus,
      plan,
      primarySport,
      activityTarget: rng.int(0, 2),
      kudosGivenRate: persona.kudosGivenRate,
      followsGivenTarget: rng.int(persona.followsGivenRange[0], persona.followsGivenRange[1]),
      clubJoinChance: persona.clubJoinChance,
      challengeJoinChance: persona.challengeJoinChance,
      supportLikelihood: persona.supportLikelihood,
      cohortId: cohortTag(),
    });
  }
  return users;
}

async function upsertUsersInDb(client: PoolClient, users: SynthUser[]): Promise<void> {
  if (users.length === 0) return;
  await bulkInsert(
    client,
    "users",
    ["id", "email", "name", "handle", "avatar_url", "city", "country", "bio", "created_at"],
    users,
    (u) => [u.id, u.email, u.name, u.handle, u.avatar, u.city, u.country, u.bio, new Date(u.signupDate)],
    `ON CONFLICT (id) DO UPDATE SET
       email = EXCLUDED.email,
       name = EXCLUDED.name,
       handle = EXCLUDED.handle,
       avatar_url = EXCLUDED.avatar_url,
       city = EXCLUDED.city,
       country = EXCLUDED.country,
       bio = EXCLUDED.bio`,
  );
}

interface ActivityRow {
  id: string;
  athleteId: string;
  sport: Sport;
  title: string;
  description: string | null;
  date: Date;
  distanceKm: number;
  movingSeconds: number;
  elevationM: number;
  avgHr: number | null;
  avgPaceSecPerKm: number | null;
  avgSpeedKmh: number | null;
  achievements: number;
  photo: string | null;
  routeSeed: number;
}

function generateWeeklyActivities(
  users: SynthUser[],
  weekStart: Date,
  now: Date,
  rng: Rng,
): ActivityRow[] {
  const activities: ActivityRow[] = [];
  const weekLabel = weekStart.toISOString().slice(0, 10);
  for (const user of users) {
    if (user.status !== "active") continue;
    const signup = new Date(user.signupDate);
    const effectiveStart = signup > weekStart ? signup : weekStart;
    if (effectiveStart > now) continue;
    const persona = personaById(user.persona);
    const [minPerWeek, maxPerWeek] = persona.activitiesPerWeek;
    const userRng = rng.derive(user.id);
    const count = userRng.int(Math.floor(minPerWeek), Math.ceil(maxPerWeek));
    for (let i = 0; i < count; i += 1) {
      const sport = userRng.weighted<Sport>(persona.sportMix.map((m) => ({ value: m.sport, weight: m.weight })));
      const profile = SPORT_PROFILES[sport];
      const rangeMs = now.getTime() - effectiveStart.getTime();
      const date = new Date(effectiveStart.getTime() + userRng.next() * rangeMs);
      const distanceKm = userRng.float(profile.distanceKm[0], profile.distanceKm[1]);
      const avgHr = userRng.int(profile.avgHr[0], profile.avgHr[1]);
      const elevationM = userRng.int(profile.elevationM[0], profile.elevationM[1]);
      let movingSeconds: number;
      let avgPaceSecPerKm: number | null = null;
      let avgSpeedKmh: number | null = null;
      if (profile.speedKmh) {
        const speed = userRng.float(profile.speedKmh[0], profile.speedKmh[1]);
        avgSpeedKmh = Math.round(speed * 10) / 10;
        movingSeconds = Math.floor((distanceKm / speed) * 3600);
      } else if (profile.paceSecPerKm) {
        const pace = userRng.int(profile.paceSecPerKm[0], profile.paceSecPerKm[1]);
        avgPaceSecPerKm = pace;
        movingSeconds = Math.floor(distanceKm * pace);
      } else {
        movingSeconds = Math.floor(distanceKm * 360);
      }
      activities.push({
        id: `act-${user.id}-weekly-${weekLabel}-${i}`,
        athleteId: user.id,
        sport,
        title: userRng.pick(profile.titles),
        description: userRng.chance(profile.descriptionChance) ? userRng.pick(ACTIVITY_DESCRIPTIONS) : null,
        date,
        distanceKm: Math.round(distanceKm * 100) / 100,
        movingSeconds,
        elevationM,
        avgHr,
        avgPaceSecPerKm,
        avgSpeedKmh,
        achievements: userRng.int(0, 2),
        photo: userRng.chance(profile.photoChance) ? userRng.pick(ACTIVITY_PHOTOS) : null,
        routeSeed: userRng.int(1, 1_000_000),
      });
    }
  }
  return activities;
}

async function insertActivities(client: PoolClient, rows: ActivityRow[]): Promise<void> {
  if (rows.length === 0) return;
  await bulkInsert(
    client,
    "activities",
    [
      "id", "athlete_id", "sport", "title", "description", "date",
      "distance_km", "moving_seconds", "elevation_m",
      "avg_hr", "avg_pace_sec_per_km", "avg_speed_kmh",
      "kudos", "achievements", "photo", "route_seed",
    ],
    rows,
    (a) => [
      a.id, a.athleteId, a.sport, a.title, a.description, a.date,
      a.distanceKm, a.movingSeconds, a.elevationM,
      a.avgHr, a.avgPaceSecPerKm, a.avgSpeedKmh,
      0, a.achievements, a.photo, a.routeSeed,
    ],
    "ON CONFLICT (id) DO NOTHING",
    500,
  );
}

// ---------- PostHog ----------

type PHEvent = {
  event: string;
  distinct_id: string;
  timestamp: string;
  properties: Record<string, unknown>;
};

async function sendPosthog(events: PHEvent[]): Promise<void> {
  if (events.length === 0) return;
  const env = loadEnv();
  const apiKey = requireEnv("POSTHOG_API_KEY");
  const host = env.VITE_PUBLIC_POSTHOG_HOST.replace(/\/$/, "");
  for (let i = 0; i < events.length; i += 500) {
    const chunk = events.slice(i, i + 500);
    const res = await fetch(`${host}/batch/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: apiKey, historical_migration: true, batch: chunk }),
    });
    if (!res.ok) throw new Error(`PostHog batch failed: ${res.status} ${await res.text()}`);
  }
}

function registrationEvents(newUsers: SynthUser[]): PHEvent[] {
  return newUsers.map((u) => ({
    event: "user_registered",
    distinct_id: u.id,
    timestamp: new Date(u.signupDate).toISOString(),
    properties: {
      cohort_id: cohortTag(),
      persona: u.persona,
      plan: u.plan,
      primary_sport: u.primarySport,
      city: u.city,
      country: u.country,
      $set: {
        email: u.email, name: u.name, handle: u.handle,
        persona: u.persona, plan: u.plan, status: u.status,
        city: u.city, country: u.country, primary_sport: u.primarySport,
        signup_date: u.signupDate, cohort_id: cohortTag(),
      },
    },
  }));
}

function activityEvents(activities: ActivityRow[]): PHEvent[] {
  return activities.map((a) => ({
    event: "activity_created",
    distinct_id: a.athleteId,
    timestamp: a.date.toISOString(),
    properties: {
      cohort_id: cohortTag(),
      activity_id: a.id,
      sport: a.sport,
      distance_km: a.distanceKm,
      moving_seconds: a.movingSeconds,
      elevation_m: a.elevationM,
      has_photo: a.photo !== null,
    },
  }));
}

function sessionEvents(users: SynthUser[], weekStart: Date, now: Date, rng: Rng): PHEvent[] {
  const events: PHEvent[] = [];
  const PAGES = ["/feed", "/feed", "/profile", "/activities", "/segments", "/clubs", "/challenges"];
  for (const user of users) {
    if (user.status !== "active") continue;
    const persona = personaById(user.persona);
    const sessions = Math.max(0, Math.floor(rng.float(persona.activitiesPerWeek[0], persona.activitiesPerWeek[1]) * 1.2));
    for (let s = 0; s < sessions; s += 1) {
      const sessionStart = new Date(weekStart.getTime() + rng.next() * (now.getTime() - weekStart.getTime()));
      events.push({
        event: "user_logged_in",
        distinct_id: user.id,
        timestamp: sessionStart.toISOString(),
        properties: { cohort_id: cohortTag(), auth_method: "email" },
      });
      events.push({
        event: "bootstrap_loaded",
        distinct_id: user.id,
        timestamp: new Date(sessionStart.getTime() + 500).toISOString(),
        properties: { cohort_id: cohortTag() },
      });
      const pvCount = rng.int(2, 4);
      let cursor = sessionStart.getTime() + 500;
      for (let p = 0; p < pvCount; p += 1) {
        cursor += rng.int(5_000, 90_000);
        const path = rng.pick(PAGES);
        events.push({
          event: "$pageview",
          distinct_id: user.id,
          timestamp: new Date(cursor).toISOString(),
          properties: {
            cohort_id: cohortTag(),
            $current_url: `https://stride.app${path}`,
            $pathname: path,
          },
        });
      }
    }
  }
  return events;
}

// ---------- Intercom ----------

function pickFilers(users: SynthUser[], rng: Rng, count: number): SynthUser[] {
  const weighted = users
    .filter((u) => u.status === "active" || u.status === "dormant")
    .map((u) => ({ value: u, weight: Math.max(0.01, u.supportLikelihood) }));
  const picked: SynthUser[] = [];
  const seen = new Set<string>();
  while (picked.length < count && seen.size < weighted.length) {
    const candidate = rng.weighted(weighted);
    if (!seen.has(candidate.id)) {
      seen.add(candidate.id);
      picked.push(candidate);
    }
  }
  return picked;
}

function pickScenario(user: SynthUser, rng: Rng): Scenario {
  const weighted = SCENARIOS.map((s) => {
    const bias = s.personaBias[user.persona as PersonaId] ?? 1;
    return { value: s, weight: s.weight * bias };
  });
  return rng.weighted(weighted);
}

async function generateTicketBody(
  client: Anthropic,
  scenario: Scenario,
  user: SynthUser,
): Promise<{ title: string; body: string }> {
  const system = `You write realistic support messages FROM a user's perspective to Stride (a Strava-like app). Return JSON only: {"title":"...","body":"..."}. Title 4-10 words, specific. Body 2-5 sentences, first person.

SCENARIO:
${scenario.instructions}`;
  const userLines = [
    `User: ${user.name} (${user.firstName})`,
    `Persona: ${personaById(user.persona).label}`,
    `Plan: ${user.plan}`,
    `City: ${user.city}`,
    `Primary sport: ${user.primarySport}`,
    "",
    "Write the message.",
  ];
  try {
    const resp = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 500,
      system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: userLines.join("\n") }],
    });
    const block = resp.content[0];
    if (!block || block.type !== "text") throw new Error("No text");
    let text = block.text.trim();
    if (text.startsWith("```")) text = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
    const first = text.indexOf("{");
    const last = text.lastIndexOf("}");
    const parsed = JSON.parse(text.slice(first, last + 1));
    return { title: String(parsed.title).trim(), body: String(parsed.body).trim() };
  } catch {
    return { title: scenario.label, body: `Having trouble with ${scenario.label.toLowerCase()}. Can someone help?` };
  }
}

async function upsertIntercomContact(
  client: IntercomClient,
  user: SynthUser,
): Promise<string> {
  try {
    const existing = await client.contacts.showContactByExternalId({ external_id: user.id });
    if (existing && (existing as { id?: string }).id) return (existing as { id: string }).id;
  } catch {
    // not found
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
  return (created as { id: string }).id;
}

interface IntercomItem {
  kind: "conversation" | "ticket";
  userId: string;
  user: SynthUser;
  scenario: Scenario;
  platform: string;
  intercomContactId?: string;
  conversationId?: string;
  ticketId?: string;
  title: string;
  body: string;
}

async function runIntercomBatch(
  anthropicClient: Anthropic,
  items: IntercomItem[],
): Promise<IntercomItem[]> {
  const token = requireEnv("INTERCOM_ACCESS_TOKEN");
  const intercom = new IntercomClient({ token });
  const ticketTypeId = requireEnv("INTERCOM_TICKET_TYPE_ID");

  console.log(`Generating ${items.length} Intercom message bodies…`);
  const withContent = await mapWithConcurrency(items, 4, async (item) => {
    const { title, body } = await generateTicketBody(anthropicClient, item.scenario, item.user);
    return { ...item, title, body };
  });

  console.log(`Creating Intercom contacts/conversations/tickets…`);
  const contactCache = new Map<string, string>();
  await mapWithConcurrency(withContent, 3, async (item) => {
    let contactId = contactCache.get(item.userId);
    if (!contactId) {
      contactId = await upsertIntercomContact(intercom, item.user);
      contactCache.set(item.userId, contactId);
    }
    item.intercomContactId = contactId;
    if (item.kind === "conversation") {
      const resp = await intercom.conversations.create({
        from: { type: "user", id: contactId },
        body: item.body,
      } as Parameters<typeof intercom.conversations.create>[0]);
      const id = (resp as { conversation_id?: string; id?: string }).conversation_id ?? (resp as { id?: string }).id;
      if (!id) throw new Error(`no conversation id: ${JSON.stringify(resp)}`);
      item.conversationId = id;
    } else {
      const resp = await intercom.tickets.create({
        ticket_type_id: ticketTypeId,
        contacts: [{ id: contactId }],
        ticket_attributes: {
          _default_title_: item.title,
          _default_description_: item.body,
          Platforms: item.platform,
          "Root cause": item.scenario.rootCause,
        },
      } as Parameters<typeof intercom.tickets.create>[0]);
      const id = (resp as { id?: string })?.id;
      if (!id) throw new Error(`no ticket id: ${JSON.stringify(resp)}`);
      item.ticketId = id;
    }
  });

  return withContent;
}

// ---------- Linear ----------

interface LinearIssueSpec {
  kind: IssueType;
  theme: string;
  areaLabels: AreaLabel[];
  priority: number;
  stateType: "backlog" | "unstarted" | "started";
  projectName: ProjectName | null;
  conversationId?: string;
  title?: string;
  body?: string;
  identifier?: string;
}

function buildLinearSpecs(
  conversations: IntercomItem[],
  rng: Rng,
  count: number,
): LinearIssueSpec[] {
  const specs: LinearIssueSpec[] = [];
  const eligibleConvos = conversations.filter((c) => c.kind === "conversation" && c.conversationId);
  const linkedCount = Math.min(Math.floor(count / 2), eligibleConvos.length);
  const chosen = rng.shuffle(eligibleConvos).slice(0, linkedCount);

  for (const convo of chosen) {
    const areas = SCENARIO_TO_AREAS[convo.scenario.rootCause] ?? ["stability"];
    specs.push({
      kind: "bug-from-intercom",
      theme: convo.title,
      areaLabels: areas,
      priority: rng.weighted([
        { value: 1, weight: 15 },
        { value: 2, weight: 40 },
        { value: 3, weight: 35 },
        { value: 4, weight: 10 },
      ]),
      stateType: rng.weighted([
        { value: "backlog", weight: 45 },
        { value: "unstarted", weight: 40 },
        { value: "started", weight: 15 },
      ]),
      projectName: "Q2 Reliability",
      conversationId: convo.conversationId!,
    });
  }

  const remaining = count - specs.length;
  for (let i = 0; i < remaining; i += 1) {
    const kind: IssueType = rng.weighted([
      { value: "bug-eng", weight: 30 },
      { value: "feature", weight: 40 },
      { value: "tech-debt", weight: 30 },
    ]);
    const theme =
      kind === "feature"
        ? rng.pick(FEATURE_THEMES)
        : kind === "tech-debt"
          ? rng.pick(TECH_DEBT_THEMES)
          : rng.pick(ENG_BUG_THEMES);
    const areas = rng.shuffle(AREA_LABELS).slice(0, rng.int(1, 2)) as AreaLabel[];
    specs.push({
      kind,
      theme,
      areaLabels: areas,
      priority: rng.weighted([
        { value: 2, weight: 20 },
        { value: 3, weight: 50 },
        { value: 4, weight: 25 },
        { value: 0, weight: 5 },
      ]),
      stateType: "backlog",
      projectName:
        kind === "feature"
          ? "New Metrics"
          : kind === "tech-debt"
            ? "Platform Foundations"
            : null,
    });
  }

  return specs;
}

async function generateLinearBody(
  client: Anthropic,
  spec: LinearIssueSpec,
): Promise<{ title: string; body: string }> {
  const system = ENG_INSTRUCTIONS[spec.kind];
  const lines = [`Theme/hint: ${spec.theme}`, `Area: ${spec.areaLabels.join(", ")}`];
  if (spec.conversationId) {
    lines.push(`Linked Intercom conversation id: ${spec.conversationId}`);
    lines.push(`Scenario: ${spec.theme}`);
  }
  lines.push("", "Write the Linear ticket.");
  try {
    const resp = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 900,
      system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: lines.join("\n") }],
    });
    const block = resp.content[0];
    if (!block || block.type !== "text") throw new Error("No text");
    let text = block.text.trim();
    if (text.startsWith("```")) text = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
    const first = text.indexOf("{");
    const last = text.lastIndexOf("}");
    const parsed = JSON.parse(text.slice(first, last + 1));
    return { title: String(parsed.title).trim(), body: String(parsed.body).trim() };
  } catch {
    return { title: spec.theme.slice(0, 70), body: `## Summary\n${spec.theme}` };
  }
}

async function runLinearBatch(
  anthropic: Anthropic,
  specs: LinearIssueSpec[],
): Promise<LinearIssueSpec[]> {
  const linearClient = new LinearClient({ apiKey: requireEnv("LINEAR_API_KEY") });
  const teamKey = requireEnv("LINEAR_TEAM_KEY");
  const teams = await linearClient.teams({ filter: { key: { eq: teamKey } } });
  if (teams.nodes.length === 0) throw new Error(`Team ${teamKey} not found`);
  const team = teams.nodes[0];

  const labels = await linearClient.issueLabels({ first: 250 });
  const labelsByLower = new Map<string, string>();
  for (const l of labels.nodes) labelsByLower.set(l.name.toLowerCase(), l.id);

  const states = await linearClient.workflowStates({ filter: { team: { id: { eq: team.id } } }, first: 50 });
  const stateByType = new Map<string, string>();
  for (const s of states.nodes) if (!stateByType.has(s.type)) stateByType.set(s.type, s.id);

  const projects = await linearClient.projects({ filter: { accessibleTeams: { some: { id: { eq: team.id } } } }, first: 50 });
  const projectsByName = new Map<string, string>();
  for (const p of projects.nodes) projectsByName.set(p.name, p.id);

  console.log(`Generating ${specs.length} Linear issue bodies…`);
  for (const spec of specs) {
    const { title, body } = await generateLinearBody(anthropic, spec);
    spec.title = title;
    spec.body = body;
  }

  console.log(`Creating Linear issues…`);
  for (const spec of specs) {
    const labelIds = [
      labelsByLower.get(spec.kind === "feature" ? "feature" : spec.kind === "tech-debt" ? "tech-debt" : "bug"),
      ...spec.areaLabels.map((a) => labelsByLower.get(a)),
    ].filter((x): x is string => typeof x === "string");
    const stateId = stateByType.get(spec.stateType) ?? stateByType.get("backlog");
    const projectId = spec.projectName ? projectsByName.get(spec.projectName) : undefined;
    const payload = await linearClient.createIssue({
      teamId: team.id,
      title: (spec.title ?? spec.theme).slice(0, 255),
      description: spec.body,
      labelIds,
      priority: spec.priority,
      ...(stateId ? { stateId } : {}),
      ...(projectId ? { projectId } : {}),
    });
    const issue = await payload.issue;
    spec.identifier = issue?.identifier;
  }

  return specs;
}

async function appendLog(entry: WeeklyLogEntry): Promise<void> {
  let log: WeeklyLogEntry[] = [];
  if (await fileExists(WEEKLY_LOG_PATH)) {
    try {
      log = JSON.parse(await readFile(WEEKLY_LOG_PATH, "utf8"));
    } catch {
      log = [];
    }
  }
  log.push(entry);
  await mkdir(dirname(WEEKLY_LOG_PATH), { recursive: true });
  await writeFile(WEEKLY_LOG_PATH, `${JSON.stringify(log, null, 2)}\n`, "utf8");
}

async function main() {
  loadEnv();
  requireEnv("DB_URL");
  requireEnv("POSTHOG_API_KEY");
  requireEnv("INTERCOM_ACCESS_TOKEN");
  requireEnv("INTERCOM_TICKET_TYPE_ID");
  requireEnv("LINEAR_API_KEY");
  requireEnv("LINEAR_TEAM_KEY");
  requireEnv("ANTHROPIC_API_KEY");

  const env = loadEnv();
  const now = new Date();
  const weekStart = weekStartFrom(now);
  const runSeed = env.SYNTH_RNG_SEED + Math.floor(now.getTime() / WEEK_MS);
  faker.seed(runSeed);
  const rng = new Rng(runSeed);

  console.log(`Weekly run. week_start=${weekStart.toISOString().slice(0, 10)}  seed=${runSeed}`);

  const baseUsers = await loadBaseUsers();
  const existingWeekly = await loadWeeklyUsers();
  const allExisting = [...baseUsers, ...existingWeekly];

  // 1) New users
  const newUsers = generateNewUsers(NEW_USERS_PER_RUN, allExisting, now, rng);
  console.log(`Generated ${newUsers.length} new users.`);
  await saveWeeklyUsers([...existingWeekly, ...newUsers]);
  const usersForActivity = [...allExisting, ...newUsers];

  // 2) DB writes (users + weekly activities)
  const pool = getPool();
  const client = await pool.connect();
  let activities: ActivityRow[] = [];
  try {
    await client.query("BEGIN");
    await upsertUsersInDb(client, newUsers);
    activities = generateWeeklyActivities(usersForActivity, weekStart, now, rng);
    console.log(`Inserting ${activities.length} activities for the week…`);
    await insertActivities(client, activities);
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  // 3) PostHog events
  const phEvents = [
    ...registrationEvents(newUsers),
    ...activityEvents(activities),
    ...sessionEvents(usersForActivity, weekStart, now, rng),
  ];
  console.log(`Sending ${phEvents.length} PostHog events…`);
  await sendPosthog(phEvents);

  // 4) Intercom conversations + tickets
  const anthropic = new Anthropic({ apiKey: requireEnv("ANTHROPIC_API_KEY") });
  const convFilers = pickFilers(usersForActivity, rng, INTERCOM_CONVERSATIONS_PER_RUN);
  const ticketFilers = pickFilers(
    usersForActivity.filter((u) => !convFilers.find((c) => c.id === u.id)),
    rng,
    INTERCOM_TICKETS_PER_RUN,
  );
  const intercomItems: IntercomItem[] = [
    ...convFilers.map((user) => {
      const scenario = pickScenario(user, rng);
      return {
        kind: "conversation" as const,
        userId: user.id,
        user,
        scenario,
        platform: rng.pick(scenario.platforms),
        title: "",
        body: "",
      };
    }),
    ...ticketFilers.map((user) => {
      const scenario = pickScenario(user, rng);
      return {
        kind: "ticket" as const,
        userId: user.id,
        user,
        scenario,
        platform: rng.pick(scenario.platforms),
        title: "",
        body: "",
      };
    }),
  ];
  const finishedIntercom = await runIntercomBatch(anthropic, intercomItems);

  // 5) Linear issues (some linked to above conversations)
  const linearSpecs = buildLinearSpecs(finishedIntercom, rng, LINEAR_ISSUES_PER_RUN);
  const finishedLinear = await runLinearBatch(anthropic, linearSpecs);

  // 6) Log
  const entry: WeeklyLogEntry = {
    runAt: now.toISOString(),
    weekStart: weekStart.toISOString().slice(0, 10),
    newUsers: newUsers.length,
    newActivities: activities.length,
    newPosthogEvents: phEvents.length,
    newConversations: finishedIntercom.filter((i) => i.kind === "conversation").length,
    newTickets: finishedIntercom.filter((i) => i.kind === "ticket").length,
    newLinearIssues: finishedLinear.filter((s) => s.identifier).length,
  };
  await appendLog(entry);

  await closePool();
  console.log("Weekly run done:", entry);
}

main().catch(async (err) => {
  console.error(err);
  await closePool().catch(() => {});
  process.exit(1);
});
