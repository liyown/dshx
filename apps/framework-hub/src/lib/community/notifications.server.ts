import type { Database } from "@/lib/db/client";
import { parameterizedSql } from "@/lib/db/parameterized-sql";
import { HttpError } from "@/lib/http";
import type { NotificationRow } from "./contracts";

/**
 * The member's notification inbox.
 *
 * Notifications are written by the domains that cause them; this module only
 * reads them back and marks one read for its owner.
 */

function parseJson<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export async function listNotifications(binding: Database, userId: string) {
  const result = await binding.all<NotificationRow & { payload_json: string }>(
    parameterizedSql(
      `select n.*,case when nr.notification_id is null then 0 else 1 end is_read
       from notification_events n left join notification_reads nr on nr.notification_id=n.id and nr.user_id=n.user_id
       where n.user_id=? order by n.created_at desc limit 100`,
      [userId],
    ),
  );
  return {
    items: result.map((item) => ({
      ...item,
      payload: parseJson(String(item["payload_json"] ?? "{}"), {}),
    })),
  };
}

export async function readNotification(binding: Database, id: string, userId: string) {
  const event = await binding.get(
    parameterizedSql("select id from notification_events where id=? and user_id=?", [id, userId]),
  );
  if (!event) throw new HttpError(404, "Notification not found", "notification_not_found");
  await binding.run(
    parameterizedSql(
      "insert into notification_reads(user_id,notification_id,read_at) values(?,?,?) on conflict do update set read_at=excluded.read_at",
      [userId, id, Date.now()],
    ),
  );
  return { id, read: true };
}
