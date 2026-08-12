import "dotenv/config";
import { cp, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { quotePostgresIdentifier, resolveDatabaseScope } from "../server/database-scope.js";

const databaseUrl = process.env.DB_URL;

if (!databaseUrl) {
  throw new Error("DB_URL is required to migrate the database");
}

const scope = resolveDatabaseScope();
const sourceMigrationsFolder = path.resolve("drizzle");
let temporaryMigrationsRoot: string | undefined;

const administrationPool = new Pool({ connectionString: databaseUrl, max: 1 });

try {
  if (scope.preview) {
    await administrationPool.query(
      `CREATE SCHEMA IF NOT EXISTS ${quotePostgresIdentifier(scope.applicationSchema)}`,
    );
  }
} finally {
  await administrationPool.end();
}

try {
  let migrationsFolder = sourceMigrationsFolder;

  if (scope.preview) {
    temporaryMigrationsRoot = await mkdtemp(path.join(tmpdir(), "stride-preview-migrations-"));
    migrationsFolder = path.join(temporaryMigrationsRoot, "drizzle");
    await cp(sourceMigrationsFolder, migrationsFolder, { recursive: true });
    await rewritePublicSchemaReferences(migrationsFolder, scope.applicationSchema);
  }

  const migrationPool = new Pool({
    connectionString: databaseUrl,
    max: 1,
    ...(scope.preview ? { options: `-csearch_path=${scope.applicationSchema},public` } : {}),
  });

  try {
    await migrate(drizzle(migrationPool), {
      migrationsFolder,
      migrationsSchema: scope.migrationSchema,
      migrationsTable: "__drizzle_migrations",
    });
    console.log(
      scope.preview
        ? `Migrated isolated preview schema ${scope.applicationSchema}`
        : "Applied database migrations",
    );
  } finally {
    await migrationPool.end();
  }
} finally {
  if (temporaryMigrationsRoot) {
    await rm(temporaryMigrationsRoot, { recursive: true, force: true });
  }
}

async function rewritePublicSchemaReferences(directory: string, targetSchema: string) {
  const entries = await readdir(directory, { withFileTypes: true });
  const quotedTarget = `${quotePostgresIdentifier(targetSchema)}.`;

  await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directory, entry.name);

      if (entry.isDirectory()) {
        await rewritePublicSchemaReferences(entryPath, targetSchema);
        return;
      }

      if (!entry.name.endsWith(".sql")) {
        return;
      }

      const sql = await readFile(entryPath, "utf8");
      await writeFile(entryPath, sql.replaceAll('"public".', quotedTarget));
    }),
  );
}
