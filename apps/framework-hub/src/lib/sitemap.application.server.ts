import type { Database } from "@/lib/db/client";
import {
  buildSitemapXml,
  createSitemapEntries,
  responseForSitemap,
  sitemapEtag,
} from "@/lib/sitemap";
import { listIndexablePages } from "@/lib/public-pages.server";

export async function buildCurrentSitemap(db: Database, site: string): Promise<Response> {
  const entries = createSitemapEntries(site, await listIndexablePages(db));
  const { xml, warnings } = buildSitemapXml(entries);
  return responseForSitemap(xml, await sitemapEtag(xml), warnings);
}
