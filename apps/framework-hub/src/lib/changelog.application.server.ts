import {
  createChangelog,
  getChangelog,
  listChangelog,
  updateChangelog,
} from "@/lib/changelog.repository.server";
import type { CreateChangelogInput, UpdateChangelogInput } from "@/lib/changelog.contracts";
import { OperationHttpError } from "@/lib/catalog/operations-v1.http";
import type { Database } from "@/lib/db/client";

/** The Operations API view of a changelog entry: the stored bilingual JSON is `content`. */
export async function listChangelogEntries(db: Database) {
  return { items: await listChangelog(db, true) };
}

export async function readChangelogEntry(db: Database, slug: string) {
  const entry = await getChangelog(db, slug, true);
  if (!entry) throw new OperationHttpError(404, "changelog_not_found", "Changelog entry not found");
  return entryView(entry);
}

export async function writeChangelogEntry(
  db: Database,
  tokenId: string,
  input: CreateChangelogInput,
) {
  return entryView(await createChangelog(db, tokenId, input));
}

export async function editChangelogEntry(
  db: Database,
  tokenId: string,
  slug: string,
  input: UpdateChangelogInput,
) {
  return entryView(await updateChangelog(db, tokenId, slug, input));
}

function entryView(record: NonNullable<Awaited<ReturnType<typeof getChangelog>>>) {
  const { contentJson, ...fields } = record;
  return { ...fields, content: contentJson };
}
