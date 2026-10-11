/**
 * Applies the plain-SQL files in /migrations in filename order, once each.
 * Each file runs in its own transaction; a Postgres advisory lock stops two API instances from
 * migrating at the same time.
 */
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import type { Sql } from './client';

const LOCK_ID = 7_310_524; // arbitrary, fixed

export function defaultMigrationsDir(): string {
  return process.env.MIGRATIONS_DIR ?? path.resolve(process.cwd(), 'migrations');
}

export async function migrate(
  sql: Sql,
  dir = defaultMigrationsDir(),
  log: (msg: string) => void = console.log,
): Promise<string[]> {
  const files = (await readdir(dir)).filter((f) => /^\d+_.+\.sql$/.test(f)).sort();
  const applied: string[] = [];

  await sql.reserve().then(async (conn) => {
    try {
      await conn`SELECT pg_advisory_lock(${LOCK_ID})`;
      await conn`
        CREATE TABLE IF NOT EXISTS schema_migrations (
          name text PRIMARY KEY,
          applied_at timestamptz NOT NULL DEFAULT now()
        )`;
      const done = new Set(
        (await conn<{ name: string }[]>`SELECT name FROM schema_migrations`).map((r) => r.name),
      );

      for (const file of files) {
        if (done.has(file)) continue;
        const body = await readFile(path.join(dir, file), 'utf8');
        await conn.unsafe('BEGIN');
        try {
          await conn.unsafe(body);
          await conn`INSERT INTO schema_migrations (name) VALUES (${file})`;
          await conn.unsafe('COMMIT');
        } catch (err) {
          await conn.unsafe('ROLLBACK');
          throw new Error(`Migration ${file} failed: ${(err as Error).message}`, { cause: err });
        }
        applied.push(file);
        log(`applied migration ${file}`);
      }
    } finally {
      await conn`SELECT pg_advisory_unlock(${LOCK_ID})`;
      conn.release();
    }
  });

  if (applied.length === 0) log('database schema is up to date');
  return applied;
}
