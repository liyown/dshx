import type { Database } from "@/lib/db/client";
import { parameterizedSql } from "@/lib/db/parameterized-sql";
import { HttpError, uuid } from "@/lib/http";
import {
  sanitizeUserText,
  type CollectionPlugin,
  type CollectionDetailRecord,
  type CollectionRecord,
  type CollectionSummary,
} from "./contracts";

/**
 * Collections a member curates.
 *
 * A collection is public or private, belongs to one member, and is edited only
 * through this module: creation, renaming, deletion and membership changes all
 * check ownership and return the collection as its page reads it.
 */

function collectionSlug(value: string) {
  const slug = value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 72);
  return slug || `collection-${uuid().slice(0, 8)}`;
}

export async function getCollection(binding: Database, id: string, viewerUserId?: string | null) {
  const collection = await binding.get<CollectionDetailRecord>(
    parameterizedSql(
      `select c.*,up.github_login owner_login,coalesce(up.display_name,u.name) owner_name
       from collections c join user_profiles up on up.user_id=c.user_id join user u on u.id=c.user_id
       where c.id=? limit 1`,
      [id],
    ),
  );
  if (
    !collection ||
    (collection["visibility"] === "private" && collection["user_id"] !== viewerUserId)
  )
    throw new HttpError(404, "Collection not found", "collection_not_found");
  const plugins = await binding.all<CollectionPlugin>(
    parameterizedSql(
      `select p.slug,p.name,p.description,p.package_name,p.latest_version,p.badge,cp.sort_order,cp.added_at
       from collection_plugins cp join plugins p on p.id=cp.plugin_id
       where cp.collection_id=? and p.status='published'
       order by cp.sort_order asc,cp.added_at asc`,
      [id],
    ),
  );
  return { collection, plugins: plugins };
}

export async function listCollections(binding: Database, userId: string) {
  const result = await binding.all<CollectionSummary>(
    parameterizedSql(
      `select c.*,count(cp.plugin_id) plugin_count from collections c
       left join collection_plugins cp on cp.collection_id=c.id
       where c.user_id=? group by c.id order by c.updated_at desc`,
      [userId],
    ),
  );
  return { items: result };
}

export async function createCollection(
  binding: Database,
  userId: string,
  input: {
    name: string;
    description?: string | null | undefined;
    visibility: "public" | "private";
  },
) {
  const id = uuid();
  let slug = collectionSlug(input.name);
  const collision = await binding.get(
    parameterizedSql("select id from collections where user_id=? and slug=?", [userId, slug]),
  );
  if (collision) slug = `${slug.slice(0, 62)}-${id.slice(0, 8)}`;
  await binding.run(
    parameterizedSql(
      "insert into collections(id,user_id,slug,name,description,visibility,created_at,updated_at) values(?,?,?,?,?,?,?,?)",
      [
        id,
        userId,
        slug,
        sanitizeUserText(input.name),
        sanitizeUserText(input.description),
        input.visibility,
        Date.now(),
        Date.now(),
      ],
    ),
  );
  return getCollection(binding, id, userId);
}

async function requireOwnedCollection(binding: Database, id: string, userId: string) {
  const collection = await binding.get<CollectionRecord>(
    parameterizedSql("select * from collections where id=? and user_id=?", [id, userId]),
  );
  if (!collection) throw new HttpError(404, "Collection not found", "collection_not_found");
  return collection;
}

export async function updateCollection(
  binding: Database,
  id: string,
  userId: string,
  input: {
    name?: string | undefined;
    description?: string | null | undefined;
    visibility?: "public" | "private" | undefined;
  },
) {
  const current = await requireOwnedCollection(binding, id, userId);
  await binding.run(
    parameterizedSql(
      "update collections set name=?,description=?,visibility=?,updated_at=? where id=?",
      [
        sanitizeUserText(input.name ?? String(current["name"])),
        input.description === undefined
          ? current["description"]
          : sanitizeUserText(input.description),
        input.visibility ?? current["visibility"],
        Date.now(),
        id,
      ],
    ),
  );
  return getCollection(binding, id, userId);
}

export async function deleteCollection(binding: Database, id: string, userId: string) {
  await requireOwnedCollection(binding, id, userId);
  await binding.run(parameterizedSql("delete from collections where id=?", [id]));
  return { id, deleted: true };
}

export async function setCollectionPlugin(
  binding: Database,
  collectionId: string,
  pluginId: string,
  userId: string,
  enabled: boolean,
) {
  await requireOwnedCollection(binding, collectionId, userId);
  if (enabled) {
    const plugin = await binding.get(
      parameterizedSql("select id from plugins where id=? and status='published'", [pluginId]),
    );
    if (!plugin) throw new HttpError(404, "Plugin not found", "plugin_not_found");
    await binding.run(
      parameterizedSql(
        `insert into collection_plugins(collection_id,plugin_id,sort_order,added_at)
         values(?,?,(select coalesce(max(sort_order),-1)+1 from collection_plugins where collection_id=?),?)
         on conflict do nothing`,
        [collectionId, pluginId, collectionId, Date.now()],
      ),
    );
  } else {
    await binding.run(
      parameterizedSql("delete from collection_plugins where collection_id=? and plugin_id=?", [
        collectionId,
        pluginId,
      ]),
    );
  }
  await binding.run(
    parameterizedSql("update collections set updated_at=? where id=?", [Date.now(), collectionId]),
  );
  return getCollection(binding, collectionId, userId);
}
