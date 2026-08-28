import type { BatchItem } from "drizzle-orm/batch";

import type { Database } from "./client";

type CompiledBatchStatement = BatchItem<"sqlite"> & {
  getQuery(): { readonly sql: string; readonly params: readonly unknown[] };
};

export async function runDrizzleBatch(
  db: Database,
  statements: readonly BatchItem<"sqlite">[],
): Promise<D1Result[]> {
  if (statements.length === 0) return [];
  const prepared = statements.map((statement) => {
    const compiled = statement as CompiledBatchStatement;
    if (typeof compiled.getQuery !== "function")
      throw new TypeError("Drizzle batch statement must expose a compiled query");
    const query = compiled.getQuery();
    return db.$client.prepare(query.sql).bind(...query.params);
  });
  return db.$client.batch(prepared);
}
