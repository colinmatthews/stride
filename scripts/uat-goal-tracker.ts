// Moves a registered account to a given day of the first-two-weeks goal so the
// tracker can be tested by hand. Dev databases only.
//
//   npx tsx scripts/uat-goal-tracker.ts <email> <day> [--holdout] [--clear-activities]
//
// Shifts the account's signup and its activities together, puts it in the
// treatment cohort (or holdout), and clears check-in and completion state.
// --clear-activities deletes the account's activities first, for a clean run.
import "dotenv/config";
import { Pool } from "pg";

const [email, dayArg, ...flags] = process.argv.slice(2);
const day = Number(dayArg);
const holdout = flags.includes("--holdout");
const clearActivities = flags.includes("--clear-activities");
const unknown = flags.filter((flag) => flag !== "--holdout" && flag !== "--clear-activities");

if (!email || !Number.isInteger(day) || day < 1 || day > 15 || unknown.length > 0) {
  console.error(
    "Usage: npx tsx scripts/uat-goal-tracker.ts <email> <day 1-15> [--holdout] [--clear-activities]",
  );
  process.exit(1);
}

const DAY_MS = 86_400_000;
const pool = new Pool({ connectionString: process.env.DB_URL });

try {
  const { rows } = await pool.query<{ id: string; created_at: Date }>(
    "SELECT id, created_at FROM users WHERE email = $1",
    [email.trim().toLowerCase()],
  );
  const user = rows[0];

  if (!user) {
    throw new Error(`No account for ${email}. Sign up in the app first.`);
  }

  // One hour into the requested day, so it doesn't roll over mid-test.
  const createdAt = new Date(Date.now() - (day - 1) * DAY_MS - 3_600_000);
  const shiftMs = createdAt.getTime() - user.created_at.getTime();
  const cohort = holdout ? "holdout" : "treatment";

  const cleared = clearActivities
    ? (await pool.query("DELETE FROM activities WHERE athlete_id = $1", [user.id])).rowCount
    : 0;

  await pool.query("UPDATE users SET created_at = $2 WHERE id = $1", [user.id, createdAt]);
  await pool.query(
    "UPDATE activities SET date = date + ($2 || ' milliseconds')::interval WHERE athlete_id = $1",
    [user.id, String(shiftMs)],
  );
  await pool.query(
    `INSERT INTO goal_trackers (user_id, cohort) VALUES ($1, $2)
     ON CONFLICT (user_id) DO UPDATE SET cohort = $2, check_in_sent_at = NULL,
       check_in_dismissed_at = NULL, completed_seen_at = NULL`,
    [user.id, cohort],
  );

  if (clearActivities) console.log(`Deleted ${cleared} activities.`);
  console.log(`${email} is now on day ${day} (${cohort}). Reload the feed.`);
} finally {
  await pool.end();
}
