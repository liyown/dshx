import type { Database } from "@/lib/db/client";
import {
  buildSitemapXml,
  createSitemapEntries,
  responseForSitemap,
  sitemapEtag,
} from "@/lib/sitemap";
import { listSitemapDatabaseRows } from "@/lib/sitemap.repository.server";

export async function buildCurrentSitemap(db: Database, site: string): Promise<Response> {
  const rows = await listSitemapDatabaseRows(db);
  const entries = createSitemapEntries(site, rows);
  const { xml, warnings } = buildSitemapXml(entries);
  return responseForSitemap(xml, await sitemapEtag(xml), warnings);
}
