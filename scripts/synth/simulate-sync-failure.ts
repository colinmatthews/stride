// Inserts a pending upload for a registered user, standing in for the
// device-sync pipeline reporting a failed upload. Usage:
//   npm run synth:sync-failure -- you@example.com
import { randomUUID } from "node:crypto";
import { closePool, getPool } from "./lib/db.js";

async function main() {
  const email = process.argv[2]?.trim().toLowerCase();

  if (!email) {
    console.error("Usage: npm run synth:sync-failure -- <account-email>");
    process.exit(1);
  }

  const pool = getPool();
  const users = await pool.query<{ id: string; name: string }>(
    "SELECT id, name FROM users WHERE email = $1",
    [email],
  );
  const user = users.rows[0];

  if (!user) {
    console.error(`No user found for ${email}. Register in the app first.`);
    process.exit(1);
  }

  const id = `pu-${randomUUID()}`;
  const failedAt = new Date(Date.now() - 18 * 60_000);

  await pool.query(
    `INSERT INTO pending_uploads
       (id, user_id, device, reason, failed_at, status, sport, title, description,
        distance_km, moving_seconds, elevation_m, avg_hr, avg_pace_sec_per_km, route_seed)
     VALUES ($1, $2, $3, $4, $5, 'pending', $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
    [
      id,
      user.id,
      "Garmin Forerunner 265",
      "Connection dropped 200m from the trailhead — the upload never completed.",
      failedAt,
      "Run",
      "Tempo intervals",
      "Felt strong today. Legs finally coming back after the race.",
      "8.42",
      2536,
      96,
      154,
      301,
      501,
    ],
  );

  console.log(`Created pending upload ${id} for ${user.name} (${email}).`);
  console.log("Open the feed — the sync rescue card should be waiting.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => closePool());
