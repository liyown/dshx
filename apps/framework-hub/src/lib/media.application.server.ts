import type { Database } from "@/lib/db/client";
import { findActivePluginMedia } from "@/lib/catalog/media.repository.server";

export function readActivePluginMedia(db: Database, id: string) {
  return findActivePluginMedia(db, id);
}
