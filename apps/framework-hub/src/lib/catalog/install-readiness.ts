import { sql, type SQL } from "drizzle-orm";

/**
 * The read half of the install readiness projection. Expects `p` (plugins) in
 * scope. Kept in a module without side effects so both the score formula and
 * the catalog query can share it without importing the writer.
 */
export const installReadySql: SQL = sql`exists(
  select 1 from plugin_readiness readiness
  where readiness.plugin_id = p.id and readiness.install_ready = 1
)`;
