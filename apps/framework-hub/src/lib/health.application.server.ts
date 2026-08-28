import type { Database } from "@/lib/db/client";
import { readDatabaseHealth } from "@/lib/health.repository.server";

export function inspectDatabaseHealth(db: Database) {
  return readDatabaseHealth(db);
}
