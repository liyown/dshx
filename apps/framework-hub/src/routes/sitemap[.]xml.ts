import { sql } from "drizzle-orm";
import { createFileRoute } from "@tanstack/react-router";

import { requireDatabase } from "@/lib/db/client";
import { requireBindings } from "@/lib/db/context";
import { DOC_SLUGS } from "@/lib/docs";
import { jsonError } from "@/lib/http";

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async ({ context }) => {
        try {
          const db = requireDatabase(context);
          const site = (requireBindings(context).SITE_URL ?? "https://dshx.dev").replace(/\/$/, "");
          const [plugins, categories, publishers] = await Promise.all([
            db.all<{ slug: string; locale: string; updated_at: number }>(sql`
        select p.slug,l.locale,p.updated_at from plugins p join plugin_localizations l on l.plugin_id=p.id
        where p.status='published' and p.lifecycle_status in ('active','unmaintained') and l.translation_status='ready'
        order by p.updated_at desc
      `),
            db.all<{ slug: string; locale: string }>(
              sql`select c.slug,l.locale from categories c join category_localizations l on l.category_id=c.id where c.active=1`,
            ),
            db.all<{ login: string; locale: string; updated_at: number }>(
              sql`select p.login,l.locale,p.updated_at from publishers p join publisher_localizations l on l.publisher_id=p.id where l.status='ready'`,
            ),
          ]);
          const base = ["en", "zh"].flatMap((locale) => [
            `${site}/${locale}`,
            `${site}/${locale}/plugins`,
            `${site}/${locale}/operations`,
            `${site}/${locale}/docs`,
            ...DOC_SLUGS.map((slug) => `${site}/${locale}/docs/${slug}`),
          ]);
          const urls = [
            ...base.map((loc) => `<url><loc>${escapeXml(loc)}</loc></url>`),
            ...["privacy", "terms", "community"].flatMap((document) =>
              ["en", "zh"].map(
                (locale) =>
                  `<url><loc>${escapeXml(`${site}/${locale}/legal/${document}`)}</loc></url>`,
              ),
            ),
            ...plugins.map(
              (plugin) =>
                `<url><loc>${escapeXml(`${site}/${plugin.locale}/plugins/${plugin.slug}`)}</loc><lastmod>${new Date(plugin.updated_at).toISOString()}</lastmod></url>`,
            ),
            ...categories.map(
              (category) =>
                `<url><loc>${escapeXml(`${site}/${category.locale}/categories/${category.slug}`)}</loc></url>`,
            ),
            ...publishers.map(
              (publisher) =>
                `<url><loc>${escapeXml(`${site}/${publisher.locale}/publishers/${publisher.login}`)}</loc><lastmod>${new Date(publisher.updated_at).toISOString()}</lastmod></url>`,
            ),
          ];
          return new Response(
            `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.join("")}</urlset>`,
            {
              headers: {
                "content-type": "application/xml; charset=utf-8",
                "cache-control": "public, max-age=3600",
              },
            },
          );
        } catch (error) {
          return jsonError(error);
        }
      },
    },
  },
});
