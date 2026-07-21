import { drizzle } from "drizzle-orm/postgres-js";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import postgres from "postgres";
import * as schema from "./schema.ts";
import { getServerConfig } from "../config.ts";

// Stashed on globalThis so dev hot-reload reuses one pool instead of leaking a new pool per reload.
const globalForDb = globalThis as unknown as { __istDb?: ReturnType<typeof createDb> };

function createDb() {
  const client = postgres(getServerConfig().DATABASE_URL, {
    prepare: false, // required for the Supabase transaction pooler (pgbouncer)
    max: Number(process.env.DB_POOL_MAX ?? 5),
    idle_timeout: 20,
    connect_timeout: 10,
  });
  return drizzle(client, { schema });
}

export function getDb() {
  return (globalForDb.__istDb ??= createDb());
}

export type Db = ReturnType<typeof getDb>;
export type DbTx = Parameters<Parameters<Db["transaction"]>[0]>[0];

// Services take a `DbLike` so the same code runs against the postgres-js pool, a
// transaction handle, or the PGlite database used in tests. It stays bound to our
// schema and only widens over the driver's result type.
export type DbLike = PgDatabase<PgQueryResultHKT, typeof schema>;
