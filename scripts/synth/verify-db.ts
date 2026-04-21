import { getPool, closePool } from "./lib/db.js";

async function main() {
  const pool = getPool();
  const q = async (sql: string) => (await pool.query(sql)).rows;

  console.log("Row counts:", {
    users: (await q("SELECT COUNT(*) FROM users"))[0],
    activities: (await q("SELECT COUNT(*) FROM activities"))[0],
    splits: (await q("SELECT COUNT(*) FROM activity_splits"))[0],
    kudos: (await q("SELECT COUNT(*) FROM activity_kudos"))[0],
    follows: (await q("SELECT COUNT(*) FROM follows"))[0],
    comments: (await q("SELECT COUNT(*) FROM activity_comments"))[0],
    clubmems: (await q("SELECT COUNT(*) FROM club_memberships"))[0],
    chmems: (await q("SELECT COUNT(*) FROM challenge_entries"))[0],
  });
  console.log("Sport mix:", await q("SELECT sport, COUNT(*)::int AS n FROM activities GROUP BY sport ORDER BY n DESC"));
  console.log("Top followed:", await q("SELECT name, followers_count FROM users ORDER BY followers_count DESC LIMIT 5"));
  console.log("Activity date range:", await q("SELECT MIN(date)::text AS mn, MAX(date)::text AS mx FROM activities"));
  console.log("Clubs:", await q("SELECT name, members FROM clubs ORDER BY members DESC"));
  console.log("Top-kudoed:", await q(`
    SELECT a.sport, a.title, a.kudos, u.name
    FROM activities a JOIN users u ON u.id = a.athlete_id
    ORDER BY a.kudos DESC LIMIT 3
  `));

  await closePool();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
