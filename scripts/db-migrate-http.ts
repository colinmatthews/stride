/**
 * Workaround migration runner for networks that block direct outbound TCP to
 * Postgres (e.g. corporate networks that only permit proxied HTTPS traffic).
 *
 * Uses Neon's HTTP driver (Postgres-over-HTTPS) instead of the raw `pg`
 * driver used by `drizzle-kit migrate` / the app's runtime connection. It
 * applies the same SQL files in ./drizzle and updates the same
 * `__drizzle_migrations` bookkeeping table, so it stays interchangeable with
 * `npm run db:migrate` once a network with direct Postgres access is available.
 *
 * Only works against Neon-hosted databases (relies on Neon's HTTP endpoint).
 */
import "dotenv/config";
import { neon, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { migrate } from "drizzle-orm/neon-http/migrator";
import { fetch as undiciFetch, ProxyAgent } from "undici";

async function main() {
  const dbUrl = process.env.DB_URL;
  if (!dbUrl) {
    throw new Error("DB_URL is required for Drizzle");
  }

  // Corporate networks often block direct outbound TCP entirely, only
  // permitting HTTP(S) traffic through a proxy. Node's built-in global fetch
  // bundles its own (differently-versioned) undici internally, so a
  // ProxyAgent from the npm `undici` package is incompatible with it as a
  // `dispatcher`. Instead, use undici's own fetch implementation paired with
  // its own ProxyAgent so the versions match.
  const proxyUrl = process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy;
  if (proxyUrl) {
    console.log(`Routing Neon HTTP driver through proxy: ${proxyUrl}`);
    const dispatcher = new ProxyAgent(proxyUrl);
    neonConfig.fetchFunction = (url: string | URL, init?: RequestInit) =>
      undiciFetch(url as string, { ...init, dispatcher } as never);
  }

  const sql = neon(dbUrl);
  const db = drizzle(sql);

  console.log("Applying migrations via Neon HTTP driver...");
  await migrate(db, { migrationsFolder: "./drizzle" });
  console.log("Migrations applied successfully.");
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
