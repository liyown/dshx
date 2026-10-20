import { requireApiToken } from "@/lib/auth/tokens.server";
import { replaceFeaturedPicksSchema } from "@/lib/blog.contracts";
import { readOperationJson } from "@/lib/catalog/operations-v1.http";
import type { Database } from "@/lib/db/client";
import { getFeaturedForOperations, replaceFeaturedPicks } from "@/lib/featured.repository.server";

export async function readFeaturedForOperations(db: Database, request: Request) {
  await requireApiToken(db, request, "catalog:write");
  return getFeaturedForOperations(db);
}

export async function replaceFeaturedForOperations(
  db: Database,
  request: Request,
  categorySlug: string,
) {
  await requireApiToken(db, request, "catalog:write");
  const input = await readOperationJson(request, replaceFeaturedPicksSchema);
  const category = await replaceFeaturedPicks(db, categorySlug, input.pluginSlugs);
  return { category };
}
