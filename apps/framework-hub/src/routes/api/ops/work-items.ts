import { sql } from "drizzle-orm";
import { createFileRoute } from "@tanstack/react-router";

import { requireApiToken } from "@/lib/auth/tokens.server";
import { requireD1, requireDatabase } from "@/lib/db/client";
import { jsonError } from "@/lib/http";

export const Route = createFileRoute("/api/ops/work-items")({
  server: {
    handlers: {
      GET: async ({ request, context }) => {
        try {
          const db = requireDatabase(context);
          await requireApiToken(db, request, "catalog:write");
          const rows = await db.all(sql`
            with current as (
              select p.*,(select i.content_hash from catalog_sync_items i
                where i.run_id=p.active_sync_run_id
                  and json_extract(i.payload_json,'$.plugin.id')=p.id limit 1
              ) current_content_source_hash
              from plugins p
            )
            select p.id pluginId,p.slug,p.package_name packageName,wanted.locale,
              l.translation_status translationStatus,l.source_content_hash sourceContentHash,
              p.current_content_source_hash currentContentSourceHash,
              l.display_name displayName,l.short_description shortDescription,
              l.overview_markdown overviewMarkdown,l.seo_title seoTitle,
              l.seo_description seoDescription
            from current p cross join (select 'en' locale union all select 'zh') wanted
            left join plugin_localizations l on l.plugin_id=p.id and l.locale=wanted.locale
            where p.status in ('draft','published') and (
              l.plugin_id is null or l.translation_status in ('pending','stale','rejected') or
              (p.current_content_source_hash is not null and
                l.source_content_hash<>p.current_content_source_hash)
            )
            order by p.updated_at desc limit 100
          `);
          const submissions = await requireD1(context)
            .prepare(
              `select id,repository_url repositoryUrl,repository_full_name repositoryFullName,
                      status,source_hash sourceHash,created_at createdAt
               from plugin_submissions where status in ('queued','discovered')
               order by created_at asc limit 500`,
            )
            .all<Record<string, unknown>>();
          return Response.json({
            catalogItems: rows,
            submissions: submissions.results ?? [],
          });
        } catch (error) {
          return jsonError(error);
        }
      },
    },
  },
});
