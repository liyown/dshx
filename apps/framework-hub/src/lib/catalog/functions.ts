import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { marketplaceListQuerySchema, pluginListQuerySchema } from "./contracts";
import {
  getCatalogPlugin,
  listCatalogDiscovery,
  listCatalogMarketplace,
} from "./repository.server";
import { requireDatabase } from "@/lib/db/client";
import { requireBindings } from "@/lib/db/context";

export const loadCatalog = createServerFn({ method: "GET" })
  .validator(pluginListQuerySchema)
  .handler(async ({ data, context }) => {
    return listCatalogDiscovery(requireDatabase(context), data);
  });

export const loadMarketplaceCatalog = createServerFn({ method: "GET" })
  .validator(marketplaceListQuerySchema)
  .handler(async ({ data, context }) => {
    return listCatalogMarketplace(requireDatabase(context), data);
  });

const detailInput = z.object({ slug: z.string().min(1).max(100), locale: z.enum(["en", "zh"]) });

export const loadCatalogDetail = createServerFn({ method: "GET" })
  .validator(detailInput)
  .handler(async ({ data, context }) => {
    const detail = await getCatalogPlugin(requireDatabase(context), data.slug, data.locale);
    return detail
      ? { ...detail, siteUrl: requireBindings(context).SITE_URL ?? "https://dshx.io" }
      : null;
  });
