import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireDatabase } from "@/lib/db/client";
import type { ChangelogEntry } from "@/lib/changelog";
import { getChangelog, listChangelog } from "@/lib/changelog.repository.server";

export const loadChangelog = createServerFn({ method: "GET" }).handler(({ context }) =>
  listChangelog(requireDatabase(context)),
);

export const loadChangelogDetail = createServerFn({ method: "GET" })
  .validator(z.object({ slug: z.string().min(1).max(120), locale: z.enum(["en", "zh"]) }))
  .handler(async ({ data, context }) => {
    const db = requireDatabase(context);
    const [record, summaries] = await Promise.all([getChangelog(db, data.slug), listChangelog(db)]);
    if (!record) return null;
    const index = summaries.findIndex((entry) => entry.slug === data.slug);
    // A concurrently unpublished article must not leak through the detail loader.
    if (index < 0) return null;
    // Keep the article's metadata and body on the same database revision.
    const entry: ChangelogEntry = {
      slug: record.slug,
      version: record.version,
      product: record.product,
      channel: record.channel,
      status: record.status,
      revision: record.revision,
      publishedAt: record.publishedAt,
      updatedAt: record.updatedAt.toISOString(),
      copy: {
        en: { title: record.contentJson.en.title, description: record.contentJson.en.description },
        zh: { title: record.contentJson.zh.title, description: record.contentJson.zh.description },
      },
    };
    return {
      entry,
      content: record.contentJson[data.locale],
      newer: index > 0 ? summaries[index - 1] : undefined,
      older: summaries[index + 1],
    };
  });
