import { faker } from "@faker-js/faker";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { Sport } from "../../server/seed.js";
import { loadEnv } from "./lib/config.js";
import { Rng } from "./lib/rng.js";
import {
  PERSONAS,
  type Persona,
  type PersonaId,
  type Plan,
  type UserStatus,
} from "./fixtures/personas.js";
import { PLACES } from "./fixtures/places.js";
import { USER_AVATARS } from "./fixtures/sports.js";

export interface SynthUser {
  id: string;
  email: string;
  name: string;
  firstName: string;
  lastName: string;
  handle: string;
  avatar: string;
  city: string;
  country: string;
  bio: string;
  signupDate: string;
  lastActiveAt?: string;
  cancelledAt?: string;
  persona: PersonaId;
  status: UserStatus;
  plan: Plan;
  primarySport: Sport;
  activityTarget: number;
  kudosGivenRate: number;
  followsGivenTarget: number;
  clubJoinChance: number;
  challengeJoinChance: number;
  supportLikelihood: number;
  cohortId: string;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const OUTPUT_PATH = resolve(__dirname, "../../data/synth-users.json");
const WINDOW_DAYS = 90;

function handleFromName(first: string, last: string, rng: Rng, used: Set<string>): string {
  const base = `${first}.${last}`
    .toLowerCase()
    .replace(/[^a-z0-9.]/g, "")
    .slice(0, 20);
  const candidates = [
    base,
    `${first.toLowerCase()}${last.charAt(0).toLowerCase()}`,
    `${first.charAt(0).toLowerCase()}${last.toLowerCase()}`,
    `${base}${rng.int(10, 999)}`,
  ];
  for (const candidate of candidates) {
    if (candidate && !used.has(candidate)) {
      used.add(candidate);
      return candidate;
    }
  }
  let i = 1;
  while (used.has(`${base}${i}`)) i += 1;
  const fallback = `${base}${i}`;
  used.add(fallback);
  return fallback;
}

function allocatePersonaCounts(total: number): Record<PersonaId, number> {
  const weightSum = PERSONAS.reduce((sum, p) => sum + p.weight, 0);
  const counts: Partial<Record<PersonaId, number>> = {};
  let assigned = 0;
  PERSONAS.forEach((persona, index) => {
    const isLast = index === PERSONAS.length - 1;
    const share = isLast
      ? total - assigned
      : Math.round((persona.weight / weightSum) * total);
    counts[persona.id] = share;
    assigned += share;
  });
  return counts as Record<PersonaId, number>;
}

function signupDateFor(persona: Persona, rng: Rng, now: Date): Date {
  const [minDaysAgo, maxDaysAgo] = persona.signupWindowDays;
  const daysAgo = rng.int(minDaysAgo, maxDaysAgo);
  const d = new Date(now);
  d.setUTCDate(d.getUTCDate() - daysAgo);
  d.setUTCHours(rng.int(0, 23), rng.int(0, 59), rng.int(0, 59), 0);
  return d;
}

function lastActiveForDormant(persona: Persona, signupDate: Date, rng: Rng, now: Date): Date {
  if (!persona.dormantAfterDays) return now;
  const [minDaysAgo, maxDaysAgo] = persona.dormantAfterDays;
  const daysAgo = rng.int(minDaysAgo, maxDaysAgo);
  const candidate = new Date(now.getTime() - daysAgo * 86_400_000);
  return candidate < signupDate ? signupDate : candidate;
}

function cancelledAtFor(persona: Persona, signupDate: Date, rng: Rng, now: Date): Date | undefined {
  if (!persona.cancelledDaysAgo) return undefined;
  const [minDaysAgo, maxDaysAgo] = persona.cancelledDaysAgo;
  const daysAgo = rng.int(minDaysAgo, maxDaysAgo);
  const candidate = new Date(now.getTime() - daysAgo * 86_400_000);
  return candidate < signupDate ? signupDate : candidate;
}

function activityTargetFor(
  persona: Persona,
  rng: Rng,
  signupDate: Date,
  now: Date,
  activeUntil: Date,
): number {
  const [minPerWeek, maxPerWeek] = persona.activitiesPerWeek;
  const perWeek = rng.float(minPerWeek, maxPerWeek);
  const startOfWindow = new Date(now.getTime() - WINDOW_DAYS * 86_400_000);
  const effectiveStart = signupDate > startOfWindow ? signupDate : startOfWindow;
  const effectiveEnd = activeUntil < now ? activeUntil : now;
  const activeDays = Math.max(0, (effectiveEnd.getTime() - effectiveStart.getTime()) / 86_400_000);
  return Math.max(0, Math.round((activeDays / 7) * perWeek));
}

function pickPlace(rng: Rng): { city: string; country: string } {
  const place = rng.weighted(PLACES.map((p) => ({ value: p, weight: p.weight })));
  return { city: place.city, country: place.country };
}

function generate(): SynthUser[] {
  const env = loadEnv();
  faker.seed(env.SYNTH_RNG_SEED);
  const rng = new Rng(env.SYNTH_RNG_SEED);
  const usedHandles = new Set<string>();
  const usedEmails = new Set<string>();
  const now = new Date();
  const counts = allocatePersonaCounts(env.SYNTH_USER_COUNT);
  const users: SynthUser[] = [];

  for (const persona of PERSONAS) {
    const count = counts[persona.id] ?? 0;
    for (let i = 0; i < count; i += 1) {
      const firstName = faker.person.firstName();
      const lastName = faker.person.lastName();
      const name = `${firstName} ${lastName}`;
      const handle = handleFromName(firstName, lastName, rng, usedHandles);
      const emailDomain = faker.helpers.arrayElement([
        "gmail.com",
        "hotmail.com",
        "outlook.com",
        "yahoo.com",
        "proton.me",
        "icloud.com",
      ]);
      let email = `${handle}@${emailDomain}`.toLowerCase();
      while (usedEmails.has(email)) {
        email = `${handle}.${rng.int(10, 9999)}@${emailDomain}`.toLowerCase();
      }
      usedEmails.add(email);

      const signupDate = signupDateFor(persona, rng, now);
      const cancelledAt = cancelledAtFor(persona, signupDate, rng, now);
      const lastActiveAt =
        persona.status === "dormant"
          ? lastActiveForDormant(persona, signupDate, rng, now)
          : persona.status === "churned"
            ? cancelledAt ?? now
            : now;

      const primarySport = rng.pick(persona.primarySports);
      const plan = rng.weighted(persona.planMix.map((pm) => ({ value: pm.plan, weight: pm.weight })));
      const activityTarget = activityTargetFor(persona, rng, signupDate, now, lastActiveAt);
      const [minFollows, maxFollows] = persona.followsGivenRange;
      const followsGivenTarget = rng.int(minFollows, maxFollows);

      const { city, country } = pickPlace(rng);
      const bio = rng.pick(persona.bioSamples);

      users.push({
        id: faker.string.uuid(),
        email,
        name,
        firstName,
        lastName,
        handle,
        avatar: USER_AVATARS[rng.int(0, USER_AVATARS.length - 1)],
        city,
        country,
        bio,
        signupDate: signupDate.toISOString(),
        lastActiveAt: persona.status !== "active" ? lastActiveAt.toISOString() : undefined,
        cancelledAt: cancelledAt?.toISOString(),
        persona: persona.id,
        status: persona.status,
        plan,
        primarySport,
        activityTarget,
        kudosGivenRate: persona.kudosGivenRate,
        followsGivenTarget,
        clubJoinChance: persona.clubJoinChance,
        challengeJoinChance: persona.challengeJoinChance,
        supportLikelihood: persona.supportLikelihood,
        cohortId: env.SYNTH_COHORT_ID,
      });
    }
  }

  return users;
}

function summary(users: SynthUser[]): Record<string, unknown> {
  const byPersona = users.reduce<Record<string, number>>((acc, u) => {
    acc[u.persona] = (acc[u.persona] ?? 0) + 1;
    return acc;
  }, {});
  const byPlan = users.reduce<Record<string, number>>((acc, u) => {
    acc[u.plan] = (acc[u.plan] ?? 0) + 1;
    return acc;
  }, {});
  const byStatus = users.reduce<Record<string, number>>((acc, u) => {
    acc[u.status] = (acc[u.status] ?? 0) + 1;
    return acc;
  }, {});
  const churnedInLast60d = users.filter((u) => {
    if (!u.cancelledAt) return false;
    const ts = new Date(u.cancelledAt).getTime();
    return Date.now() - ts < 60 * 86_400_000;
  }).length;
  const totalActivityTarget = users.reduce((sum, u) => sum + u.activityTarget, 0);
  return {
    total: users.length,
    byPersona,
    byPlan,
    byStatus,
    churnedInLast60d,
    totalActivityTarget,
    avgActivityTargetPerUser: Math.round(totalActivityTarget / users.length),
  };
}

async function main() {
  const users = generate();
  await mkdir(dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, `${JSON.stringify(users, null, 2)}\n`, "utf8");
  console.log(`Wrote ${users.length} users → ${OUTPUT_PATH}`);
  console.log(summary(users));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
