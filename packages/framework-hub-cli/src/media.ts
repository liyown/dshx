import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { extname, resolve } from "node:path";

import { mediaInputSchema } from "./contracts.js";
import { api } from "./api.js";
import { CliError } from "./errors.js";

type MediaType = "image/png" | "image/jpeg" | "image/webp" | "image/avif";
const maximumMediaBytes = 5 * 1024 * 1024;

const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function detectType(bytes: Uint8Array): MediaType | null {
  if (pngSignature.every((byte, index) => bytes[index] === byte))
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

function webpDimensions(
  bytes: Uint8Array,
): { width: number; height: number } | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
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
        width:
          1 + (bytes[dataOffset + 1]! | ((bytes[dataOffset + 2]! & 0x3f) << 8)),
        height:
          1 +
          ((bytes[dataOffset + 2]! >> 6) |
            (bytes[dataOffset + 3]! << 2) |
            ((bytes[dataOffset + 4]! & 0x0f) << 10)),
      };
    offset = dataOffset + chunkSize + (chunkSize % 2);
  }
  return null;
}

function dimensions(
  bytes: Uint8Array,
  type: MediaType,
): { width: number; height: number } | null {
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
  if (type === "image/webp") return webpDimensions(bytes);
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

function normalizeMediaInput(raw: unknown): unknown {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
  const value = raw as Record<string, unknown>;
  if (value["altText"] !== undefined) return raw;
  const localizations = Array.isArray(value["localizations"])
    ? (value["localizations"] as Array<Record<string, unknown>>)
    : [];
  const english = localizations.find((entry) => entry["locale"] === "en");
  const chinese = localizations.find((entry) => entry["locale"] === "zh");
  if (!english || !chinese) return raw;
  return {
    kind: value["kind"],
    localPath: value["localPath"],
    ...(value["sourceUrl"] === undefined
      ? {}
      : { sourceUrl: value["sourceUrl"] }),
    ...(value["observedAt"] === undefined
      ? {}
      : { observedAt: value["observedAt"] }),
    ...(value["sourceSha256"] === undefined
      ? {}
      : { sourceSha256: value["sourceSha256"] }),
    altText: { en: english["altText"], zh: chinese["altText"] },
    ...(english["caption"] === undefined && chinese["caption"] === undefined
      ? {}
      : { caption: { en: english["caption"], zh: chinese["caption"] } }),
  };
}

export async function checkMedia(pluginId: string, raw: unknown) {
  const input = mediaInputSchema.parse(normalizeMediaInput(raw));
  const localPath = resolve(input.localPath);
  let file: Awaited<ReturnType<typeof stat>>;
  try {
    file = await stat(localPath);
  } catch (error) {
    const code =
      error && typeof error === "object" && "code" in error
        ? String((error as { code?: unknown }).code)
        : undefined;
    throw new CliError({
      code: code === "ENOENT" ? "media_not_found" : "media_unreadable",
      path: input.localPath,
      message:
        code === "ENOENT"
          ? "The local media file does not exist."
          : "The local media file cannot be read.",
      retryable: false,
      repairHint:
        code === "ENOENT"
          ? "Correct localPath and retry."
          : "Check file permissions and localPath, then retry.",
      ...(code ? { details: { fileSystemCode: code } } : {}),
    });
  }
  if (!file.isFile())
    throw new CliError({
      code: "invalid_media_file",
      path: input.localPath,
      message: "localPath must reference a regular file.",
      retryable: false,
      repairHint: "Choose one local PNG, JPEG, WebP, or AVIF file.",
    });
  if (file.size === 0 || file.size > maximumMediaBytes)
    throw new CliError({
      code: "invalid_media_size",
      path: input.localPath,
      message: "Media must be between 1 byte and 5 MiB.",
      retryable: false,
      repairHint: "Choose or resize a local PNG, JPEG, WebP, or AVIF file.",
    });
  let buffer: Buffer;
  try {
    buffer = await readFile(localPath);
  } catch (error) {
    const code =
      error && typeof error === "object" && "code" in error
        ? String((error as { code?: unknown }).code)
        : undefined;
    throw new CliError({
      code: "media_unreadable",
      path: input.localPath,
      message: "The local media file could not be read after validation.",
      retryable: false,
      repairHint: "Check file permissions and retry with a stable local file.",
      ...(code ? { details: { fileSystemCode: code } } : {}),
    });
  }
  if (buffer.length === 0 || buffer.length > maximumMediaBytes)
    throw new CliError({
      code: "invalid_media_size",
      path: input.localPath,
      message: "Media must be between 1 byte and 5 MiB.",
      retryable: false,
      repairHint: "Choose or resize a local PNG, JPEG, WebP, or AVIF file.",
    });
  const contentType = detectType(buffer);
  if (!contentType)
    throw new CliError({
      code: "unsupported_media_type",
      path: input.localPath,
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
      path: input.localPath,
      message: "Media dimensions are missing or outside the 8192px limit.",
      retryable: false,
      repairHint:
        "Re-encode the image with valid dimensions up to 8192 by 8192.",
    });
  const sourceSha256 = createHash("sha256").update(buffer).digest("hex");
  if (input.sourceSha256 && input.sourceSha256 !== sourceSha256)
    throw new CliError({
      code: "media_hash_mismatch",
      path: input.localPath,
      message: "The local media hash differs from sourceSha256.",
      retryable: false,
      repairHint:
        "Reconfirm the source and update the evidence hash before uploading.",
    });
  return {
    pluginId,
    ...input,
    localPath,
    observedAt: input.observedAt ?? new Date().toISOString(),
    sourceSha256,
    contentType,
    byteSize: buffer.length,
    ...size,
    extension: extname(localPath),
    buffer,
  };
}

export async function uploadMedia(hub: string, pluginId: string, raw: unknown) {
  const item = await checkMedia(pluginId, raw);
  const metadata = {
    schemaVersion: 1,
    kind: item.kind,
    ...(item.sourceUrl ? { sourceUrl: item.sourceUrl } : {}),
    observedAt: item.observedAt,
    sourceSha256: item.sourceSha256,
    altText: item.altText,
    ...(item.caption ? { caption: item.caption } : {}),
  };
  const form = new FormData();
  form.set("metadata", JSON.stringify(metadata));
  const fileBytes = new Uint8Array(item.buffer.byteLength);
  fileBytes.set(item.buffer);
  form.set(
    "file",
    new File([fileBytes], `media.${item.contentType.split("/")[1]}`, {
      type: item.contentType,
    }),
  );
  return api(hub, `/api/ops/v1/plugins/${encodeURIComponent(pluginId)}/media`, {
    method: "POST",
    body: form,
  });
}
