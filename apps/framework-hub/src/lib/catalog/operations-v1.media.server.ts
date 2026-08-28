import type { BatchItem } from "drizzle-orm/batch";

import type { OperationMediaMetadata } from "./operations-v1.contracts";
import { OperationHttpError } from "./operations-v1.http";
import type { Database } from "@/lib/db/client";
import { runDrizzleBatch } from "@/lib/db/batch";
import { parameterizedSql } from "@/lib/db/parameterized-sql";

const allowedTypes = new Set(["image/png", "image/jpeg", "image/webp", "image/avif"]);
const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function hasMagic(bytes: Uint8Array, type: string): boolean {
  if (type === "image/png")
    return (
      bytes.length >= 16 &&
      pngSignature.every((byte, index) => bytes[index] === byte) &&
      new TextDecoder().decode(bytes.slice(12, 16)) === "IHDR"
    );
  if (type === "image/jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (type === "image/webp")
    return (
      new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF" &&
      new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP"
    );
  if (type === "image/avif")
    return new TextDecoder().decode(bytes.slice(4, 16)).includes("ftypavif");
  return false;
}

function readDimensions(bytes: Uint8Array, type: string): { width: number; height: number } | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (
    type === "image/png" &&
    bytes.length >= 33 &&
    pngSignature.every((byte, index) => bytes[index] === byte) &&
    view.getUint32(8) === 13 &&
    new TextDecoder().decode(bytes.slice(12, 16)) === "IHDR"
  )
    return { width: view.getUint32(16), height: view.getUint32(20) };
  if (type === "image/jpeg") {
    let offset = 2;
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      const marker = bytes[offset + 1] ?? 0;
      const size = view.getUint16(offset + 2);
      if (
        [0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(
          marker,
        )
      )
        return { height: view.getUint16(offset + 5), width: view.getUint16(offset + 7) };
      if (size < 2) break;
      offset += size + 2;
    }
  }
  if (type === "image/webp") {
    const text = new TextDecoder();
    for (let offset = 12; offset + 8 <= bytes.length;) {
      const format = text.decode(bytes.slice(offset, offset + 4));
      const chunkSize = view.getUint32(offset + 4, true);
      const dataOffset = offset + 8;
      if (dataOffset + chunkSize > bytes.length) return null;
      if (format === "VP8X" && chunkSize >= 10)
        return {
          width:
            1 +
            (bytes[dataOffset + 4]! |
              (bytes[dataOffset + 5]! << 8) |
              (bytes[dataOffset + 6]! << 16)),
          height:
            1 +
            (bytes[dataOffset + 7]! |
              (bytes[dataOffset + 8]! << 8) |
              (bytes[dataOffset + 9]! << 16)),
        };
      if (
        format === "VP8 " &&
        chunkSize >= 10 &&
        bytes[dataOffset + 3] === 0x9d &&
        bytes[dataOffset + 4] === 0x01 &&
        bytes[dataOffset + 5] === 0x2a
      )
        return {
          width: view.getUint16(dataOffset + 6, true) & 0x3fff,
          height: view.getUint16(dataOffset + 8, true) & 0x3fff,
        };
      if (format === "VP8L" && chunkSize >= 5 && bytes[dataOffset] === 0x2f)
        return {
          width: 1 + (bytes[dataOffset + 1]! | ((bytes[dataOffset + 2]! & 0x3f) << 8)),
          height:
            1 +
            ((bytes[dataOffset + 2]! >> 6) |
              (bytes[dataOffset + 3]! << 2) |
              ((bytes[dataOffset + 4]! & 0x0f) << 10)),
        };
      offset = dataOffset + chunkSize + (chunkSize % 2);
    }
  }
  if (type === "avif" || type === "image/avif") {
    const marker = new TextEncoder().encode("ispe");
    for (let index = 0; index + 16 <= bytes.length; index += 1)
      if (marker.every((byte, markerIndex) => bytes[index + markerIndex] === byte))
        return { width: view.getUint32(index + 8), height: view.getUint32(index + 12) };
  }
  return null;
}

async function sha256(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function uploadOperationMedia(
  binding: Database,
  bucket: R2Bucket | undefined,
  actorTokenId: string,
  requestId: string,
  pluginId: string,
  file: File,
  metadata: OperationMediaMetadata,
) {
  if (!bucket)
    throw new OperationHttpError(
      503,
      "media_unavailable",
      "Hub media storage is unavailable",
      true,
      {
        repairHint: "Retry after Hub media storage becomes available.",
      },
    );
  if (!allowedTypes.has(file.type) || file.size <= 0 || file.size > 5 * 1024 * 1024)
    throw new OperationHttpError(422, "invalid_media", "Unsupported media type or size", false, {
      path: "file",
    });
  const bytes = await file.arrayBuffer();
  const byteView = new Uint8Array(bytes);
  if (!hasMagic(byteView.slice(0, Math.min(byteView.length, 32)), file.type))
    throw new OperationHttpError(
      422,
      "invalid_media",
      "MIME type does not match file content",
      false,
      { path: "file" },
    );
  const dimensions = readDimensions(byteView, file.type);
  if (
    !dimensions ||
    dimensions.width <= 0 ||
    dimensions.height <= 0 ||
    dimensions.width > 8_192 ||
    dimensions.height > 8_192
  )
    throw new OperationHttpError(
      422,
      "invalid_media",
      "Media dimensions are invalid or unsupported",
      false,
      { path: "file" },
    );
  const plugin = await binding.get<{
    id: string;
    status: string;
    published_at: number | null;
    package_name: string;
    latest_version: string;
    description: string;
    license_spdx: string | null;
    homepage_url: string | null;
    repository_url: string | null;
    compatibility_range: string;
    last_synced_at: number | null;
    created_at: number;
    updated_at: number;
    revision: number | null;
  }>(
    parameterizedSql(
      `select p.id,p.status,p.published_at,p.package_name,p.latest_version,p.description,p.license_spdx,
        p.homepage_url,p.repository_url,p.compatibility_range,p.last_synced_at,p.created_at,p.updated_at,
        o.revision from plugins p
       left join plugin_operational_state o on o.plugin_id=p.id where p.id=?`,
      [pluginId],
    ),
  );
  if (!plugin) throw new OperationHttpError(404, "plugin_not_found", "Plugin not found", false);
  const hash = await sha256(bytes);
  if (metadata.sourceSha256 !== hash)
    throw new OperationHttpError(422, "media_hash_mismatch", "Media hash mismatch", false, {
      path: "metadata.sourceSha256",
      details: { computedSha256: hash },
    });
  const existing = await binding.get<{
    id: string;
    key: string;
    sourceUrl: string | null;
    observedAt: number | null;
    altEn: string | null;
    altZh: string | null;
    captionEn: string | null;
    captionZh: string | null;
  }>(
    parameterizedSql(
      `select m.id,m.r2_key key,m.source_url sourceUrl,m.observed_at observedAt,
        max(case when l.locale='en' then l.alt_text end) altEn,
        max(case when l.locale='zh' then l.alt_text end) altZh,
        max(case when l.locale='en' then l.caption end) captionEn,
        max(case when l.locale='zh' then l.caption end) captionZh
       from plugin_media m left join plugin_media_localizations l on l.media_id=m.id
       where m.plugin_id=? and m.kind=? and m.sha256=? group by m.id limit 1`,
      [pluginId, metadata.kind, hash],
    ),
  );
  const revision = plugin.revision ?? 1;
  const sameMetadata =
    existing &&
    (existing.sourceUrl ?? null) === (metadata.sourceUrl ?? null) &&
    existing.observedAt === Date.parse(metadata.observedAt) &&
    existing.altEn === metadata.altText.en &&
    existing.altZh === metadata.altText.zh &&
    existing.captionEn === (metadata.caption?.en ?? null) &&
    existing.captionZh === (metadata.caption?.zh ?? null);
  const extension = file.type === "image/jpeg" ? "jpg" : file.type.split("/")[1];
  const key = existing?.key ?? `sha256/${hash.slice(0, 2)}/${hash}.${extension}`;
  const objectExists = Boolean(await bucket.head(key));
  if (!objectExists)
    await bucket.put(key, bytes, {
      httpMetadata: { contentType: file.type, cacheControl: "public, max-age=31536000, immutable" },
      customMetadata: { sha256: hash },
    });
  if (existing && sameMetadata)
    return {
      status: "unchanged",
      id: existing.id,
      key: existing.key,
      sha256: hash,
      revision,
      repairedObject: !objectExists,
    };

  const now = Date.now();
  const mediaId = existing?.id ?? crypto.randomUUID();
  const nextRevision = revision + 1;
  const operationId = crypto.randomUUID();
  const statements: BatchItem<"sqlite">[] = [];
  const stateWriteIndex = statements.length;
  if (plugin.revision == null)
    statements.push(
      binding.run(
        parameterizedSql(
          `insert into plugin_operational_state(
            plugin_id,state,visibility,revision,last_operation_id,detection_json,facts_json,sources_json,
            field_provenance_json,last_observed_at,created_at,updated_at
          ) values(?,?,?,?,?,?,?,?,?,?,?,?)`,
          [
            pluginId,
            plugin.status === "published" ||
            (plugin.status === "archived" && plugin.published_at != null)
              ? "published"
              : "draft",
            plugin.status === "archived" ? "hidden" : "visible",
            nextRevision,
            operationId,
            null,
            JSON.stringify({
              package: {
                name: plugin.package_name,
                version: plugin.latest_version,
                ...(plugin.description ? { description: plugin.description } : {}),
                ...(plugin.license_spdx ? { license: plugin.license_spdx } : {}),
                ...(plugin.homepage_url ? { homepageUrl: plugin.homepage_url } : {}),
                ...(plugin.repository_url ? { repositoryUrl: plugin.repository_url } : {}),
              },
              ...(plugin.compatibility_range && plugin.compatibility_range !== "*"
                ? { compatibility: { declaredRange: plugin.compatibility_range } }
                : {}),
            }),
            plugin.repository_url
              ? JSON.stringify([
                  {
                    kind: "github",
                    url: plugin.repository_url,
                    availability: "available",
                    lastObservedAt: new Date(
                      plugin.last_synced_at ?? plugin.updated_at,
                    ).toISOString(),
                    lastSuccessfulAt: new Date(
                      plugin.last_synced_at ?? plugin.updated_at,
                    ).toISOString(),
                    observationId: `legacy:${pluginId}`,
                  },
                ])
              : "[]",
            "{}",
            plugin.last_synced_at ?? plugin.updated_at,
            now,
            now,
          ],
        ),
      ),
    );
  else
    statements.push(
      binding.run(
        parameterizedSql(
          `update plugin_operational_state set revision=?,last_operation_id=?,updated_at=?
           where plugin_id=? and revision=?`,
          [nextRevision, operationId, now, pluginId, revision],
        ),
      ),
    );
  const mediaWriteIndex = statements.length;
  if (existing)
    statements.push(
      binding.run(
        parameterizedSql(
          `update plugin_media set source_url=?,observed_at=?,updated_at=?
           where id=? and exists(
             select 1 from plugin_operational_state
             where plugin_id=? and last_operation_id=?
           )`,
          [
            metadata.sourceUrl ?? null,
            Date.parse(metadata.observedAt),
            now,
            mediaId,
            pluginId,
            operationId,
          ],
        ),
      ),
    );
  else
    statements.push(
      binding.run(
        parameterizedSql(
          `insert into plugin_media(
            id,plugin_id,kind,r2_key,source_url,sha256,content_type,width,height,byte_size,
            sort_order,status,observed_at,created_at,updated_at
          ) select ?,?,?,?,?,?,?,?,?,?,0,'active',?,?,? from plugin_operational_state
            where plugin_id=? and last_operation_id=?`,
          [
            mediaId,
            pluginId,
            metadata.kind,
            key,
            metadata.sourceUrl ?? null,
            hash,
            file.type,
            dimensions.width,
            dimensions.height,
            file.size,
            Date.parse(metadata.observedAt),
            now,
            now,
            pluginId,
            operationId,
          ],
        ),
      ),
    );
  for (const locale of ["en", "zh"] as const)
    statements.push(
      binding.run(
        parameterizedSql(
          `insert into plugin_media_localizations(media_id,locale,alt_text,caption)
           select ?,?,?,? from plugin_operational_state
             where plugin_id=? and last_operation_id=? and exists(
               select 1 from plugin_media where id=?
             )
           on conflict(media_id,locale) do update set
             alt_text=excluded.alt_text,caption=excluded.caption`,
          [
            mediaId,
            locale,
            metadata.altText[locale],
            metadata.caption?.[locale] ?? null,
            pluginId,
            operationId,
            mediaId,
          ],
        ),
      ),
    );
  statements.push(
    binding.run(
      parameterizedSql(
        `update plugins set updated_at=? where id=? and exists(
          select 1 from plugin_operational_state
          where plugin_id=? and last_operation_id=?
        ) and exists(select 1 from plugin_media where id=?)`,
        [now, pluginId, pluginId, operationId, mediaId],
      ),
    ),
    binding.run(
      parameterizedSql(
        `insert into plugin_operation_audit(
          id,request_id,actor_token_id,action,resource_type,resource_id,plugin_id,
          before_revision,after_revision,details_json,created_at
        ) select ?,?,?,?,?,?,?,?,?,?,? from plugin_operational_state
          where plugin_id=? and last_operation_id=?
            and exists(select 1 from plugin_media where id=?)`,
        [
          crypto.randomUUID(),
          requestId,
          actorTokenId,
          existing ? "media.update" : "media.upload",
          "media",
          mediaId,
          pluginId,
          revision,
          nextRevision,
          JSON.stringify({
            kind: metadata.kind,
            sha256: hash,
            contentType: file.type,
            byteSize: file.size,
            width: dimensions.width,
            height: dimensions.height,
            observedAt: metadata.observedAt,
          }),
          now,
          pluginId,
          operationId,
          mediaId,
        ],
      ),
    ),
  );
  try {
    const results = await runDrizzleBatch(binding, statements);
    const revisionResult = results[stateWriteIndex];
    const mediaResult = results[mediaWriteIndex];
    if (!revisionResult?.meta.changes || !mediaResult?.meta.changes)
      throw new OperationHttpError(
        409,
        "revision_conflict",
        "Plugin changed during media upload",
        true,
        {
          repairHint: "Run plugin get and retry the media upload.",
        },
      );
  } catch (error) {
    if (error instanceof OperationHttpError) throw error;
    if (error instanceof Error && /UNIQUE constraint failed/i.test(error.message))
      throw new OperationHttpError(409, "revision_conflict", "Media changed concurrently", true, {
        repairHint: "Run plugin get and retry the media upload.",
      });
    throw error;
  }
  return {
    status: existing ? "updated" : "created",
    id: mediaId,
    key,
    sha256: hash,
    contentType: file.type,
    width: dimensions.width,
    height: dimensions.height,
    byteSize: file.size,
    deduplicatedObject: objectExists,
    revision: nextRevision,
  };
}
