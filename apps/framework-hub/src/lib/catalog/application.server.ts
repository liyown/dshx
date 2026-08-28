import type { Database } from "@/lib/db/client";
import type { MarketplaceListQuery, PluginListQuery } from "./contracts";
import {
  getCatalogMarketplacePlugin,
  getCatalogPlugin,
  listCatalogDiscovery,
  listCatalogMarketplace,
} from "./repository.server";

export function discoverCatalogPlugins(db: Database, query: PluginListQuery) {
  return listCatalogDiscovery(db, query);
}

export function readCatalogPlugin(db: Database, slug: string, locale: "en" | "zh") {
  return getCatalogPlugin(db, slug, locale);
}

export function listMarketplacePlugins(db: Database, query: MarketplaceListQuery) {
  return listCatalogMarketplace(db, query);
}

export function readMarketplacePlugin(db: Database, slug: string, locale: "en" | "zh") {
  return getCatalogMarketplacePlugin(db, slug, locale);
}
