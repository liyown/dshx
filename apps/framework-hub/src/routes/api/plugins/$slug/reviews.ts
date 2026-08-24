import { sql } from "drizzle-orm";
import { createFileRoute } from "@tanstack/react-router";

import { requireDatabase } from "@/lib/db/client";
import { jsonError } from "@/lib/http";

export const Route = createFileRoute("/api/plugins/$slug/reviews")({
  server: {
    handlers: {
      GET: async ({ request, context, params }) => {
        try {
          const db = requireDatabase(context);
          const url = new URL(request.url);
          const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? 20), 1), 50);
          const cursor = Number(url.searchParams.get("cursor") ?? Date.now() + 1);
          const rows = await db.all<{ created_at: number } & Record<string, unknown>>(sql`
            select r.id, r.rating, r.locale, r.body, r.created_at, r.updated_at,
              u.name as user_name, u.image as user_image,
              (select json_group_array(json_object('id', rr.id, 'locale', rr.locale, 'body', rr.body,
                'createdAt', rr.created_at, 'userName', ru.name))
               from review_replies rr join user ru on ru.id = rr.user_id
               where rr.review_id = r.id and rr.status = 'published') as replies
            from plugin_reviews r join plugins p on p.id = r.plugin_id join user u on u.id = r.user_id
            where p.slug = ${params.slug} and r.status = 'published' and r.created_at < ${cursor}
            order by r.created_at desc limit ${limit + 1}
          `);
          return Response.json({
            items: rows.slice(0, limit),
            nextCursor: rows.length > limit ? rows[limit - 1]?.created_at : null,
          });
        } catch (error) {
          return jsonError(error);
        }
      },
    },
  },
});
