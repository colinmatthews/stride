import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { db } from "./db.js";
import { retentionActions, users } from "./db/schema.js";
import {
  CHANNELS,
  WEEKS_SHOWN,
  buildSignals,
  dormantPath,
  draftMessage,
  isFlagged,
  nextMonday,
  resolveQueueStatus,
  startOfWeekUtc,
  summarizeFade,
  windowStart,
  type Channel,
  type LatestAction,
  type QueueStatus,
  type RetentionAction,
  type Sport,
} from "./retention.js";

const DAY_MS = 86_400_000;

const daysBetween = (later: Date, earlier: Date) =>
  Math.floor((later.getTime() - earlier.getTime()) / DAY_MS);

const isoDay = (date: Date) => date.toISOString().slice(0, 10);

type LastActionDto = {
  action: RetentionAction;
  channel: string | null;
  note: string | null;
  createdAt: string;
  actorName: string;
};

export type RetentionEntryDto = {
  id: string;
  name: string;
  handle: string;
  avatar: string;
  city: string;
  sport: Sport;
  memberMonths: number;
  renewsInDays: number | null;
  weekly: number[];
  prior28: number;
  last28: number;
  drop: number;
  baseline: number;
  fadeWeeksAgo: number;
  weeksLeft: number;
  dormantPath: number[];
  lastActiveDaysAgo: number | null;
  signals: string[];
  drafts: Record<Channel, string>;
  status: QueueStatus;
  lastAction: LastActionDto | null;
};

export type RetentionQueueDto = {
  weekOf: string;
  activePremium: number;
  flagged: number;
  medianDrop: number;
  entries: RetentionEntryDto[];
};

type LatestActionRow = {
  athlete_id: string;
  action: RetentionAction;
  channel: string | null;
  note: string | null;
  snoozed_until: Date | null;
  created_at: Date;
  actor_name: string;
};

async function latestActions(athleteIds?: string[]) {
  const filter = athleteIds
    ? sql`where ra.athlete_id in (${sql.join(
        athleteIds.map((id) => sql`${id}`),
        sql`, `,
      )})`
    : sql``;
  const result = await db.execute<LatestActionRow>(sql`
    select distinct on (ra.athlete_id)
      ra.athlete_id, ra.action, ra.channel, ra.note, ra.snoozed_until, ra.created_at,
      actor.name as actor_name
    from retention_actions ra
    join users actor on actor.id = ra.actor_id
    ${filter}
    order by ra.athlete_id, ra.created_at desc
  `);
  return new Map(result.rows.map((row) => [row.athlete_id, row]));
}

function toLatestAction(row: LatestActionRow | undefined): LatestAction | null {
  if (!row) return null;
  return {
    action: row.action,
    channel: row.channel,
    note: row.note,
    snoozedUntil: row.snoozed_until ? new Date(row.snoozed_until) : null,
    createdAt: new Date(row.created_at),
  };
}

function toLastActionDto(row: LatestActionRow | undefined): LastActionDto | null {
  if (!row) return null;
  return {
    action: row.action,
    channel: row.channel,
    note: row.note,
    createdAt: new Date(row.created_at).toISOString(),
    actorName: row.actor_name,
  };
}

export async function listRetentionQueue(now = new Date()): Promise<RetentionQueueDto> {
  const currentWeek = startOfWeekUtc(now);
  const start = windowStart(now);
  const weekKeys = Array.from({ length: WEEKS_SHOWN }, (_, index) => {
    const week = new Date(start);
    week.setUTCDate(week.getUTCDate() + index * 7);
    return isoDay(week);
  });

  const [athleteRows, weeklyRows, activityRows, kudoRows, clubRows, actionRows] = await Promise.all(
    [
      db.execute<{
        id: string;
        name: string;
        handle: string;
        avatar_url: string;
        city: string;
        plan_renews_at: Date | null;
        created_at: Date;
      }>(sql`
        select id, name, handle, avatar_url, city, plan_renews_at, created_at
        from users where plan = 'premium'
      `),
      db.execute<{ athlete_id: string; week: string; sessions: number }>(sql`
        select a.athlete_id,
          to_char(date_trunc('week', a.date at time zone 'UTC'), 'YYYY-MM-DD') as week,
          count(*)::int as sessions
        from activities a
        join users u on u.id = a.athlete_id and u.plan = 'premium'
        where a.date >= ${start.toISOString()} and a.date < ${currentWeek.toISOString()}
        group by 1, 2
      `),
      db.execute<{ athlete_id: string; last_at: Date; sport: Sport }>(sql`
        select a.athlete_id, max(a.date) as last_at,
          mode() within group (order by a.sport) as sport
        from activities a
        join users u on u.id = a.athlete_id and u.plan = 'premium'
        group by a.athlete_id
      `),
      db.execute<{ user_id: string; last_at: Date }>(sql`
        select k.user_id, max(k.created_at) as last_at
        from activity_kudos k
        join users u on u.id = k.user_id and u.plan = 'premium'
        group by k.user_id
      `),
      db.execute<{ user_id: string; clubs: number }>(sql`
        select m.user_id, count(*)::int as clubs
        from club_memberships m
        join users u on u.id = m.user_id and u.plan = 'premium'
        group by m.user_id
      `),
      latestActions(),
    ],
  );

  const weeklyByAthlete = new Map<string, Map<string, number>>();
  for (const row of weeklyRows.rows) {
    const weeks = weeklyByAthlete.get(row.athlete_id) ?? new Map<string, number>();
    weeks.set(row.week, Number(row.sessions));
    weeklyByAthlete.set(row.athlete_id, weeks);
  }
  const activityByAthlete = new Map(activityRows.rows.map((row) => [row.athlete_id, row]));
  const lastKudoByUser = new Map(kudoRows.rows.map((row) => [row.user_id, new Date(row.last_at)]));
  const clubsByUser = new Map(clubRows.rows.map((row) => [row.user_id, Number(row.clubs)]));

  let activePremium = 0;
  const entries: RetentionEntryDto[] = [];

  for (const athlete of athleteRows.rows) {
    const weeks = weeklyByAthlete.get(athlete.id);
    const weekly = weekKeys.map((key) => weeks?.get(key) ?? 0);

    // Active = logged at least one session in the last 8 completed weeks.
    if (weekly.slice(4).some((sessions) => sessions > 0)) activePremium += 1;
    if (!isFlagged(weekly)) continue;

    const summary = summarizeFade(weekly);
    const activity = activityByAthlete.get(athlete.id);
    const lastActivityAt = activity ? new Date(activity.last_at) : null;
    const lastKudoAt = lastKudoByUser.get(athlete.id) ?? null;
    const renewsInDays = athlete.plan_renews_at
      ? Math.max(0, daysBetween(new Date(athlete.plan_renews_at), now))
      : null;
    const lastActiveDaysAgo = lastActivityAt ? daysBetween(now, lastActivityAt) : null;
    const sport: Sport = activity?.sport ?? "Run";
    const actionRow = actionRows.get(athlete.id);

    const draftInput = {
      name: athlete.name,
      city: athlete.city,
      sport,
      baseline: Math.round(summary.baseline),
      lastWeek: weekly[WEEKS_SHOWN - 1],
    };

    entries.push({
      id: athlete.id,
      name: athlete.name,
      handle: athlete.handle,
      avatar: athlete.avatar_url,
      city: athlete.city,
      sport,
      memberMonths: Math.max(0, Math.floor(daysBetween(now, new Date(athlete.created_at)) / 30)),
      renewsInDays,
      weekly,
      ...summary,
      dormantPath: dormantPath(summary.baseline, summary.fadeWeeksAgo),
      lastActiveDaysAgo,
      signals: buildSignals({
        plan: "premium",
        renewsInDays,
        lastActiveDaysAgo,
        lastKudoGivenDaysAgo: lastKudoAt ? daysBetween(now, lastKudoAt) : null,
        clubCount: clubsByUser.get(athlete.id) ?? 0,
      }),
      drafts: Object.fromEntries(
        CHANNELS.map((channel) => [channel, draftMessage(draftInput, channel)]),
      ) as Record<Channel, string>,
      status: resolveQueueStatus(toLatestAction(actionRow), lastActivityAt, now),
      lastAction: toLastActionDto(actionRow),
    });
  }

  const drops = entries.map((entry) => entry.drop).sort((a, b) => a - b);

  return {
    weekOf: currentWeek.toISOString(),
    activePremium,
    flagged: entries.length,
    medianDrop: drops.length ? drops[Math.floor(drops.length / 2)] : 0,
    entries,
  };
}

export class RetentionNotFoundError extends Error {}

export async function recordRetentionAction(input: {
  actorId: string;
  athleteId: string;
  action: RetentionAction;
  channel?: Channel;
  message?: string;
  note?: string;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const athlete = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.id, input.athleteId), eq(users.plan, "premium")))
    .limit(1);

  if (athlete.length === 0) {
    throw new RetentionNotFoundError("Premium athlete not found");
  }

  await db.insert(retentionActions).values({
    id: randomUUID(),
    athleteId: input.athleteId,
    actorId: input.actorId,
    action: input.action,
    channel: input.action === "contacted" ? (input.channel ?? null) : null,
    message: input.action === "contacted" ? (input.message ?? null) : null,
    note: input.note ?? null,
    snoozedUntil: input.action === "snoozed" ? nextMonday(now) : null,
    createdAt: now,
  });

  const [row] = (await latestActions([input.athleteId])).values();
  const lastActivity = await db.execute<{ last_at: Date | null }>(sql`
    select max(date) as last_at from activities where athlete_id = ${input.athleteId}
  `);
  const lastAt = lastActivity.rows[0]?.last_at;

  return {
    status: resolveQueueStatus(toLatestAction(row), lastAt ? new Date(lastAt) : null, now),
    lastAction: toLastActionDto(row),
  };
}
