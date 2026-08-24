import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";

import { mediaUploadPageV2Schema } from "./catalog-schema.js";
import { api } from "./api.js";
import { CliError } from "./errors.js";

type MediaType = "image/png" | "image/jpeg" | "image/webp" | "image/avif";

function detectType(bytes: Uint8Array): MediaType | null {
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  )
    return "image/png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
    return "image/jpeg";
  const text = new TextDecoder();
  if (
    text.decode(bytes.slice(0, 4)) === "RIFF" &&
    text.decode(bytes.slice(8, 12)) === "WEBP"
  )
    return "image/webp";
  if (text.decode(bytes.slice(4, 12)).includes("ftypavif")) return "image/avif";
  return null;
}

function dimensions(
  bytes: Uint8Array,
  type: MediaType,
): { width: number; height: number } | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (type === "image/png" && bytes.length >= 24)
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
        [
          0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd,
          0xce, 0xcf,
        ].includes(marker)
      )
        return {
          height: view.getUint16(offset + 5),
          width: view.getUint16(offset + 7),
        };
      if (size < 2) break;
      offset += size + 2;
    }
  }
  if (type === "image/webp" && bytes.length >= 30) {
    const format = new TextDecoder().decode(bytes.slice(12, 16));
    if (format === "VP8X")
      return {
        width: 1 + (bytes[24]! | (bytes[25]! << 8) | (bytes[26]! << 16)),
        height: 1 + (bytes[27]! | (bytes[28]! << 8) | (bytes[29]! << 16)),
      };
  }
  if (type === "image/avif") {
    const marker = new TextEncoder().encode("ispe");
    for (let index = 0; index + 16 <= bytes.length; index += 1)
      if (marker.every((byte, offset) => bytes[index + offset] === byte))
        return {
          width: view.getUint32(index + 8),
          height: view.getUint32(index + 12),
        };
  }
  return null;
}

export async function checkMedia(raw: unknown) {
  const input = mediaUploadPageV2Schema.parse(raw);
  const checked = [];
  for (const item of input.items) {
    const localPath = resolve(item.localPath);
    const buffer = await readFile(localPath);
    if (buffer.length === 0 || buffer.length > 5 * 1024 * 1024)
      throw new CliError({
        code: "invalid_media_size",
        stage: "media.check",
        path: item.localPath,
        message: "Media must be between 1 byte and 5 MiB.",
        retryable: false,
        repairHint: "Choose or resize a local PNG, JPEG, WebP, or AVIF file.",
      });
    const contentType = detectType(buffer);
    if (!contentType)
      throw new CliError({
        code: "unsupported_media_type",
        stage: "media.check",
        path: item.localPath,
        message: "Media magic bytes are not a supported image type.",
        retryable: false,
        repairHint: "Provide a genuine PNG, JPEG, WebP, or AVIF file.",
      });
    const size = dimensions(buffer, contentType);
    if (
      !size ||
      size.width <= 0 ||
      size.height <= 0 ||
      size.width > 8_192 ||
      size.height > 8_192
    )
      throw new CliError({
        code: "invalid_media_dimensions",
        stage: "media.check",
        path: item.localPath,
        message: "Media dimensions are missing or outside the 8192px limit.",
        retryable: false,
        repairHint:
          "Re-encode the image with valid dimensions up to 8192 by 8192.",
      });
    const sourceSha256 = createHash("sha256").update(buffer).digest("hex");
    if (item.sourceSha256 && item.sourceSha256 !== sourceSha256)
      throw new CliError({
        code: "media_hash_mismatch",
        stage: "media.check",
        path: item.localPath,
        message: "The local media hash differs from sourceSha256.",
        retryable: false,
        repairHint:
          "Reconfirm the source and update the evidence hash before uploading.",
      });
    checked.push({
      ...item,
      localPath,
      sourceSha256,
      contentType,
      byteSize: buffer.length,
      ...size,
      extension: extname(localPath),
    });
  }
  return { schemaVersion: 2 as const, valid: true, items: checked };
}

export async function uploadMedia(hub: string, raw: unknown) {
  const checked = await checkMedia(raw);
  const uploaded = [];
  for (const item of checked.items) {
    const buffer = await readFile(item.localPath);
    const metadata = {
      schemaVersion: 2,
      pluginId: item.pluginId,
      kind: item.kind,
      sourceUrl: item.sourceUrl,
      observedAt: item.observedAt,
      sourceSha256: item.sourceSha256,
      localizations: item.localizations,
    };
    const form = new FormData();
    form.set("metadata", JSON.stringify(metadata));
    form.set(
      "file",
      new File([buffer], `media.${item.contentType.split("/")[1]}`, {
        type: item.contentType,
      }),
    );
    uploaded.push(
      await api(hub, "/api/ops/media", { method: "POST", body: form }),
    );
  }
  return { submitted: uploaded.length, uploaded };
}
