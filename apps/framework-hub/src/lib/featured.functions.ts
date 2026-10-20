import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireDatabase } from "@/lib/db/client";
import { listFeaturedSections } from "@/lib/featured.repository.server";

export const loadFeatured = createServerFn({ method: "GET" })
  .validator(z.object({ locale: z.enum(["en", "zh"]) }))
  .handler(({ data, context }) => listFeaturedSections(requireDatabase(context), data.locale));
