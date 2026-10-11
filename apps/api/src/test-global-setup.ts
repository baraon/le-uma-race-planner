/**
 * Runs once before the API tests. With TEST_DATABASE_URL set (the dev stack sets it), tests use
 * that database, created here if needed, so they never write test users into your dev data.
 * Without it (CI), tests use DATABASE_URL, which is a throwaway database there.
 */
import postgres from 'postgres';
import { createSql } from './db/client';
import { migrate } from './db/migrate';

export default async function setup() {
  const testUrl = process.env.TEST_DATABASE_URL;
  const url = testUrl ?? process.env.DATABASE_URL;
  if (!url) return;

  if (testUrl && process.env.DATABASE_URL) {
    const name = new URL(testUrl).pathname.slice(1);
    const admin = postgres(process.env.DATABASE_URL, { max: 1, onnotice: () => {} });
    try {
      const [exists] = await admin`SELECT 1 FROM pg_database WHERE datname = ${name}`;
      if (!exists) await admin.unsafe(`CREATE DATABASE "${name.replace(/"/g, '""')}"`);
    } finally {
      await admin.end({ timeout: 5 });
    }
  }

  const sql = createSql(url);
  try {
    await migrate(sql, undefined, () => {});
  } finally {
    await sql.end({ timeout: 5 });
  }
}
