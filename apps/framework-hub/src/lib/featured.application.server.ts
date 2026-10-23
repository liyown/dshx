import type { Database } from "@/lib/db/client";
import { getFeaturedForOperations, replaceFeaturedPicks } from "@/lib/featured.repository.server";

export function readFeaturedPicks(db: Database) {
  return getFeaturedForOperations(db);
}

export async function writeFeaturedPicks(
  db: Database,
  categorySlug: string,
  pluginSlugs: readonly string[],
) {
  return { category: await replaceFeaturedPicks(db, categorySlug, pluginSlugs) };
}
