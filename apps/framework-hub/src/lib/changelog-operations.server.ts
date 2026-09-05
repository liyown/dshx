import { waitUntil } from "cloudflare:workers";
import { requireApiToken } from "@/lib/auth/tokens.server";
import type { Database } from "@/lib/db/client";
import { createChangelogSchema, updateChangelogSchema } from "@/lib/changelog.contracts";
import {
  createChangelog,
  getChangelog,
  listChangelog,
  updateChangelog,
} from "@/lib/changelog.repository.server";
import { OperationHttpError, readOperationJson } from "@/lib/catalog/operations-v1.http";
import {
  sitemapCache,
  sitemapCacheRequest,
  SITEMAP_FRESH_CACHE_PATH,
  SITEMAP_STALE_CACHE_PATH,
} from "@/lib/sitemap-cache";

function requireChangelogOperator(db: Database, request: Request) {
  return requireApiToken(db, request, "catalog:write");
}

function operationEntry(row: NonNullable<Awaited<ReturnType<typeof getChangelog>>>) {
  const { contentJson, ...fields } = row;
  return { ...fields, content: contentJson };
}

function changelogChanged(request: Request) {
  const cache = sitemapCache();
  if (!cache) return;
  const origin = new URL(request.url).origin;
  waitUntil(
    Promise.all([
      cache.delete(sitemapCacheRequest(origin, SITEMAP_FRESH_CACHE_PATH)),
      cache.delete(sitemapCacheRequest(origin, SITEMAP_STALE_CACHE_PATH)),
    ]).catch((error: unknown) => console.error("Changelog sitemap invalidation failed", error)),
  );
}

export async function listChangelogForOperations(db: Database, request: Request) {
  await requireChangelogOperator(db, request);
  return { items: await listChangelog(db, true) };
}

export async function getChangelogForOperations(db: Database, request: Request, slug: string) {
  await requireChangelogOperator(db, request);
  const entry = await getChangelog(db, slug, true);
  if (!entry) throw new OperationHttpError(404, "changelog_not_found", "Changelog entry not found");
  return operationEntry(entry);
}

export async function createChangelogForOperations(db: Database, request: Request) {
  const actor = await requireChangelogOperator(db, request);
  const input = await readOperationJson(request, createChangelogSchema);
  const entry = await createChangelog(db, actor.token.id, input);
  changelogChanged(request);
  return operationEntry(entry);
}

export async function updateChangelogForOperations(db: Database, request: Request, slug: string) {
  const actor = await requireChangelogOperator(db, request);
  const input = await readOperationJson(request, updateChangelogSchema);
  const entry = await updateChangelog(db, actor.token.id, slug, input);
  changelogChanged(request);
  return operationEntry(entry);
}
