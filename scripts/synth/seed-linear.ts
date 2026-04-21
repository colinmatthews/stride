import { LinearClient } from "@linear/sdk";
import Anthropic from "@anthropic-ai/sdk";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { loadEnv, requireEnv } from "./lib/config.js";
import { closePool } from "./lib/db.js";
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
  type TypeLabel,
} from "./fixtures/engineering.js";
import type { RootCause } from "./fixtures/scenarios.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const INTERCOM_PATH = resolve(__dirname, "../../data/synth-intercom.json");
const OUTPUT_PATH = resolve(__dirname, "../../data/synth-linear.json");
const CONTENT_CACHE_PATH = resolve(__dirname, "../../data/synth-linear-content.json");

const ISSUE_COUNT = 80;
const BUG_FROM_INTERCOM_COUNT = 25;
const BUG_ENG_COUNT = 15;
const FEATURE_COUNT = 24;
const TECH_DEBT_COUNT = 16;

interface LinkedConversation {
  userId: string;
  conversationId: string;
  scenario: RootCause;
  title: string;
}

interface IssueSpec {
  kind: IssueType;
  typeLabel: TypeLabel;
  areaLabels: AreaLabel[];
  priority: number;
  estimate: number | null;
  cycleSlot: "current" | "next" | null;
  projectName: ProjectName | null;
  stateType: "backlog" | "unstarted" | "started" | "completed" | "canceled";
  createdAt: Date;
  theme: string;
  conversation?: LinkedConversation;
}

interface GeneratedContent {
  title: string;
  body: string;
}

interface LinearOutput {
  teamId: string;
  teamKey: string;
  labelsCreated: string[];
  cyclesCreated: { name: string; id: string; startsAt: string; endsAt: string }[];
  projectsCreated: { name: string; id: string }[];
  issues: {
    id: string;
    identifier: string;
    title: string;
    kind: IssueType;
    priority: number;
    stateType: string;
    projectName: string | null;
    areaLabels: string[];
    conversationId?: string;
  }[];
  failures: { kind: string; error: string }[];
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function loadIntercomConversations(): Promise<LinkedConversation[]> {
  if (!(await fileExists(INTERCOM_PATH))) return [];
  const raw = await readFile(INTERCOM_PATH, "utf8");
  const parsed = JSON.parse(raw) as {
    conversations: { userId: string; conversationId: string; scenario: string; title: string }[];
    tickets: { userId: string; ticketId: string; scenario: string; title: string }[];
  };
  return parsed.conversations.map((c) => ({
    userId: c.userId,
    conversationId: c.conversationId,
    scenario: c.scenario as RootCause,
    title: c.title,
  }));
}

function priorityFor(kind: IssueType, rng: Rng): number {
  if (kind === "bug-from-intercom" || kind === "bug-eng") {
    return rng.weighted([
      { value: 1, weight: 15 },
      { value: 2, weight: 35 },
      { value: 3, weight: 35 },
      { value: 4, weight: 10 },
      { value: 0, weight: 5 },
    ]);
  }
  if (kind === "feature") {
    return rng.weighted([
      { value: 2, weight: 20 },
      { value: 3, weight: 45 },
      { value: 4, weight: 25 },
      { value: 0, weight: 10 },
    ]);
  }
  return rng.weighted([
    { value: 2, weight: 15 },
    { value: 3, weight: 40 },
    { value: 4, weight: 30 },
    { value: 0, weight: 15 },
  ]);
}

function estimateFor(kind: IssueType, rng: Rng): number | null {
  if (kind === "feature") return rng.pick([2, 3, 5, 8, 13]);
  if (kind === "tech-debt") return rng.pick([2, 3, 5, 8]);
  if (!rng.chance(0.6)) return null;
  return rng.pick([1, 2, 3, 5]);
}

function stateTypeFor(kind: IssueType, rng: Rng): IssueSpec["stateType"] {
  return rng.weighted([
    { value: "backlog", weight: 30 },
    { value: "unstarted", weight: 25 },
    { value: "started", weight: 20 },
    { value: "completed", weight: 15 },
    { value: "canceled", weight: 5 },
    { value: "unstarted", weight: 5 },
  ]);
}

function projectFor(kind: IssueType, rng: Rng): ProjectName | null {
  if (kind === "bug-from-intercom" || kind === "bug-eng") {
    return rng.weighted<ProjectName | null>([
      { value: "Q2 Reliability", weight: 55 },
      { value: "Platform Foundations", weight: 10 },
      { value: null, weight: 35 },
    ]);
  }
  if (kind === "feature") {
    return rng.weighted<ProjectName | null>([
      { value: "New Metrics", weight: 65 },
      { value: null, weight: 35 },
    ]);
  }
  return rng.weighted<ProjectName | null>([
    { value: "Platform Foundations", weight: 60 },
    { value: "Q2 Reliability", weight: 15 },
    { value: null, weight: 25 },
  ]);
}

function cycleSlotFor(state: IssueSpec["stateType"], rng: Rng): "current" | "next" | null {
  if (state === "started") return rng.weighted([{ value: "current", weight: 85 }, { value: "next", weight: 10 }, { value: null, weight: 5 }]);
  if (state === "completed" || state === "canceled") return rng.weighted([{ value: "current", weight: 40 }, { value: null, weight: 60 }]);
  if (state === "unstarted") return rng.weighted([{ value: "current", weight: 30 }, { value: "next", weight: 35 }, { value: null, weight: 35 }]);
  return rng.weighted([{ value: "next", weight: 20 }, { value: null, weight: 80 }]);
}

function buildSpecs(conversations: LinkedConversation[], rng: Rng): IssueSpec[] {
  const specs: IssueSpec[] = [];
  const now = new Date();
  const sampledConvos = rng.shuffle(conversations).slice(0, BUG_FROM_INTERCOM_COUNT);

  const pushSpec = (
    kind: IssueType,
    theme: string,
    areaLabels: AreaLabel[],
    conversation?: LinkedConversation,
  ) => {
    const typeLabel: TypeLabel = kind === "feature" ? "feature" : kind === "tech-debt" ? "tech-debt" : "bug";
    const stateType = stateTypeFor(kind, rng);
    const cycleSlot = cycleSlotFor(stateType, rng);
    const createdDaysAgo = rng.weighted([
      { value: rng.int(0, 14), weight: 40 },
      { value: rng.int(15, 45), weight: 40 },
      { value: rng.int(46, 75), weight: 20 },
    ]);
    const createdAt = new Date(now.getTime() - createdDaysAgo * 86_400_000);
    specs.push({
      kind,
      typeLabel,
      areaLabels,
      priority: priorityFor(kind, rng),
      estimate: estimateFor(kind, rng),
      cycleSlot,
      projectName: projectFor(kind, rng),
      stateType,
      createdAt,
      theme,
      conversation,
    });
  };

  for (const convo of sampledConvos) {
    const areas = SCENARIO_TO_AREAS[convo.scenario] ?? ["stability"];
    pushSpec("bug-from-intercom", convo.title, areas, convo);
  }
  for (let i = 0; i < BUG_ENG_COUNT; i += 1) {
    const theme = rng.pick(ENG_BUG_THEMES);
    const areas = rng.shuffle(AREA_LABELS).slice(0, rng.int(1, 2)) as AreaLabel[];
    pushSpec("bug-eng", theme, areas);
  }
  for (let i = 0; i < FEATURE_COUNT; i += 1) {
    const theme = rng.pick(FEATURE_THEMES);
    const areas = rng.shuffle(AREA_LABELS).slice(0, rng.int(1, 2)) as AreaLabel[];
    pushSpec("feature", theme, areas);
  }
  for (let i = 0; i < TECH_DEBT_COUNT; i += 1) {
    const theme = rng.pick(TECH_DEBT_THEMES);
    const areas = rng.shuffle(AREA_LABELS).slice(0, rng.int(1, 2)) as AreaLabel[];
    pushSpec("tech-debt", theme, areas);
  }

  return specs;
}

async function generateContents(specs: IssueSpec[]): Promise<GeneratedContent[]> {
  if (await fileExists(CONTENT_CACHE_PATH)) {
    const raw = await readFile(CONTENT_CACHE_PATH, "utf8");
    const parsed = JSON.parse(raw) as GeneratedContent[];
    if (parsed.length === specs.length) {
      console.log(`Reusing ${parsed.length} cached issue bodies from ${CONTENT_CACHE_PATH}`);
      return parsed;
    }
  }

  console.log(`Generating ${specs.length} issue bodies via Claude Haiku (concurrency 6)…`);
  const client = new Anthropic({ apiKey: requireEnv("ANTHROPIC_API_KEY") });
  const t0 = Date.now();
  const contents = await mapWithConcurrency(specs, 6, async (spec, i) => {
    const systemText = ENG_INSTRUCTIONS[spec.kind];
    const userLines: string[] = [`Theme/hint: ${spec.theme}`, `Area: ${spec.areaLabels.join(", ")}`];
    if (spec.conversation) {
      userLines.push(`Linked Intercom conversation id: ${spec.conversation.conversationId}`);
      userLines.push(`Customer-facing title: ${spec.conversation.title}`);
      userLines.push(`Scenario category: ${spec.conversation.scenario}`);
    }
    userLines.push("", "Write the Linear ticket now.");
    try {
      const resp = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 900,
        system: [
          {
            type: "text",
            text: systemText,
            cache_control: { type: "ephemeral" },
          },
        ],
        messages: [{ role: "user", content: userLines.join("\n") }],
      });
      const block = resp.content[0];
      if (!block || block.type !== "text") throw new Error("No text block");
      let text = block.text.trim();
      if (text.startsWith("```")) {
        text = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
      }
      const first = text.indexOf("{");
      const last = text.lastIndexOf("}");
      const parsed = JSON.parse(text.slice(first, last + 1));
      if ((i + 1) % 20 === 0) console.log(`  generated ${i + 1}/${specs.length}`);
      return { title: String(parsed.title).trim(), body: String(parsed.body).trim() };
    } catch {
      return {
        title: spec.theme.slice(0, 70),
        body: `## Summary\n${spec.theme}\n\n## Notes\nAuto-generated fallback.`,
      };
    }
  });
  console.log(`Content generation took ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  await mkdir(dirname(CONTENT_CACHE_PATH), { recursive: true });
  await writeFile(CONTENT_CACHE_PATH, `${JSON.stringify(contents, null, 2)}\n`, "utf8");
  return contents;
}

async function getOrCreateTeam(client: LinearClient, teamKey: string): Promise<{ id: string; key: string }> {
  const teams = await client.teams({ filter: { key: { eq: teamKey } } });
  if (teams.nodes.length > 0) {
    const t = teams.nodes[0];
    return { id: t.id, key: t.key };
  }
  throw new Error(
    `Linear team with key "${teamKey}" not found. Create the team in the Linear UI first (Settings → Teams → New team) and set its key to ${teamKey}.`,
  );
}

async function ensureLabels(
  client: LinearClient,
  teamId: string,
): Promise<Map<string, string>> {
  const allLabels = await client.issueLabels({ first: 250 });
  const byLower = new Map<string, string>();
  for (const label of allLabels.nodes) {
    byLower.set(label.name.toLowerCase(), label.id);
  }
  const byName = new Map<string, string>();
  const allRequired = [...TYPE_LABELS, ...AREA_LABELS];
  const created: string[] = [];
  for (const name of allRequired) {
    const existing = byLower.get(name.toLowerCase());
    if (existing) {
      byName.set(name, existing);
      continue;
    }
    const payload = await client.createIssueLabel({ teamId, name });
    const id = (await payload.issueLabel)?.id;
    if (!id) throw new Error(`createIssueLabel did not return id for ${name}`);
    byName.set(name, id);
    byLower.set(name.toLowerCase(), id);
    created.push(name);
  }
  if (created.length > 0) console.log(`  created labels: ${created.join(", ")}`);
  return byName;
}

async function ensureCycles(
  client: LinearClient,
  teamId: string,
): Promise<{ current: string; next: string; createdCycles: LinearOutput["cyclesCreated"] }> {
  const now = new Date();
  const cycleLength = 14;
  const currentStart = new Date(now.getTime() - 7 * 86_400_000);
  const currentEnd = new Date(currentStart.getTime() + cycleLength * 86_400_000);
  const nextStart = currentEnd;
  const nextEnd = new Date(nextStart.getTime() + cycleLength * 86_400_000);

  const cycles = await client.cycles({ filter: { team: { id: { eq: teamId } } }, first: 50 });
  const findCycle = (start: Date, end: Date) =>
    cycles.nodes.find(
      (c) =>
        c.startsAt &&
        c.endsAt &&
        Math.abs(new Date(c.startsAt).getTime() - start.getTime()) < 24 * 3_600_000 &&
        Math.abs(new Date(c.endsAt).getTime() - end.getTime()) < 24 * 3_600_000,
    );

  const createdCycles: LinearOutput["cyclesCreated"] = [];

  let currentCycle = findCycle(currentStart, currentEnd);
  if (!currentCycle) {
    const payload = await client.createCycle({
      teamId,
      name: "Current cycle",
      startsAt: currentStart,
      endsAt: currentEnd,
    });
    currentCycle = await payload.cycle;
    if (!currentCycle) throw new Error("createCycle did not return cycle");
    createdCycles.push({
      name: "Current cycle",
      id: currentCycle.id,
      startsAt: currentStart.toISOString(),
      endsAt: currentEnd.toISOString(),
    });
  }

  let nextCycle = findCycle(nextStart, nextEnd);
  if (!nextCycle) {
    const payload = await client.createCycle({
      teamId,
      name: "Next cycle",
      startsAt: nextStart,
      endsAt: nextEnd,
    });
    nextCycle = await payload.cycle;
    if (!nextCycle) throw new Error("createCycle did not return cycle");
    createdCycles.push({
      name: "Next cycle",
      id: nextCycle.id,
      startsAt: nextStart.toISOString(),
      endsAt: nextEnd.toISOString(),
    });
  }

  return { current: currentCycle.id, next: nextCycle.id, createdCycles };
}

async function ensureProjects(
  client: LinearClient,
  teamId: string,
): Promise<{ byName: Map<ProjectName, string>; created: LinearOutput["projectsCreated"] }> {
  const projects = await client.projects({ filter: { accessibleTeams: { some: { id: { eq: teamId } } } }, first: 100 });
  const byName = new Map<ProjectName, string>();
  for (const project of projects.nodes) {
    if (PROJECTS.some((p) => p.name === project.name)) {
      byName.set(project.name as ProjectName, project.id);
    }
  }
  const created: LinearOutput["projectsCreated"] = [];
  for (const spec of PROJECTS) {
    if (byName.has(spec.name)) continue;
    const payload = await client.createProject({
      name: spec.name,
      description: spec.description,
      color: spec.color,
      teamIds: [teamId],
    });
    const project = await payload.project;
    if (!project) throw new Error(`createProject did not return project for ${spec.name}`);
    byName.set(spec.name, project.id);
    created.push({ name: spec.name, id: project.id });
  }
  if (created.length > 0) console.log(`  created projects: ${created.map((p) => p.name).join(", ")}`);
  return { byName, created };
}

async function loadStateMap(
  client: LinearClient,
  teamId: string,
): Promise<Map<IssueSpec["stateType"], string>> {
  const states = await client.workflowStates({ filter: { team: { id: { eq: teamId } } }, first: 100 });
  const byType = new Map<IssueSpec["stateType"], string>();
  for (const state of states.nodes) {
    const type = state.type as IssueSpec["stateType"];
    if (byType.has(type)) continue;
    byType.set(type, state.id);
  }
  return byType;
}

async function main() {
  loadEnv();
  requireEnv("LINEAR_API_KEY");
  const teamKey = requireEnv("LINEAR_TEAM_KEY");

  if (await fileExists(OUTPUT_PATH)) {
    console.log(
      `Output file already exists at ${OUTPUT_PATH}. Delete it to re-run issue creation; exiting.`,
    );
    return;
  }

  const conversations = await loadIntercomConversations();
  console.log(`Loaded ${conversations.length} Intercom conversations for linking.`);

  const client = new LinearClient({ apiKey: requireEnv("LINEAR_API_KEY") });

  console.log(`Resolving team "${teamKey}"…`);
  const team = await getOrCreateTeam(client, teamKey);

  console.log("Ensuring labels…");
  const labelsByName = await ensureLabels(client, team.id);

  console.log("Ensuring cycles…");
  const { current: currentCycleId, next: nextCycleId, createdCycles } = await ensureCycles(
    client,
    team.id,
  );

  console.log("Ensuring projects…");
  const { byName: projectsByName, created: createdProjects } = await ensureProjects(client, team.id);

  console.log("Loading workflow states…");
  const stateByType = await loadStateMap(client, team.id);
  if (!stateByType.has("backlog") && !stateByType.has("unstarted")) {
    throw new Error(`Team ${teamKey} has no backlog/unstarted states. Check team workflow settings.`);
  }

  const rng = new Rng(loadEnv().SYNTH_RNG_SEED + 3);
  const specs = buildSpecs(conversations, rng);
  console.log(`Built ${specs.length} issue specs.`);

  const contents = await generateContents(specs);

  const output: LinearOutput = {
    teamId: team.id,
    teamKey: team.key,
    labelsCreated: [...labelsByName.keys()].filter((n) => n),
    cyclesCreated: createdCycles,
    projectsCreated: createdProjects,
    issues: [],
    failures: [],
  };

  console.log("Creating issues (concurrency 3)…");
  await mapWithConcurrency(specs, 3, async (spec, i) => {
    const content = contents[i];
    const labelIds = [
      labelsByName.get(spec.typeLabel),
      ...spec.areaLabels.map((a) => labelsByName.get(a)),
    ].filter((v): v is string => typeof v === "string");

    const stateId = stateByType.get(spec.stateType) ?? stateByType.get("backlog") ?? stateByType.get("unstarted");
    const cycleId =
      spec.cycleSlot === "current" ? currentCycleId : spec.cycleSlot === "next" ? nextCycleId : undefined;
    const projectId = spec.projectName ? projectsByName.get(spec.projectName) : undefined;

    try {
      const payload = await client.createIssue({
        teamId: team.id,
        title: content.title.slice(0, 255),
        description: content.body,
        labelIds,
        priority: spec.priority,
        ...(spec.estimate !== null ? { estimate: spec.estimate } : {}),
        ...(stateId ? { stateId } : {}),
        ...(cycleId ? { cycleId } : {}),
        ...(projectId ? { projectId } : {}),
        createdAt: spec.createdAt,
      });
      const issue = await payload.issue;
      if (!issue) throw new Error("createIssue did not return issue");
      output.issues.push({
        id: issue.id,
        identifier: issue.identifier,
        title: issue.title,
        kind: spec.kind,
        priority: spec.priority,
        stateType: spec.stateType,
        projectName: spec.projectName,
        areaLabels: spec.areaLabels,
        conversationId: spec.conversation?.conversationId,
      });
      if ((i + 1) % 20 === 0) console.log(`  created ${i + 1}/${specs.length}`);
    } catch (err) {
      output.failures.push({ kind: spec.kind, error: err instanceof Error ? err.message : String(err) });
    }
  });

  await mkdir(dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, `${JSON.stringify(output, null, 2)}\n`, "utf8");
  console.log({
    issuesCreated: output.issues.length,
    failures: output.failures.length,
    labelsTotal: output.labelsCreated.length,
    cyclesCreated: createdCycles.length,
    projectsCreated: createdProjects.length,
  });

  await closePool();
}

main().catch(async (err) => {
  console.error(err);
  await closePool().catch(() => {});
  process.exit(1);
});
