// Grants (or with --revoke, removes) staff access for an existing account by email.
// Usage: npm run staff:grant -- you@example.com [--revoke]
import "dotenv/config";
import { Pool } from "pg";

const args = process.argv.slice(2);
const revoke = args.includes("--revoke");
const email = args
  .find((arg) => !arg.startsWith("--"))
  ?.trim()
  .toLowerCase();

if (!email) {
  console.error("Usage: npm run staff:grant -- <email> [--revoke]");
  process.exit(1);
}

if (!process.env.DB_URL) {
  throw new Error("DB_URL is required");
}

const pool = new Pool({ connectionString: process.env.DB_URL, max: 1 });

try {
  const result = await pool.query<{ name: string; role: string }>(
    "update users set role = $1 where email = $2 returning name, role",
    [revoke ? "member" : "staff", email],
  );

  if (result.rowCount === 0) {
    console.error(`No account found for ${email}. Sign up in the app first.`);
    process.exitCode = 1;
  } else {
    console.log(`${result.rows[0].name} (${email}) is now ${result.rows[0].role}.`);
  }
} finally {
  await pool.end();
}
