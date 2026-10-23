import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireDatabase } from "@/lib/db/client";
import { indexableLocalesFor } from "@/lib/public-pages.server";

const sitemapResourceSchema = z.object({
  kind: z.enum(["plugin", "category", "publisher"]),
  value: z.string().min(1).max(160),
});

/** The locales in which a public page may be indexed, for its head and alternates. */
export const loadIndexableLocales = createServerFn({ method: "GET" })
  .validator(sitemapResourceSchema)
  .handler(({ data, context }) =>
    indexableLocalesFor(requireDatabase(context), { kind: data.kind, value: data.value }),
  );
