import { and, eq } from "drizzle-orm";

import type { Database } from "@/lib/db/client";
import { pluginMedia } from "@/lib/db/schema";

export async function findActivePluginMedia(db: Database, id: string) {
  const [media] = await db
    .select()
    .from(pluginMedia)
    .where(and(eq(pluginMedia.id, id), eq(pluginMedia.status, "active")))
    .limit(1);
  return media ?? null;
}
