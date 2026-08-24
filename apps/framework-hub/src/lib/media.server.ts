import { and, eq } from "drizzle-orm";

import { mediaUploadMetadataV2Schema } from "./catalog/contracts";
import type { Database } from "@/lib/db/client";
import { pluginMedia, pluginMediaLocalizations, plugins } from "@/lib/db/schema";
import { HttpError, uuid } from "@/lib/http";
import { sha256 } from "@/lib/auth/tokens.server";

const allowed = new Set(["image/png", "image/jpeg", "image/webp", "image/avif"]);

function hasMagic(bytes: Uint8Array, type: string): boolean {
  if (type === "image/png")
    return bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  if (type === "image/jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (type === "image/webp")
    return (
      new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF" &&
      new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP"
    );
  if (type === "image/avif")
    return new TextDecoder().decode(bytes.slice(4, 12)).includes("ftypavif");
  return false;
}

function readDimensions(bytes: Uint8Array, type: string): { width: number; height: number } | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (type === "image/png" && bytes.length >= 24) {
    return { width: view.getUint32(16), height: view.getUint32(20) };
  }
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
      ) {
        return { height: view.getUint16(offset + 5), width: view.getUint16(offset + 7) };
      }
      if (size < 2) break;
      offset += size + 2;
    }
  }
  if (type === "image/webp" && bytes.length >= 30) {
    const format = new TextDecoder().decode(bytes.slice(12, 16));
    if (format === "VP8X") {
      const width = 1 + (bytes[24]! | (bytes[25]! << 8) | (bytes[26]! << 16));
      const height = 1 + (bytes[27]! | (bytes[28]! << 8) | (bytes[29]! << 16));
      return { width, height };
    }
  }
  if (type === "image/avif") {
    const marker = new TextEncoder().encode("ispe");
    for (let index = 0; index + 16 <= bytes.length; index += 1) {
      if (marker.every((byte, offset) => bytes[index + offset] === byte)) {
        return { width: view.getUint32(index + 8), height: view.getUint32(index + 12) };
      }
    }
  }
  return null;
}

export async function storeMedia(db: Database, bucket: R2Bucket, form: FormData) {
  const file = form.get("file");
  let rawMetadata: unknown;
  try {
    rawMetadata = JSON.parse(String(form.get("metadata") ?? ""));
  } catch {
    throw new HttpError(422, "Valid MediaUploadV2 metadata is required", "invalid_media");
  }
  const parsedMetadata = mediaUploadMetadataV2Schema.safeParse(rawMetadata);
  if (!parsedMetadata.success)
    throw new HttpError(
      422,
      "MediaUploadV2 metadata is invalid",
      "invalid_media",
      parsedMetadata.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    );
  const metadata = parsedMetadata.data;
  const { pluginId, kind } = metadata;
  if (!(file instanceof File)) throw new HttpError(422, "file is required", "invalid_media");
  if (!allowed.has(file.type) || file.size <= 0 || file.size > 5 * 1024 * 1024)
    throw new HttpError(422, "Unsupported media type or size", "invalid_media");
  const bytes = await file.arrayBuffer();
  const byteView = new Uint8Array(bytes);
  if (!hasMagic(byteView.slice(0, 16), file.type))
    throw new HttpError(422, "MIME type does not match file content", "invalid_media");
  const dimensions = readDimensions(byteView, file.type);
  if (
    !dimensions ||
    dimensions.width <= 0 ||
    dimensions.height <= 0 ||
    dimensions.width > 8_192 ||
    dimensions.height > 8_192
  ) {
    throw new HttpError(422, "Media dimensions are invalid or unsupported", "invalid_media");
  }
  const [plugin] = await db
    .select({ id: plugins.id })
    .from(plugins)
    .where(eq(plugins.id, pluginId))
    .limit(1);
  if (!plugin) throw new HttpError(404, "Plugin not found", "plugin_not_found");
  const hash = await sha256(bytes);
  if (metadata.sourceSha256 !== hash)
    throw new HttpError(422, "Media hash mismatch", "media_hash_mismatch");
  const extension = file.type === "image/jpeg" ? "jpg" : file.type.split("/")[1];
  const key = `sha256/${hash.slice(0, 2)}/${hash}.${extension}`;
  const existingMedia = await db
    .select({ id: pluginMedia.id, r2Key: pluginMedia.r2Key })
    .from(pluginMedia)
    .where(
      and(
        eq(pluginMedia.pluginId, pluginId),
        eq(pluginMedia.kind, kind),
        eq(pluginMedia.sha256, hash),
      ),
    )
    .limit(1);
  if (existingMedia[0])
    return {
      id: existingMedia[0].id,
      key: existingMedia[0].r2Key,
      sha256: hash,
      deduplicated: true,
    };
  const existingObject = await bucket.head(key);
  if (!existingObject)
    await bucket.put(key, bytes, {
      httpMetadata: { contentType: file.type, cacheControl: "public, max-age=31536000, immutable" },
      customMetadata: { sha256: hash },
    });
  const id = uuid();
  await db.insert(pluginMedia).values({
    id,
    pluginId,
    kind,
    r2Key: key,
    sourceUrl: metadata.sourceUrl,
    sha256: hash,
    contentType: file.type,
    width: dimensions.width,
    height: dimensions.height,
    byteSize: file.size,
  });
  for (const entry of metadata.localizations)
    await db.insert(pluginMediaLocalizations).values({
      mediaId: id,
      locale: entry.locale,
      altText: entry.altText.slice(0, 240),
      caption: entry.caption?.slice(0, 500),
    });
  return { id, key, sha256: hash, deduplicated: Boolean(existingObject) };
}
