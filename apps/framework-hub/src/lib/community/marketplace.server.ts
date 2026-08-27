import type { ApprovalCreateInput } from "@/lib/approvals/contracts";
import { createUserApproval } from "@/lib/approvals/service.server";
import { sanitizeUserText } from "./contracts";
import { HttpError, uuid } from "@/lib/http";

function parseJson<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function collectionSlug(value: string) {
  const slug = value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 72);
  return slug || `collection-${uuid().slice(0, 8)}`;
}

export async function getPublicUser(binding: D1Database, login: string) {
  const profile = await binding
    .prepare(
      `select up.user_id,up.github_login,up.display_name,up.avatar_url,up.bio,up.role,up.created_at,
              u.name auth_name,u.image auth_image
       from user_profiles up join user u on u.id=up.user_id
       left join user_aliases ua on ua.user_id=up.user_id
       where up.github_login=? or ua.github_login=? limit 1`,
    )
    .bind(login, login)
    .first<Record<string, unknown>>();
  if (!profile) throw new HttpError(404, "User not found", "user_not_found");
  const userId = String(profile["user_id"]);
  const [plugins, collections, bookmarks, counts] = await Promise.all([
    binding
      .prepare(
        `select p.slug,p.name,p.description,p.package_name,p.latest_version
         from plugin_maintainers pm join plugins p on p.id=pm.plugin_id
         where pm.user_id=? and pm.revoked_at is null and p.status='published'
         order by p.updated_at desc`,
      )
      .bind(userId)
      .all<Record<string, unknown>>(),
    binding
      .prepare(
        `select c.id,c.slug,c.name,c.description,c.updated_at,count(cp.plugin_id) plugin_count
         from collections c left join collection_plugins cp on cp.collection_id=c.id
         where c.user_id=? and c.visibility='public'
         group by c.id order by c.updated_at desc`,
      )
      .bind(userId)
      .all<Record<string, unknown>>(),
    binding
      .prepare(
        `select p.slug,p.name,p.description,p.package_name
         from plugin_bookmarks b join plugins p on p.id=b.plugin_id
         where b.user_id=? and p.status='published'
         order by b.created_at desc limit 100`,
      )
      .bind(userId)
      .all<Record<string, unknown>>(),
    binding
      .prepare(
        `select
          (select count(*) from plugin_reviews where user_id=? and status='published') reviews,
          (select count(*) from review_replies where user_id=? and status='published') replies,
          (select count(*) from plugin_maintainers where user_id=? and revoked_at is null) maintained_plugins`,
      )
      .bind(userId, userId, userId)
      .first<Record<string, number>>(),
  ]);
  return {
    id: userId,
    login: profile["github_login"],
    displayName: profile["display_name"] ?? profile["auth_name"],
    avatarUrl: profile["avatar_url"] ?? profile["auth_image"],
    bio: profile["bio"],
    role: profile["role"],
    joinedAt: profile["created_at"],
    plugins: plugins.results ?? [],
    collections: collections.results ?? [],
    bookmarks: bookmarks.results ?? [],
    contributions: counts ?? { reviews: 0, replies: 0, maintained_plugins: 0 },
  };
}

export async function getPublicPublisher(binding: D1Database, login: string, locale: "en" | "zh") {
  const publisher = await binding
    .prepare(
      `select p.*,
        coalesce(case when l.status='ready' then l.display_name end,p.display_name,p.login) localized_name,
        coalesce(case when l.status='ready' then l.bio end,p.bio) localized_bio,
        l.seo_title,l.seo_description,l.status localization_status
       from publishers p
       left join publisher_aliases pa on pa.publisher_id=p.id
       left join publisher_localizations l on l.publisher_id=p.id and l.locale=?
       where p.login=? or pa.login=? limit 1`,
    )
    .bind(locale, login, login)
    .first<Record<string, unknown>>();
  if (!publisher) throw new HttpError(404, "Publisher not found", "publisher_not_found");
  const plugins = await binding
    .prepare(
      `select p.slug,p.name,p.description,p.package_name,p.latest_version,p.badge,p.updated_at,
              coalesce(m.github_stars,0) github_stars
       from plugins p left join plugin_metrics_current m on m.plugin_id=p.id
       where p.publisher_id=? and p.status='published' and p.lifecycle_status in ('active','unmaintained')
       order by p.updated_at desc`,
    )
    .bind(publisher["id"])
    .all<Record<string, unknown>>();
  return { publisher, plugins: plugins.results ?? [] };
}

export async function getCollection(binding: D1Database, id: string, viewerUserId?: string | null) {
  const collection = await binding
    .prepare(
      `select c.*,up.github_login owner_login,coalesce(up.display_name,u.name) owner_name
       from collections c join user_profiles up on up.user_id=c.user_id join user u on u.id=c.user_id
       where c.id=? limit 1`,
    )
    .bind(id)
    .first<Record<string, unknown>>();
  if (
    !collection ||
    (collection["visibility"] === "private" && collection["user_id"] !== viewerUserId)
  )
    throw new HttpError(404, "Collection not found", "collection_not_found");
  const plugins = await binding
    .prepare(
      `select p.slug,p.name,p.description,p.package_name,p.latest_version,p.badge,cp.sort_order,cp.added_at
       from collection_plugins cp join plugins p on p.id=cp.plugin_id
       where cp.collection_id=? and p.status='published'
       order by cp.sort_order asc,cp.added_at asc`,
    )
    .bind(id)
    .all<Record<string, unknown>>();
  return { collection, plugins: plugins.results ?? [] };
}

export async function getMe(binding: D1Database, userId: string) {
  const profile = await binding
    .prepare(
      `select up.*,u.name,u.email,u.image,
        (select count(*) from notification_events n left join notification_reads nr on nr.notification_id=n.id and nr.user_id=n.user_id
         where n.user_id=up.user_id and nr.notification_id is null) unread_notifications
       from user_profiles up join user u on u.id=up.user_id where up.user_id=?`,
    )
    .bind(userId)
    .first<Record<string, unknown>>();
  if (!profile) throw new HttpError(404, "Profile not found", "profile_not_found");
  return profile;
}

export async function updateProfile(
  binding: D1Database,
  userId: string,
  input: { displayName: string; bio?: string | null | undefined; preferredLocale: "en" | "zh" },
) {
  await binding
    .prepare(
      "update user_profiles set display_name=?,bio=?,preferred_locale=?,updated_at=? where user_id=?",
    )
    .bind(
      sanitizeUserText(input.displayName),
      sanitizeUserText(input.bio),
      input.preferredLocale,
      Date.now(),
      userId,
    )
    .run();
  return getMe(binding, userId);
}

export async function setPluginRelationship(
  binding: D1Database,
  userId: string,
  pluginId: string,
  kind: "bookmark" | "follow",
  enabled: boolean,
) {
  const plugin = await binding
    .prepare("select id from plugins where id=? and status='published'")
    .bind(pluginId)
    .first();
  if (!plugin) throw new HttpError(404, "Plugin not found", "plugin_not_found");
  const table = kind === "bookmark" ? "plugin_bookmarks" : "plugin_follows";
  if (enabled) {
    await binding
      .prepare(
        `insert into ${table}(user_id,plugin_id,created_at) values(?,?,?) on conflict do nothing`,
      )
      .bind(userId, pluginId, Date.now())
      .run();
  } else {
    await binding
      .prepare(`delete from ${table} where user_id=? and plugin_id=?`)
      .bind(userId, pluginId)
      .run();
  }
  return { pluginId, kind, enabled };
}

export async function listRelationships(binding: D1Database, userId: string) {
  const [bookmarks, pluginFollows, publisherFollows] = await Promise.all([
    binding
      .prepare(
        `select p.id,p.slug,p.name,p.description,p.package_name,b.created_at
         from plugin_bookmarks b join plugins p on p.id=b.plugin_id
         where b.user_id=? and p.status='published' order by b.created_at desc`,
      )
      .bind(userId)
      .all<Record<string, unknown>>(),
    binding
      .prepare(
        `select p.id,p.slug,p.name,p.description,p.package_name,f.created_at
         from plugin_follows f join plugins p on p.id=f.plugin_id
         where f.user_id=? and p.status='published' order by f.created_at desc`,
      )
      .bind(userId)
      .all<Record<string, unknown>>(),
    binding
      .prepare(
        `select p.id,p.login,p.display_name,p.avatar_url,f.created_at
         from publisher_follows f join publishers p on p.id=f.publisher_id
         where f.user_id=? order by f.created_at desc`,
      )
      .bind(userId)
      .all<Record<string, unknown>>(),
  ]);
  return {
    bookmarks: bookmarks.results ?? [],
    pluginFollows: pluginFollows.results ?? [],
    publisherFollows: publisherFollows.results ?? [],
  };
}

export async function setPublisherFollow(
  binding: D1Database,
  userId: string,
  publisherId: string,
  enabled: boolean,
) {
  const publisher = await binding
    .prepare("select id from publishers where id=?")
    .bind(publisherId)
    .first();
  if (!publisher) throw new HttpError(404, "Publisher not found", "publisher_not_found");
  if (enabled) {
    await binding
      .prepare(
        "insert into publisher_follows(user_id,publisher_id,created_at) values(?,?,?) on conflict do nothing",
      )
      .bind(userId, publisherId, Date.now())
      .run();
  } else {
    await binding
      .prepare("delete from publisher_follows where user_id=? and publisher_id=?")
      .bind(userId, publisherId)
      .run();
  }
  return { publisherId, enabled };
}

export async function listCollections(binding: D1Database, userId: string) {
  const result = await binding
    .prepare(
      `select c.*,count(cp.plugin_id) plugin_count from collections c
       left join collection_plugins cp on cp.collection_id=c.id
       where c.user_id=? group by c.id order by c.updated_at desc`,
    )
    .bind(userId)
    .all<Record<string, unknown>>();
  return { items: result.results ?? [] };
}

export async function createCollection(
  binding: D1Database,
  userId: string,
  input: {
    name: string;
    description?: string | null | undefined;
    visibility: "public" | "private";
  },
) {
  const id = uuid();
  let slug = collectionSlug(input.name);
  const collision = await binding
    .prepare("select id from collections where user_id=? and slug=?")
    .bind(userId, slug)
    .first();
  if (collision) slug = `${slug.slice(0, 62)}-${id.slice(0, 8)}`;
  await binding
    .prepare(
      "insert into collections(id,user_id,slug,name,description,visibility,created_at,updated_at) values(?,?,?,?,?,?,?,?)",
    )
    .bind(
      id,
      userId,
      slug,
      sanitizeUserText(input.name),
      sanitizeUserText(input.description),
      input.visibility,
      Date.now(),
      Date.now(),
    )
    .run();
  return getCollection(binding, id, userId);
}

async function requireOwnedCollection(binding: D1Database, id: string, userId: string) {
  const collection = await binding
    .prepare("select * from collections where id=? and user_id=?")
    .bind(id, userId)
    .first<Record<string, unknown>>();
  if (!collection) throw new HttpError(404, "Collection not found", "collection_not_found");
  return collection;
}

export async function updateCollection(
  binding: D1Database,
  id: string,
  userId: string,
  input: {
    name?: string | undefined;
    description?: string | null | undefined;
    visibility?: "public" | "private" | undefined;
  },
) {
  const current = await requireOwnedCollection(binding, id, userId);
  await binding
    .prepare("update collections set name=?,description=?,visibility=?,updated_at=? where id=?")
    .bind(
      sanitizeUserText(input.name ?? String(current["name"])),
      input.description === undefined
        ? current["description"]
        : sanitizeUserText(input.description),
      input.visibility ?? current["visibility"],
      Date.now(),
      id,
    )
    .run();
  return getCollection(binding, id, userId);
}

export async function deleteCollection(binding: D1Database, id: string, userId: string) {
  await requireOwnedCollection(binding, id, userId);
  await binding.prepare("delete from collections where id=?").bind(id).run();
  return { id, deleted: true };
}

export async function setCollectionPlugin(
  binding: D1Database,
  collectionId: string,
  pluginId: string,
  userId: string,
  enabled: boolean,
) {
  await requireOwnedCollection(binding, collectionId, userId);
  if (enabled) {
    const plugin = await binding
      .prepare("select id from plugins where id=? and status='published'")
      .bind(pluginId)
      .first();
    if (!plugin) throw new HttpError(404, "Plugin not found", "plugin_not_found");
    await binding
      .prepare(
        `insert into collection_plugins(collection_id,plugin_id,sort_order,added_at)
         values(?,?,(select coalesce(max(sort_order),-1)+1 from collection_plugins where collection_id=?),?)
         on conflict do nothing`,
      )
      .bind(collectionId, pluginId, collectionId, Date.now())
      .run();
  } else {
    await binding
      .prepare("delete from collection_plugins where collection_id=? and plugin_id=?")
      .bind(collectionId, pluginId)
      .run();
  }
  await binding
    .prepare("update collections set updated_at=? where id=?")
    .bind(Date.now(), collectionId)
    .run();
  return getCollection(binding, collectionId, userId);
}

export async function listNotifications(binding: D1Database, userId: string) {
  const result = await binding
    .prepare(
      `select n.*,case when nr.notification_id is null then 0 else 1 end is_read
       from notification_events n left join notification_reads nr on nr.notification_id=n.id and nr.user_id=n.user_id
       where n.user_id=? order by n.created_at desc limit 100`,
    )
    .bind(userId)
    .all<Record<string, unknown>>();
  return {
    items: (result.results ?? []).map((item) => ({
      ...item,
      payload: parseJson(String(item["payload_json"] ?? "{}"), {}),
    })),
  };
}

export async function readNotification(binding: D1Database, id: string, userId: string) {
  const event = await binding
    .prepare("select id from notification_events where id=? and user_id=?")
    .bind(id, userId)
    .first();
  if (!event) throw new HttpError(404, "Notification not found", "notification_not_found");
  await binding
    .prepare(
      "insert into notification_reads(user_id,notification_id,read_at) values(?,?,?) on conflict do update set read_at=excluded.read_at",
    )
    .bind(userId, id, Date.now())
    .run();
  return { id, read: true };
}

function normalizeRepositoryUrl(raw: string) {
  const url = new URL(raw);
  const parts = url.pathname.split("/").filter(Boolean);
  if (url.hostname.toLowerCase() !== "github.com" || parts.length !== 2)
    throw new HttpError(422, "Use a GitHub repository root URL", "invalid_repository_url");
  const owner = parts[0]!;
  const repository = parts[1]!.replace(/\.git$/, "");
  if (!/^[A-Za-z0-9_.-]+$/.test(owner) || !/^[A-Za-z0-9_.-]+$/.test(repository))
    throw new HttpError(422, "Invalid GitHub repository name", "invalid_repository_url");
  return { url: `https://github.com/${owner}/${repository}`, fullName: `${owner}/${repository}` };
}

export async function listSubmissions(binding: D1Database, userId: string) {
  const result = await binding
    .prepare(
      `select id,user_id,repository_url,repository_full_name,status,source_hash,
        resolution_json,created_at,updated_at
       from plugin_submissions where user_id=? order by created_at desc`,
    )
    .bind(userId)
    .all<Record<string, unknown>>();
  return { items: result.results ?? [] };
}

export async function createSubmission(
  binding: D1Database,
  input: {
    userId: string | null;
    submitterKey: string;
    repositoryUrl: string;
    idempotencyKey: string;
  },
) {
  const existing = await binding
    .prepare(
      `select id,user_id,repository_url,repository_full_name,status,source_hash,
        resolution_json,created_at,updated_at
       from plugin_submissions where submitter_key=? and idempotency_key=?`,
    )
    .bind(input.submitterKey, input.idempotencyKey)
    .first<Record<string, unknown>>();
  if (existing) return existing;
  const repository = normalizeRepositoryUrl(input.repositoryUrl);
  const recent = await binding
    .prepare(
      "select count(*) count from plugin_submissions where submitter_key=? and created_at>=?",
    )
    .bind(input.submitterKey, Date.now() - 60_000)
    .first<{ count: number }>();
  if ((recent?.count ?? 0) >= 10)
    throw new HttpError(429, "Too many plugin submissions", "rate_limited");
  const id = uuid();
  await binding
    .prepare(
      "insert or ignore into plugin_submissions(id,user_id,submitter_key,repository_url,repository_full_name,status,idempotency_key,created_at,updated_at) values(?,?,?,?,?,?,?,?,?)",
    )
    .bind(
      id,
      input.userId,
      input.submitterKey,
      repository.url,
      repository.fullName,
      "queued",
      input.idempotencyKey,
      Date.now(),
      Date.now(),
    )
    .run();
  return binding
    .prepare(
      `select id,user_id,repository_url,repository_full_name,status,source_hash,
        resolution_json,created_at,updated_at
       from plugin_submissions where submitter_key=? and idempotency_key=?`,
    )
    .bind(input.submitterKey, input.idempotencyKey)
    .first<Record<string, unknown>>();
}

export async function anonymousSubmissionKey(request: Request, secret: string) {
  const forwarded =
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown";
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(forwarded));
  return `anonymous:${Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

export async function listAppeals(binding: D1Database, userId: string) {
  const result = await binding
    .prepare(
      `select a.*,r.status approval_status,r.effect_status
       from moderation_appeals a left join approval_requests r on r.id=a.approval_request_id
       where a.user_id=? order by a.created_at desc`,
    )
    .bind(userId)
    .all<Record<string, unknown>>();
  return { items: result.results ?? [] };
}

export async function createAppeal(
  binding: D1Database,
  userId: string,
  input: { moderationActionId: string; statement: string; idempotencyKey: string },
) {
  const existing = await binding
    .prepare("select * from moderation_appeals where user_id=? and idempotency_key=?")
    .bind(userId, input.idempotencyKey)
    .first<Record<string, unknown>>();
  if (existing) return existing;
  const action = await binding
    .prepare("select * from moderation_actions where id=?")
    .bind(input.moderationActionId)
    .first<Record<string, unknown>>();
  if (!action)
    throw new HttpError(404, "Moderation action not found", "moderation_action_not_found");
  const targetType = String(action["target_type"]);
  const targetId = String(action["target_id"]);
  const actionName = String(action["action"]);
  let owned = targetType === "user" && targetId === userId;
  if (targetType === "review") {
    owned = Boolean(
      await binding
        .prepare("select id from plugin_reviews where id=? and user_id=?")
        .bind(targetId, userId)
        .first(),
    );
  }
  if (targetType === "reply") {
    owned = Boolean(
      await binding
        .prepare("select id from review_replies where id=? and user_id=?")
        .bind(targetId, userId)
        .first(),
    );
  }
  if (!owned) throw new HttpError(403, "This moderation action is not yours", "appeal_forbidden");

  const appealId = uuid();
  let approval: ApprovalCreateInput;
  if (actionName === "hide" && (targetType === "review" || targetType === "reply")) {
    approval = {
      kind: "appeal_resolution",
      risk: "high",
      subjectType: targetType,
      subjectId: targetId,
      title: `Appeal to restore ${targetType}`,
      summary: sanitizeUserText(input.statement)!,
      evidence: {
        appealId,
        moderationActionId: input.moderationActionId,
        statement: input.statement,
      },
      effect: {
        kind: "restore_content",
        executionMode: "server",
        input: { targetType, targetId },
      },
      preconditions: { status: "hidden" },
      policyVersion: "dshx-community-1",
      idempotencyKey: `appeal:${userId}:${input.idempotencyKey}`,
    };
  } else if (["restrict", "ban"].includes(actionName) && targetType === "user") {
    approval = {
      kind: "appeal_resolution",
      risk: "critical",
      subjectType: "user",
      subjectId: userId,
      title: `Appeal ${actionName} decision`,
      summary: sanitizeUserText(input.statement)!,
      evidence: {
        appealId,
        moderationActionId: input.moderationActionId,
        statement: input.statement,
      },
      effect: {
        kind: "set_user_access",
        executionMode: "server",
        input: {
          userId,
          action: actionName === "ban" ? "unban" : "unrestrict",
          reason: "Approved moderation appeal",
        },
      },
      preconditions: { status: actionName === "ban" ? "banned" : "restricted" },
      policyVersion: "dshx-community-1",
      idempotencyKey: `appeal:${userId}:${input.idempotencyKey}`,
    };
  } else {
    throw new HttpError(409, "This moderation action cannot be appealed", "appeal_not_supported");
  }
  const approvalResult = await createUserApproval(binding, userId, approval);
  await binding
    .prepare(
      `insert into moderation_appeals(
        id,user_id,moderation_action_id,statement,status,idempotency_key,approval_request_id,created_at
       ) values(?,?,?,?,?,?,?,?)`,
    )
    .bind(
      appealId,
      userId,
      input.moderationActionId,
      sanitizeUserText(input.statement),
      "pending",
      input.idempotencyKey,
      approvalResult.id,
      Date.now(),
    )
    .run();
  return binding.prepare("select * from moderation_appeals where id=?").bind(appealId).first();
}

export async function setUserBlock(
  binding: D1Database,
  blockerUserId: string,
  blockedUserId: string,
  enabled: boolean,
) {
  if (blockerUserId === blockedUserId)
    throw new HttpError(422, "You cannot block yourself", "invalid_block");
  const target = await binding
    .prepare("select user_id from user_profiles where user_id=?")
    .bind(blockedUserId)
    .first();
  if (!target) throw new HttpError(404, "User not found", "user_not_found");
  if (enabled) {
    await binding
      .prepare(
        "insert into user_blocks(blocker_user_id,blocked_user_id,created_at) values(?,?,?) on conflict do nothing",
      )
      .bind(blockerUserId, blockedUserId, Date.now())
      .run();
  } else {
    await binding
      .prepare("delete from user_blocks where blocker_user_id=? and blocked_user_id=?")
      .bind(blockerUserId, blockedUserId)
      .run();
  }
  return { blockedUserId, enabled };
}

export async function anonymizeAccount(binding: D1Database, userId: string) {
  const suffix = userId.replaceAll("-", "").slice(0, 12);
  const now = Date.now();
  const statements = [
    "delete from session where user_id=?",
    "delete from account where user_id=?",
    "delete from api_tokens where user_id=?",
    "delete from cli_authorizations where approved_by_user_id=?",
    "delete from plugin_bookmarks where user_id=?",
    "delete from plugin_follows where user_id=?",
    "delete from publisher_follows where user_id=?",
    "delete from user_blocks where blocker_user_id=? or blocked_user_id=?",
    "delete from notification_events where user_id=?",
    "delete from collections where user_id=? and visibility='private'",
    "update notification_events set actor_user_id=null where actor_user_id=?",
    "update plugin_claims set status='revoked',revoked_at=? where user_id=? and status in ('pending','verified')",
    "update plugin_maintainers set revoked_at=? where user_id=? and revoked_at is null",
  ];
  await binding.batch([
    ...statements.map((sql, index) => {
      if (index === 7) return binding.prepare(sql).bind(userId, userId);
      if (index === 11 || index === 12) return binding.prepare(sql).bind(now, userId);
      return binding.prepare(sql).bind(userId);
    }),
    binding
      .prepare(
        "update user_profiles set github_id=?,github_login=?,display_name='Deleted user',avatar_url=null,bio=null,status='active',anonymized_at=?,updated_at=? where user_id=?",
      )
      .bind(`deleted-${suffix}`, `deleted-${suffix}`, now, now, userId),
    binding
      .prepare(
        "update user set name='Deleted user',email=?,email_verified=0,image=null,github_id=null,github_login=null,updated_at=? where id=?",
      )
      .bind(`deleted-${suffix}@invalid.local`, now, userId),
  ]);
  return { deleted: true, anonymized: true };
}
