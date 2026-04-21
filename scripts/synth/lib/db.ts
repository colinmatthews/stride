import { Pool, type PoolClient } from "pg";
import { loadEnv } from "./config.js";

let pool: Pool | null = null;

export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({ connectionString: loadEnv().DB_URL });
  }
  return pool;
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

export function buildBulkInsert(
  table: string,
  columns: readonly string[],
  rows: readonly (readonly unknown[])[],
  trailing = "",
): { text: string; values: unknown[] } {
  if (rows.length === 0) {
    return { text: "", values: [] };
  }
  const values: unknown[] = [];
  const placeholders: string[] = [];
  let cursor = 0;
  for (const row of rows) {
    if (row.length !== columns.length) {
      throw new Error(
        `buildBulkInsert: row has ${row.length} values but ${columns.length} columns`,
      );
    }
    const placeholderList = row.map(() => `$${++cursor}`).join(", ");
    placeholders.push(`(${placeholderList})`);
    for (const value of row) values.push(value);
  }
  const text = `INSERT INTO ${table} (${columns.join(", ")}) VALUES ${placeholders.join(", ")} ${trailing}`.trim();
  return { text, values };
}

export async function bulkInsert<T>(
  client: PoolClient,
  table: string,
  columns: readonly string[],
  rows: readonly T[],
  rowToValues: (row: T) => readonly unknown[],
  trailing = "ON CONFLICT DO NOTHING",
  chunkSize = 500,
): Promise<void> {
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const tuples = chunk.map((row) => rowToValues(row));
    const { text, values } = buildBulkInsert(table, columns, tuples, trailing);
    if (text) await client.query(text, values);
  }
}
