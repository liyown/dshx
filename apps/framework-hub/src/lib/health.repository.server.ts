import { sql } from "drizzle-orm";

import type { Database } from "@/lib/db/client";

export async function readDatabaseHealth(db: Database) {
  const tables = await db.all<{ name: string }>(sql`
    select name from sqlite_master
    where type='table' and name in ('plugins','plugin_localizations','approval_requests','user_profiles')
  `);
  const migration = await db.get<{ name: string }>(sql`
    select name from d1_migrations order by id desc limit 1
  `);
  const requiredTables = new Set(tables.map((entry) => entry.name));
  const ready = ["plugins", "plugin_localizations", "approval_requests", "user_profiles"].every(
    (name) => requiredTables.has(name),
  );
  return { ready, migration: migration?.name ?? null };
}
