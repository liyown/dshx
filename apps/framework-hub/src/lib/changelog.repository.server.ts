import { and, desc, eq, lte, sql } from "drizzle-orm";

import type { ChangelogEntry } from "@/lib/changelog";
import type { CreateChangelogInput, UpdateChangelogInput } from "@/lib/changelog.contracts";
import { OperationHttpError } from "@/lib/catalog/operations-v1.http";
import type { Database } from "@/lib/db/client";
import { changelogEntries as entries } from "@/lib/db/schema";

function published() {
  return and(
    eq(entries.status, "published"),
    lte(entries.publishedAt, new Date().toISOString().slice(0, 10)),
  );
}

const summaryColumns = {
  slug: entries.slug,
  status: entries.status,
  revision: entries.revision,
  version: entries.version,
  product: entries.product,
  channel: entries.channel,
  publishedAt: entries.publishedAt,
  updatedAt: entries.updatedAt,
  enTitle: sql<string>`json_extract(${entries.contentJson}, '$.en.title')`,
  enDescription: sql<string>`json_extract(${entries.contentJson}, '$.en.description')`,
  zhTitle: sql<string>`json_extract(${entries.contentJson}, '$.zh.title')`,
  zhDescription: sql<string>`json_extract(${entries.contentJson}, '$.zh.description')`,
};

export async function listChangelog(
  db: Database,
  includeDrafts = false,
): Promise<ChangelogEntry[]> {
  const rows = await db
    .select(summaryColumns)
    .from(entries)
    .where(includeDrafts ? undefined : published())
    .orderBy(desc(entries.publishedAt), desc(entries.slug));
  return rows.map(({ enTitle, enDescription, zhTitle, zhDescription, updatedAt, ...row }) => ({
    ...row,
    updatedAt: updatedAt.toISOString(),
    copy: {
      en: { title: enTitle, description: enDescription },
      zh: { title: zhTitle, description: zhDescription },
    },
  }));
}

export async function getChangelog(db: Database, slug: string, includeDrafts = false) {
  const [row] = await db
    .select()
    .from(entries)
    .where(and(eq(entries.slug, slug), includeDrafts ? undefined : published()))
    .limit(1);
  return row ?? null;
}

export async function createChangelog(db: Database, tokenId: string, input: CreateChangelogInput) {
  const { content, ...fields } = input;
  const [created] = await db
    .insert(entries)
    .values({
      ...fields,
      id: crypto.randomUUID(),
      contentJson: content,
      updatedByTokenId: tokenId,
    })
    .onConflictDoNothing({ target: entries.slug })
    .returning();
  if (!created)
    throw new OperationHttpError(
      409,
      "changelog_slug_conflict",
      "This changelog slug already exists; fetch it before editing.",
    );
  return created;
}

export async function updateChangelog(
  db: Database,
  tokenId: string,
  slug: string,
  input: UpdateChangelogInput,
) {
  const { ifRevision, content, ...fields } = input;
  const [updated] = await db
    .update(entries)
    .set({
      ...fields,
      contentJson: content,
      revision: sql`${entries.revision} + 1`,
      updatedAt: new Date(),
      updatedByTokenId: tokenId,
    })
    .where(and(eq(entries.slug, slug), eq(entries.revision, ifRevision)))
    .returning();
  if (updated) return updated;
  if (!(await getChangelog(db, slug, true)))
    throw new OperationHttpError(404, "changelog_not_found", "Changelog entry not found");
  throw new OperationHttpError(
    409,
    "revision_conflict",
    "The changelog changed. Fetch it, merge your changes, and retry with its current revision.",
    false,
    {
      repairHint: `GET /api/ops/v1/changelog/${slug}, then use its revision as ifRevision.`,
    },
  );
}
