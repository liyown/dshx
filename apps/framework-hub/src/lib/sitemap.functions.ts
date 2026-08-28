import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireDatabase } from "@/lib/db/client";
import { listIndexableSitemapLocales } from "@/lib/sitemap.repository.server";

const sitemapResourceSchema = z.object({
  kind: z.enum(["plugin", "category", "publisher"]),
  value: z.string().min(1).max(160),
});

export const loadIndexableSitemapLocales = createServerFn({ method: "GET" })
  .validator(sitemapResourceSchema)
  .handler(({ data, context }) =>
    listIndexableSitemapLocales(requireDatabase(context), data.kind, data.value),
  );
