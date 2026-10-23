import { refreshPluginScore } from "@/lib/catalog/scores.server";
import type { Database } from "@/lib/db/client";
import { runDrizzleBatch } from "@/lib/db/batch";
import { parameterizedSql } from "@/lib/db/parameterized-sql";
import { HttpError } from "@/lib/http";
import {
  sanitizeUserText,
  type ProfileRow,
  type RelationshipPlugin,
  type RelationshipPublisher,
} from "./contracts";

/**
 * A member, and what they own.
 *
 * The public profile another visitor reads, the profile its owner edits, the
 * bookmarks and follows that connect the two, the block list that keeps one
 * member out of another's way, and account deletion. Collections, submissions
 * and notifications are the member's own domains and live beside this module.
 */

export async function getPublicUser(binding: Database, login: string) {
  const profile = await binding.get<Record<string, unknown>>(
    parameterizedSql(
      `select up.user_id,up.github_login,up.display_name,up.avatar_url,up.bio,up.role,up.created_at,
              u.name auth_name,u.image auth_image
       from user_profiles up join user u on u.id=up.user_id
       left join user_aliases ua on ua.user_id=up.user_id
       where up.github_login=? or ua.github_login=? limit 1`,
      [login, login],
    ),
  );
  if (!profile) throw new HttpError(404, "User not found", "user_not_found");
  const userId = String(profile["user_id"]);
  const [plugins, collections, bookmarks, counts] = await Promise.all([
    binding.all<Record<string, unknown>>(
      parameterizedSql(
        `select p.slug,p.name,p.description,p.package_name,p.latest_version
         from plugin_maintainers pm join plugins p on p.id=pm.plugin_id
         where pm.user_id=? and pm.revoked_at is null and p.status='published'
         order by p.updated_at desc`,
        [userId],
      ),
    ),
    binding.all<Record<string, unknown>>(
      parameterizedSql(
        `select c.id,c.slug,c.name,c.description,c.updated_at,count(cp.plugin_id) plugin_count
         from collections c left join collection_plugins cp on cp.collection_id=c.id
         where c.user_id=? and c.visibility='public'
         group by c.id order by c.updated_at desc`,
        [userId],
      ),
    ),
    binding.all<Record<string, unknown>>(
      parameterizedSql(
        `select p.slug,p.name,p.description,p.package_name
         from plugin_bookmarks b join plugins p on p.id=b.plugin_id
         where b.user_id=? and p.status='published'
         order by b.created_at desc limit 100`,
        [userId],
      ),
    ),
    binding.get<Record<string, number>>(
      parameterizedSql(
        `select
          (select count(*) from plugin_reviews where user_id=? and status='published') reviews,
          (select count(*) from review_replies where user_id=? and status='published') replies,
          (select count(*) from plugin_maintainers where user_id=? and revoked_at is null) maintained_plugins`,
        [userId, userId, userId],
      ),
    ),
  ]);
  return {
    id: userId,
    login: profile["github_login"],
    displayName: profile["display_name"] ?? profile["auth_name"],
    avatarUrl: profile["avatar_url"] ?? profile["auth_image"],
    bio: profile["bio"],
    role: profile["role"],
    joinedAt: profile["created_at"],
    plugins: plugins,
    collections: collections,
    bookmarks: bookmarks,
    contributions: counts ?? { reviews: 0, replies: 0, maintained_plugins: 0 },
  };
}

export async function getPublicPublisher(binding: Database, login: string, locale: "en" | "zh") {
  const publisher = await binding.get<Record<string, unknown>>(
    parameterizedSql(
      `select p.*,
        coalesce(case when l.status='ready' then l.display_name end,p.display_name,p.login) localized_name,
        coalesce(case when l.status='ready' then l.bio end,p.bio) localized_bio,
        l.seo_title,l.seo_description,l.status localization_status
       from publishers p
       left join publisher_aliases pa on pa.publisher_id=p.id
       left join publisher_localizations l on l.publisher_id=p.id and l.locale=?
       where p.login=? or pa.login=? limit 1`,
      [locale, login, login],
    ),
  );
  if (!publisher) throw new HttpError(404, "Publisher not found", "publisher_not_found");
  const plugins = await binding.all<Record<string, unknown>>(
    parameterizedSql(
      `select p.slug,p.name,p.description,p.package_name,p.latest_version,p.badge,p.updated_at,
              coalesce(m.github_stars,0) github_stars
       from plugins p left join plugin_metrics_current m on m.plugin_id=p.id
       where p.publisher_id=? and p.status='published' and p.lifecycle_status in ('active','unmaintained')
       order by p.updated_at desc`,
      [publisher["id"]],
    ),
  );
  return { publisher, plugins: plugins };
}

export async function getMe(binding: Database, userId: string): Promise<ProfileRow> {
  const profile = await binding.get<ProfileRow>(
    parameterizedSql(
      `select up.*,u.name,u.email,u.image,
        (select count(*) from notification_events n left join notification_reads nr on nr.notification_id=n.id and nr.user_id=n.user_id
         where n.user_id=up.user_id and nr.notification_id is null) unread_notifications
       from user_profiles up join user u on u.id=up.user_id where up.user_id=?`,
      [userId],
    ),
  );
  if (!profile) throw new HttpError(404, "Profile not found", "profile_not_found");
  return profile;
}

export async function updateProfile(
  binding: Database,
  userId: string,
  input: { displayName: string; bio?: string | null | undefined; preferredLocale: "en" | "zh" },
) {
  await binding.run(
    parameterizedSql(
      "update user_profiles set display_name=?,bio=?,preferred_locale=?,updated_at=? where user_id=?",
      [
        sanitizeUserText(input.displayName),
        sanitizeUserText(input.bio),
        input.preferredLocale,
        Date.now(),
        userId,
      ],
    ),
  );
  return getMe(binding, userId);
}

export async function setPluginRelationship(
  binding: Database,
  userId: string,
  pluginId: string,
  kind: "bookmark" | "follow",
  enabled: boolean,
) {
  const plugin = await binding.get(
    parameterizedSql("select id from plugins where id=? and status='published'", [pluginId]),
  );
  if (!plugin) throw new HttpError(404, "Plugin not found", "plugin_not_found");
  const table = kind === "bookmark" ? "plugin_bookmarks" : "plugin_follows";
  if (enabled) {
    await binding.run(
      parameterizedSql(
        `insert into ${table}(user_id,plugin_id,created_at) values(?,?,?) on conflict do nothing`,
        [userId, pluginId, Date.now()],
      ),
    );
  } else {
    await binding.run(
      parameterizedSql(`delete from ${table} where user_id=? and plugin_id=?`, [userId, pluginId]),
    );
  }
  // Bookmarks and follows feed the catalog popularity score.
  await refreshPluginScore(binding, pluginId);
  return { pluginId, kind, enabled };
}

export async function listRelationships(binding: Database, userId: string) {
  const [bookmarks, pluginFollows, publisherFollows] = await Promise.all([
    binding.all<RelationshipPlugin>(
      parameterizedSql(
        `select p.id,p.slug,p.name,p.description,p.package_name,b.created_at
         from plugin_bookmarks b join plugins p on p.id=b.plugin_id
         where b.user_id=? and p.status='published' order by b.created_at desc`,
        [userId],
      ),
    ),
    binding.all<RelationshipPlugin>(
      parameterizedSql(
        `select p.id,p.slug,p.name,p.description,p.package_name,f.created_at
         from plugin_follows f join plugins p on p.id=f.plugin_id
         where f.user_id=? and p.status='published' order by f.created_at desc`,
        [userId],
      ),
    ),
    binding.all<RelationshipPublisher>(
      parameterizedSql(
        `select p.id,p.login,p.display_name,p.avatar_url,f.created_at
         from publisher_follows f join publishers p on p.id=f.publisher_id
         where f.user_id=? order by f.created_at desc`,
        [userId],
      ),
    ),
  ]);
  return {
    bookmarks: bookmarks,
    pluginFollows: pluginFollows,
    publisherFollows: publisherFollows,
  };
}

export async function setPublisherFollow(
  binding: Database,
  userId: string,
  publisherId: string,
  enabled: boolean,
) {
  const publisher = await binding.get(
    parameterizedSql("select id from publishers where id=?", [publisherId]),
  );
  if (!publisher) throw new HttpError(404, "Publisher not found", "publisher_not_found");
  if (enabled) {
    await binding.run(
      parameterizedSql(
        "insert into publisher_follows(user_id,publisher_id,created_at) values(?,?,?) on conflict do nothing",
        [userId, publisherId, Date.now()],
      ),
    );
  } else {
    await binding.run(
      parameterizedSql("delete from publisher_follows where user_id=? and publisher_id=?", [
        userId,
        publisherId,
      ]),
    );
  }
  return { publisherId, enabled };
}

export async function setUserBlock(
  binding: Database,
  blockerUserId: string,
  blockedUserId: string,
  enabled: boolean,
) {
  if (blockerUserId === blockedUserId)
    throw new HttpError(422, "You cannot block yourself", "invalid_block");
  const target = await binding.get(
    parameterizedSql("select user_id from user_profiles where user_id=?", [blockedUserId]),
  );
  if (!target) throw new HttpError(404, "User not found", "user_not_found");
  if (enabled) {
    await binding.run(
      parameterizedSql(
        "insert into user_blocks(blocker_user_id,blocked_user_id,created_at) values(?,?,?) on conflict do nothing",
        [blockerUserId, blockedUserId, Date.now()],
      ),
    );
  } else {
    await binding.run(
      parameterizedSql("delete from user_blocks where blocker_user_id=? and blocked_user_id=?", [
        blockerUserId,
        blockedUserId,
      ]),
    );
  }
  return { blockedUserId, enabled };
}

export async function anonymizeAccount(binding: Database, userId: string) {
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
  await runDrizzleBatch(binding, [
    ...statements.map((sql, index) => {
      if (index === 7) return binding.run(parameterizedSql(sql, [userId, userId]));
      if (index === 11 || index === 12) return binding.run(parameterizedSql(sql, [now, userId]));
      return binding.run(parameterizedSql(sql, [userId]));
    }),
    binding.run(
      parameterizedSql(
        "update user_profiles set github_id=?,github_login=?,display_name='Deleted user',avatar_url=null,bio=null,status='active',anonymized_at=?,updated_at=? where user_id=?",
        [`deleted-${suffix}`, `deleted-${suffix}`, now, now, userId],
      ),
    ),
    binding.run(
      parameterizedSql(
        "update user set name='Deleted user',email=?,email_verified=0,image=null,github_id=null,github_login=null,updated_at=? where id=?",
        [`deleted-${suffix}@invalid.local`, now, userId],
      ),
    ),
  ]);
  return { deleted: true, anonymized: true };
}
