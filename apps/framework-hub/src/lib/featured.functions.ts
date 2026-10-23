import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireDatabase } from "@/lib/db/client";
import { orderFeaturedSections, withFeaturedShelfCopy } from "@/lib/featured";
import { createTranslator } from "@/lib/i18n";
import { listFeaturedSections } from "@/lib/featured.repository.server";

export const loadFeatured = createServerFn({ method: "GET" })
  .validator(z.object({ locale: z.enum(["en", "zh"]) }))
  .handler(async ({ data, context }) => {
    const sections = await listFeaturedSections(requireDatabase(context), data.locale);
    const t = createTranslator(data.locale);
    return orderFeaturedSections(sections.map((section) => withFeaturedShelfCopy(section, t)));
  });
