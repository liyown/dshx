import { sql } from "drizzle-orm";

import type { Database } from "@/lib/db/client";

export async function refreshReviewMetrics(db: Database, pluginId: string) {
  await db.run(sql`
    insert into plugin_metrics_current(plugin_id,review_count,rating_sum,updated_at)
    values (${pluginId},
      (select count(*) from plugin_reviews where plugin_id=${pluginId} and status='published'),
      (select coalesce(sum(rating),0) from plugin_reviews where plugin_id=${pluginId} and status='published'),
      unixepoch()*1000)
    on conflict(plugin_id) do update set review_count=excluded.review_count,rating_sum=excluded.rating_sum,updated_at=excluded.updated_at
  `);
}
