import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

export type Sql = postgres.Sql;

export function createSql(databaseUrl: string): Sql {
  return postgres(databaseUrl, {
    max: 10,
    // Keep every timestamp an absolute instant: the server never thinks in local time.
    connection: { TimeZone: 'UTC' },
    onnotice: () => {},
  });
}

export function createDb(sql: Sql) {
  return drizzle(sql, { schema });
}

export type Db = ReturnType<typeof createDb>;
