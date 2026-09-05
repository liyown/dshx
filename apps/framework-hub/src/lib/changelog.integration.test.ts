import { inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getPlatformProxy } from "wrangler";
import { createDatabase, type Database } from "@/lib/db/client";
import { apiTokens, authUsers, changelogEntries, userProfiles } from "@/lib/db/schema";
import { sha256 } from "@/lib/auth/tokens.server";
import {
  createChangelog,
  getChangelog,
  listChangelog,
  updateChangelog,
} from "./changelog.repository.server";
import { listSitemapDatabaseRows } from "./sitemap.repository.server";
import { changelogInput } from "@/test/changelog";
import { Route as IndexRoute } from "@/routes/api/ops/v1/changelog/index";
import { Route as DetailRoute } from "@/routes/api/ops/v1/changelog/$slug";

type Handler = (input: {
  request: Request;
  context: unknown;
  params: { slug: string };
}) => Promise<Response>;

describe("changelog lifecycle with local D1", () => {
  let proxy: Awaited<ReturnType<typeof getPlatformProxy<Env>>>;
  let db: Database;
  const slugs: string[] = [];
  const users: string[] = [];
  function fixture() {
    const slug = `test-changelog-${crypto.randomUUID()}`;
    slugs.push(slug);
    return changelogInput(slug);
  }
  beforeAll(async () => {
    proxy = await getPlatformProxy<Env>({
      configPath: "wrangler.jsonc",
      persist: true,
      remoteBindings: false,
    });
    db = createDatabase(proxy.env.DB);
  });
  afterAll(async () => {
    if (slugs.length)
      await db.delete(changelogEntries).where(inArray(changelogEntries.slug, slugs));
    if (users.length) await db.delete(authUsers).where(inArray(authUsers.id, users));
    await proxy.dispose();
  });

  it("persists drafts, publishes and edits without rebuilding, and withdraws from public reads and sitemap", async () => {
    const input = fixture();
    expect((await createChangelog(db, "local-operator", input)).revision).toBe(1);
    expect(await getChangelog(db, input.slug)).toBeNull();
    expect(await getChangelog(db, input.slug, true)).toMatchObject({
      status: "draft",
      contentJson: input.content,
    });
    expect(
      (await listSitemapDatabaseRows(db)).some(
        (row) => row.kind === "changelog" && row.value === input.slug,
      ),
    ).toBe(false);
    const { slug, ...fields } = input;
    expect(
      (
        await updateChangelog(db, "local-operator", slug, {
          ...fields,
          status: "published",
          ifRevision: 1,
        })
      ).revision,
    ).toBe(2);
    expect(await getChangelog(db, slug)).toMatchObject({ status: "published" });
    expect(
      (await listSitemapDatabaseRows(db))
        .filter((row) => row.kind === "changelog" && row.value === slug)
        .map((row) => row.locale),
    ).toEqual(["en", "zh"]);
    const content = structuredClone(input.content);
    content.zh.title = "修改后立即从数据库读取";
    await updateChangelog(db, "local-operator", slug, {
      ...fields,
      content,
      status: "published",
      ifRevision: 2,
    });
    expect((await listChangelog(db)).find((entry) => entry.slug === slug)?.copy.zh.title).toBe(
      content.zh.title,
    );
    await expect(
      updateChangelog(db, "stale-writer", slug, { ...fields, status: "published", ifRevision: 2 }),
    ).rejects.toMatchObject({ status: 409, code: "revision_conflict" });
    expect((await getChangelog(db, slug))?.contentJson.zh.title).toBe(content.zh.title);
    await updateChangelog(db, "local-operator", slug, {
      ...fields,
      status: "draft",
      ifRevision: 3,
    });
    expect(await getChangelog(db, slug)).toBeNull();
    expect((await listChangelog(db)).some((entry) => entry.slug === slug)).toBe(false);
    expect(
      (await listSitemapDatabaseRows(db)).some(
        (row) => row.kind === "changelog" && row.value === slug,
      ),
    ).toBe(false);
    await expect(createChangelog(db, "local-operator", input)).rejects.toMatchObject({
      status: 409,
    });
  });

  it("requires operations permissions and supports authenticated API editing", async () => {
    const index = IndexRoute.options.server?.handlers as unknown as Record<string, Handler>;
    const detail = DetailRoute.options.server?.handlers as unknown as Record<string, Handler>;
    const input = fixture();
    const context = { cloudflare: { DB: proxy.env.DB } };
    for (const [handler, method, path] of [
      [index["GET"]!, "GET", ""],
      [index["POST"]!, "POST", ""],
      [detail["GET"]!, "GET", `/${input.slug}`],
      [detail["PUT"]!, "PUT", `/${input.slug}`],
    ] as const) {
      const response = await handler({
        request: new Request(`https://hub.test/api/ops/v1/changelog${path}`, { method }),
        context,
        params: { slug: input.slug },
      });
      expect(response.status).toBe(401);
    }
    const userId = crypto.randomUUID();
    users.push(userId);
    await db
      .insert(authUsers)
      .values({ id: userId, name: "Changelog operator", email: `${userId}@example.test` });
    await db
      .insert(userProfiles)
      .values({ userId, githubId: userId, githubLogin: `changelog-${userId}`, role: "operator" });
    async function token(scopes: string[]) {
      const raw = crypto.randomUUID();
      await db.insert(apiTokens).values({
        id: crypto.randomUUID(),
        userId,
        label: "Changelog test",
        tokenPrefix: raw.slice(0, 8),
        tokenHash: await sha256(raw),
        scopesJson: scopes,
        expiresAt: new Date(Date.now() + 60_000),
      });
      return raw;
    }
    const readonly = await token(["catalog:read"]);
    const denied = await index["POST"]!({
      request: new Request("https://hub.test/api/ops/v1/changelog", {
        method: "POST",
        headers: { authorization: `Bearer ${readonly}`, "content-type": "application/json" },
        body: JSON.stringify(input),
      }),
      context,
      params: { slug: input.slug },
    });
    expect(denied.status).toBe(403);
    const operator = await token(["catalog:write"]);
    const headers = { authorization: `Bearer ${operator}`, "content-type": "application/json" };
    const response = await index["POST"]!({
      request: new Request("https://hub.test/api/ops/v1/changelog", {
        method: "POST",
        headers,
        body: JSON.stringify(input),
      }),
      context,
      params: { slug: input.slug },
    });
    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      data: { slug: input.slug, revision: 1, content: input.content },
    });
    const { slug, ...fields } = input;
    const updated = await detail["PUT"]!({
      request: new Request(`https://hub.test/api/ops/v1/changelog/${slug}`, {
        method: "PUT",
        headers,
        body: JSON.stringify({ ...fields, status: "published", ifRevision: 1 }),
      }),
      context,
      params: { slug },
    });
    expect(updated.status).toBe(200);
    expect(updated.headers.get("cache-control")).toBe("no-store");
    expect(await getChangelog(db, slug)).toMatchObject({ status: "published", revision: 2 });
  });
});
