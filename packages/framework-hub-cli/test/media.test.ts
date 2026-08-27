import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setKeyringEntryFactoryForTests } from "../src/keychain.js";
import { checkMedia, uploadMedia } from "../src/media.js";

const temporary: string[] = [];
const originalFetch = globalThis.fetch;

async function pngFixture() {
  const directory = await mkdtemp(join(tmpdir(), "dshx-hub-media-"));
  temporary.push(directory);
  const path = join(directory, "icon.png");
  const bytes = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(bytes);
  bytes.writeUInt32BE(13, 8);
  bytes.write("IHDR", 12, "ascii");
  bytes.writeUInt32BE(64, 16);
  bytes.writeUInt32BE(32, 20);
  bytes[24] = 8;
  bytes[25] = 6;
  await writeFile(path, bytes);
  return path;
}

async function webpFixture(format: "VP8 " | "VP8L") {
  const directory = await mkdtemp(join(tmpdir(), "dshx-hub-media-"));
  temporary.push(directory);
  const path = join(directory, `${format.trim()}.webp`);
  const chunkSize = format === "VP8 " ? 10 : 5;
  const bytes = Buffer.alloc(20 + chunkSize + (chunkSize % 2));
  bytes.write("RIFF", 0, "ascii");
  bytes.writeUInt32LE(bytes.length - 8, 4);
  bytes.write("WEBP", 8, "ascii");
  bytes.write(format, 12, "ascii");
  bytes.writeUInt32LE(chunkSize, 16);
  if (format === "VP8 ") {
    Buffer.from([0x9d, 0x01, 0x2a]).copy(bytes, 23);
    bytes.writeUInt16LE(64, 26);
    bytes.writeUInt16LE(32, 28);
  } else {
    bytes[20] = 0x2f;
    const width = 64 - 1;
    const height = 32 - 1;
    bytes[21] = width & 0xff;
    bytes[22] = ((width >> 8) & 0x3f) | ((height & 0x03) << 6);
    bytes[23] = (height >> 2) & 0xff;
    bytes[24] = (height >> 10) & 0x0f;
  }
  await writeFile(path, bytes);
  return path;
}

beforeEach(() => {
  setKeyringEntryFactoryForTests(() => ({
    getPassword: () => "test-token",
    setPassword: () => undefined,
    deletePassword: () => true,
  }));
});

afterEach(async () => {
  globalThis.fetch = originalFetch;
  setKeyringEntryFactoryForTests();
  vi.restoreAllMocks();
  await Promise.all(
    temporary
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe("atomic media upload", () => {
  it("validates local bytes and sends the agreed multipart metadata", async () => {
    const localPath = await pngFixture();
    let url: string | undefined;
    let form: FormData | undefined;
    globalThis.fetch = vi.fn(async (input, init) => {
      url = String(input);
      form = init?.body as FormData;
      return new Response(
        JSON.stringify({
          ok: true,
          data: { uploaded: true },
          warnings: [],
          meta: { requestId: "media-request" },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });
    const input = {
      kind: "icon",
      localPath,
      sourceUrl: "https://example.test/icon.png",
      altText: { en: "Plugin icon", zh: "插件图标" },
      caption: { en: "Upstream artwork", zh: "上游图像" },
    };
    const checked = await checkMedia("plugin-id", input);
    expect(checked).toMatchObject({
      pluginId: "plugin-id",
      contentType: "image/png",
      width: 64,
      height: 32,
      sourceSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    await uploadMedia("https://hub.test", "plugin/id", input);

    expect(url).toBe("https://hub.test/api/ops/v1/plugins/plugin%2Fid/media");
    const metadata = JSON.parse(String(form?.get("metadata")));
    expect(metadata).toMatchObject({
      schemaVersion: 1,
      kind: "icon",
      sourceUrl: "https://example.test/icon.png",
      sourceSha256: checked.sourceSha256,
      altText: input.altText,
      caption: input.caption,
    });
    expect(form?.get("file")).toBeInstanceOf(File);
  });

  it("requires complete bilingual captions when a caption is present", async () => {
    const localPath = await pngFixture();
    await expect(
      checkMedia("plugin-id", {
        kind: "icon",
        localPath,
        altText: { en: "Plugin icon", zh: "插件图标" },
        caption: { en: "Only English" },
      }),
    ).rejects.toThrow();
  });

  it("reads both lossy VP8 and lossless VP8L dimensions", async () => {
    for (const format of ["VP8 ", "VP8L"] as const) {
      const localPath = await webpFixture(format);
      await expect(
        checkMedia("plugin-id", {
          kind: "screenshot",
          localPath,
          altText: { en: "Plugin screenshot", zh: "插件截图" },
        }),
      ).resolves.toMatchObject({
        contentType: "image/webp",
        width: 64,
        height: 32,
      });
    }
  });

  it("rejects truncated PNG headers and normalizes missing files", async () => {
    const directory = await mkdtemp(join(tmpdir(), "dshx-hub-media-"));
    temporary.push(directory);
    const truncated = join(directory, "truncated.png");
    const bytes = Buffer.alloc(24);
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(bytes);
    bytes.writeUInt32BE(64, 16);
    bytes.writeUInt32BE(32, 20);
    await writeFile(truncated, bytes);
    const input = (localPath: string) => ({
      kind: "icon",
      localPath,
      altText: { en: "Plugin icon", zh: "插件图标" },
    });
    const invalid = await checkMedia("plugin-id", input(truncated)).catch(
      (error: unknown) => error,
    );
    expect(invalid).toMatchObject({
      issue: { code: "invalid_media_dimensions" },
    });
    const missing = await checkMedia(
      "plugin-id",
      input(join(directory, "missing.png")),
    ).catch((error: unknown) => error);
    expect(missing).toMatchObject({ issue: { code: "media_not_found" } });
  });
});
