/**
 * Derive notification rows from social events that already exist in the database.
 *
 * The synth scripts bulk-insert kudos, comments and follows with raw SQL, going
 * around the Express handlers entirely — so the live fan-out in server/data.ts
 * never sees them and a freshly seeded database has an empty inbox. This script
 * closes that gap so the notification center has realistic history to show.
 *
 * Every statement is a set-based INSERT … SELECT keyed on the same deterministic
 * id the live fan-out uses, with ON CONFLICT DO NOTHING. That makes the whole
 * backfill idempotent and impossible to double-insert against live events, so it
 * is safe to re-run at any time.
 *
 * Deliberately NOT wired into server/db.ts's startup seed: that runs on every
 * boot, and these joins scan the full activity history.
 */
import { fileURLToPath } from "node:url";
import type { PoolClient } from "pg";
import { closePool, getPool } from "./lib/db.js";

/**
 * Only recent history. Without the window, synth's kudos volume produces a
 * notifications table an order of magnitude larger than any demo needs.
 */
const WINDOW = "30 days";

type Step = { label: string; sql: string };

const STEPS: Step[] = [
  {
    label: "kudos",
    sql: `
      INSERT INTO notifications (id, user_id, actor_id, kind, title, body, activity_id, created_at)
      SELECT 'ntf-kudos-' || k.activity_id || '-' || k.user_id,
             a.athlete_id, k.user_id, 'kudos',
             u.name || ' gave you kudos',
             'On your activity “' || a.title || '”.',
             a.id, k.created_at
      FROM activity_kudos k
      JOIN activities a ON a.id = k.activity_id
      JOIN users u ON u.id = k.user_id
      WHERE a.athlete_id <> k.user_id
        AND k.created_at > now() - interval '${WINDOW}'
      ON CONFLICT (id) DO NOTHING`,
  },
  {
    label: "comments",
    sql: `
      INSERT INTO notifications (id, user_id, actor_id, kind, title, body, activity_id, created_at)
      SELECT 'ntf-comment-' || c.id,
             a.athlete_id, c.athlete_id, 'comment',
             u.name || ' commented on your activity',
             '“' || c.text || '”',
             a.id, c.created_at
      FROM activity_comments c
      JOIN activities a ON a.id = c.activity_id
      JOIN users u ON u.id = c.athlete_id
      WHERE a.athlete_id <> c.athlete_id
        AND c.created_at > now() - interval '${WINDOW}'
      ON CONFLICT (id) DO NOTHING`,
  },
  {
    label: "follows",
    sql: `
      INSERT INTO notifications (id, user_id, actor_id, kind, title, body, target_user_id, created_at)
      SELECT 'ntf-follow-' || f.follower_id || '-' || f.followed_id,
             f.followed_id, f.follower_id, 'follow',
             u.name || ' started following you',
             'Take a look at their recent activities.',
             f.follower_id, f.created_at
      FROM follows f
      JOIN users u ON u.id = f.follower_id
      WHERE f.follower_id <> f.followed_id
        AND f.created_at > now() - interval '${WINDOW}'
      ON CONFLICT (id) DO NOTHING`,
  },
  {
    label: "segment KOMs",
    // Derived from real rank-1 efforts rather than inventing a KOM engine.
    // activities has no created_at, so the effort's activity date is the timestamp.
    sql: `
      INSERT INTO notifications (id, user_id, kind, title, body, activity_id, segment_id, created_at)
      SELECT 'ntf-segment-' || s.activity_id || '-' || s.position,
             a.athlete_id, 'segment',
             'You took the KOM on ' || sg.name,
             'Your effort of ' || s.effort_seconds || 's ranks #1 on this segment.',
             a.id, sg.id, a.date
      FROM activity_segments s
      JOIN activities a ON a.id = s.activity_id
      JOIN segments sg ON sg.id = s.segment_id
      WHERE s.rank = 1
        AND a.date > now() - interval '${WINDOW}'
      ON CONFLICT (id) DO NOTHING`,
  },
  {
    label: "club joins",
    // Actor-less: nobody else triggered these, and the inbox renders a bell icon.
    sql: `
      INSERT INTO notifications (id, user_id, kind, title, body, club_id, created_at)
      SELECT 'ntf-club-join-' || m.club_id || '-' || m.user_id,
             m.user_id, 'club', 'You joined ' || c.name, c.description, c.id, m.created_at
      FROM club_memberships m
      JOIN clubs c ON c.id = m.club_id
      WHERE m.created_at > now() - interval '${WINDOW}'
      ON CONFLICT (id) DO NOTHING`,
  },
  {
    label: "challenge joins",
    // Sourced only from actual entries, so nobody is notified about a challenge
    // they have not joined.
    sql: `
      INSERT INTO notifications (id, user_id, kind, title, body, challenge_id, created_at)
      SELECT 'ntf-challenge-join-' || e.challenge_id || '-' || e.user_id,
             e.user_id, 'challenge', 'You joined ' || ch.name,
             'Goal: ' || round(ch.goal_km) || ' km. Progress updates will land here.',
             ch.id, e.created_at
      FROM challenge_entries e
      JOIN challenges ch ON ch.id = e.challenge_id
      WHERE e.created_at > now() - interval '${WINDOW}'
      ON CONFLICT (id) DO NOTHING`,
  },
  {
    label: "weekly recaps",
    sql: `
      INSERT INTO notifications (id, user_id, kind, title, body, created_at)
      SELECT 'ntf-system-recap-' || a.athlete_id || '-' || to_char(now(), 'IYYY-IW'),
             a.athlete_id, 'system', 'Your weekly recap is ready',
             'You logged ' || round(sum(a.distance_km), 1) || ' km across ' || count(*) || ' activities.',
             now()
      FROM activities a
      WHERE a.date > now() - interval '7 days'
      GROUP BY a.athlete_id
      ON CONFLICT (id) DO NOTHING`,
  },
];

/**
 * Give the inbox a plausible read state so the bell shows a believable number
 * instead of every backfilled row at once.
 *
 * Scoped to the ids this run just inserted. An earlier version matched every row
 * older than three days for every user, which did not "undo real reads" (the
 * read_at IS NULL guard covered that) but did the opposite and worse: it
 * fabricated read state over genuinely unread history.
 */
const AGE_OUT_SQL = `
  UPDATE notifications
  SET read_at = created_at + interval '2 hours'
  WHERE id = ANY($1::text[])
    AND read_at IS NULL
    AND created_at < now() - interval '3 days'`;

export async function backfillNotifications(client: PoolClient): Promise<void> {
  const insertedIds: string[] = [];

  for (const step of STEPS) {
    // RETURNING id after ON CONFLICT DO NOTHING yields only the rows this run
    // actually created, never pre-existing ones.
    const result = await client.query<{ id: string }>(`${step.sql} RETURNING id`);
    insertedIds.push(...result.rows.map((row) => row.id));
    console.log(`  ${step.label}: +${result.rowCount ?? 0}`);
  }

  const aged = await client.query(AGE_OUT_SQL, [insertedIds]);
  console.log(`  marked read (backfilled rows older than 3 days): ${aged.rowCount ?? 0}`);
}

async function main(): Promise<void> {
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    console.log("Backfilling notifications from existing social events…");
    await backfillNotifications(client);
    await client.query("COMMIT");
    console.log("Done.");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
    await closePool();
  }
}

// Only run when invoked directly; seed-db.ts imports backfillNotifications and
// calls it inside its own transaction.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
