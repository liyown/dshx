import { inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getPlatformProxy } from "wrangler";

import { sha256 } from "@/lib/auth/tokens.server";
import {
  createBlogPost,
  getBlogPost,
  listBlogPosts,
  updateBlogPost,
} from "@/lib/blog.repository.server";
import { createDatabase, type Database } from "@/lib/db/client";
import {
  apiTokens,
  authUsers,
  blogPosts,
  categories,
  categoryLocalizations,
  plugins,
  userProfiles,
} from "@/lib/db/schema";
import {
  getFeaturedForOperations,
  listFeaturedSections,
  replaceFeaturedPicks,
} from "@/lib/featured.repository.server";
import { listSitemapDatabaseRows } from "@/lib/sitemap.repository.server";
import { blogInput } from "@/test/blog";
import { Route as BlogIndexRoute } from "@/routes/api/ops/v1/blog/index";
import { Route as BlogDetailRoute } from "@/routes/api/ops/v1/blog/$slug";

type Handler = (input: {
  request: Request;
  context: unknown;
  params: { slug: string };
}) => Promise<Response>;

describe("blog and featured editorial data with local D1", () => {
  let proxy: Awaited<ReturnType<typeof getPlatformProxy<Env>>>;
  let db: Database;
  const postSlugs: string[] = [];
  const pluginIds: string[] = [];
  const categoryIds: string[] = [];
  const users: string[] = [];

  function fixture(relatedPluginSlugs: string[] = []) {
    const slug = `test-blog-${crypto.randomUUID()}`;
    postSlugs.push(slug);
    return blogInput(slug, relatedPluginSlugs);
  }

  async function insertPlugin(label: string, status: "draft" | "published" = "published") {
    const suffix = crypto.randomUUID().replaceAll("-", "").slice(0, 10);
    const id = `blog-plugin-${label}-${suffix}`;
    const slug = `blog-plugin-${label}-${suffix}`;
    pluginIds.push(id);
    await db.insert(plugins).values({
      id,
      slug,
      identityKey: `test:${slug}`,
      packageName: `@blog-fixture/${slug}`,
      name: `Blog fixture ${label}`,
      description: `Fixture ${label}`,
      authorHandle: "blog-fixture",
      category: "developer-tools",
      latestVersion: "1.0.0",
      compatibilityRange: "*",
      status,
      lifecycleStatus: "active",
    });
    return { id, slug };
  }

  async function insertCategory() {
    const suffix = crypto.randomUUID().replaceAll("-", "").slice(0, 10);
    const id = `blog-category-${suffix}`;
    const slug = `blog-category-${suffix}`;
    categoryIds.push(id);
    await db.insert(categories).values({ id, slug, sortOrder: 999 });
    await db.insert(categoryLocalizations).values([
      { categoryId: id, locale: "en", name: `Fixture ${label(suffix)}` },
      { categoryId: id, locale: "zh", name: `测试分类 ${label(suffix)}` },
    ]);
    return { id, slug };
  }

  function label(value: string) {
    return value.slice(-4);
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
    if (postSlugs.length) await db.delete(blogPosts).where(inArray(blogPosts.slug, postSlugs));
    if (categoryIds.length) await db.delete(categories).where(inArray(categories.id, categoryIds));
    if (pluginIds.length) await db.delete(plugins).where(inArray(plugins.id, pluginIds));
    if (users.length) await db.delete(authUsers).where(inArray(authUsers.id, users));
    await proxy.dispose();
  });

  it("keeps drafts out of public reads, publishes immediately, and links related plugins", async () => {
    const plugin = await insertPlugin("lifecycle");
    const input = fixture([plugin.slug]);
    const created = await createBlogPost(db, "local-operator", input);
    expect(created.revision).toBe(1);
    expect(await getBlogPost(db, input.slug)).toBeNull();
    expect((await getBlogPost(db, input.slug, true))?.relatedPluginSlugs).toEqual([plugin.slug]);
    expect((await listBlogPosts(db)).some((post) => post.slug === input.slug)).toBe(false);
    expect(
      (await listSitemapDatabaseRows(db)).some(
        (row) => row.kind === "blog" && row.value === input.slug,
      ),
    ).toBe(false);

    const { slug, ...fields } = input;
    const published = await updateBlogPost(db, "local-operator", slug, {
      ...fields,
      status: "published",
      ifRevision: 1,
    });
    expect(published.revision).toBe(2);
    expect(await getBlogPost(db, slug)).toMatchObject({ status: "published" });
    expect(
      (await listSitemapDatabaseRows(db))
        .filter((row) => row.kind === "blog" && row.value === slug)
        .map((row) => row.locale),
    ).toEqual(["en", "zh"]);

    const content = structuredClone(input.content);
    content.zh.title = "修改后立即从数据库读取";
    await updateBlogPost(db, "local-operator", slug, {
      ...fields,
      content,
      status: "published",
      ifRevision: 2,
    });
    expect((await listBlogPosts(db)).find((post) => post.slug === slug)?.copy.zh.title).toBe(
      content.zh.title,
    );
    await expect(
      updateBlogPost(db, "stale-writer", slug, { ...fields, status: "published", ifRevision: 2 }),
    ).rejects.toMatchObject({ status: 409, code: "revision_conflict" });
    expect((await getBlogPost(db, slug))?.contentJson.zh.title).toBe(content.zh.title);

    await updateBlogPost(db, "local-operator", slug, {
      ...fields,
      status: "draft",
      ifRevision: 3,
    });
    expect(await getBlogPost(db, slug)).toBeNull();
    expect(
      (await listSitemapDatabaseRows(db)).some((row) => row.kind === "blog" && row.value === slug),
    ).toBe(false);
    await expect(createBlogPost(db, "local-operator", input)).rejects.toMatchObject({
      status: 409,
      code: "blog_slug_conflict",
    });
  });

  it("rejects related plugins that do not exist", async () => {
    const input = fixture(["missing-plugin-with-no-record"]);
    await expect(createBlogPost(db, "local-operator", input)).rejects.toMatchObject({
      status: 422,
      code: "blog_plugin_not_found",
    });
  });

  it("requires operations permissions and supports authenticated API editing", async () => {
    const index = BlogIndexRoute.options.server?.handlers as unknown as Record<string, Handler>;
    const detail = BlogDetailRoute.options.server?.handlers as unknown as Record<string, Handler>;
    const input = fixture();
    const context = { cloudflare: { DB: proxy.env.DB } };
    for (const [handler, method, path] of [
      [index["GET"]!, "GET", ""],
      [index["POST"]!, "POST", ""],
      [detail["GET"]!, "GET", `/${input.slug}`],
      [detail["PUT"]!, "PUT", `/${input.slug}`],
    ] as const) {
      const response = await handler({
        request: new Request(`https://hub.test/api/ops/v1/blog${path}`, { method }),
        context,
        params: { slug: input.slug },
      });
      expect(response.status).toBe(401);
    }
    const userId = crypto.randomUUID();
    users.push(userId);
    await db
      .insert(authUsers)
      .values({ id: userId, name: "Blog operator", email: `${userId}@example.test` });
    await db
      .insert(userProfiles)
      .values({ userId, githubId: userId, githubLogin: `blog-${userId}`, role: "operator" });
    async function token(scopes: string[]) {
      const raw = crypto.randomUUID();
      await db.insert(apiTokens).values({
        id: crypto.randomUUID(),
        userId,
        label: "Blog test",
        tokenPrefix: raw.slice(0, 8),
        tokenHash: await sha256(raw),
        scopesJson: scopes,
        expiresAt: new Date(Date.now() + 60_000),
      });
      return raw;
    }
    const readonly = await token(["catalog:read"]);
    const denied = await index["POST"]!({
      request: new Request("https://hub.test/api/ops/v1/blog", {
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
      request: new Request("https://hub.test/api/ops/v1/blog", {
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
      request: new Request(`https://hub.test/api/ops/v1/blog/${slug}`, {
        method: "PUT",
        headers,
        body: JSON.stringify({ ...fields, status: "published", ifRevision: 1 }),
      }),
      context,
      params: { slug },
    });
    expect(updated.status).toBe(200);
    expect(updated.headers.get("cache-control")).toBe("no-store");
    expect(await getBlogPost(db, slug)).toMatchObject({ status: "published", revision: 2 });
  });

  it("curates ordered featured shelves per category and hides unpublished picks", async () => {
    const category = await insertCategory();
    const first = await insertPlugin("featured-first");
    const second = await insertPlugin("featured-second");

    await replaceFeaturedPicks(db, category.slug, [second.slug, first.slug]);
    const sections = await listFeaturedSections(db, "en");
    const shelf = sections.find((section) => section.slug === category.slug);
    expect(shelf?.name).toContain("Fixture");
    expect(shelf?.plugins.map((plugin) => plugin.slug)).toEqual([second.slug, first.slug]);

    await replaceFeaturedPicks(db, category.slug, [first.slug]);
    const replacements = await listFeaturedSections(db, "en");
    expect(
      replacements.find((section) => section.slug === category.slug)?.plugins.map((p) => p.slug),
    ).toEqual([first.slug]);

    const operations = await getFeaturedForOperations(db);
    expect(operations.items.find((item) => item.slug === category.slug)?.plugins).toEqual([
      {
        slug: first.slug,
        name: "Blog fixture featured-first",
        status: "published",
        lifecycleStatus: "active",
        sortOrder: 0,
      },
    ]);

    await db
      .update(plugins)
      .set({ status: "draft" })
      .where(inArray(plugins.id, [first.id]));
    const publicSections = await listFeaturedSections(db, "en");
    expect(publicSections.some((section) => section.slug === category.slug)).toBe(false);

    const cleared = await replaceFeaturedPicks(db, category.slug, []);
    expect(cleared).toMatchObject({ slug: category.slug, plugins: [] });
    expect((await listFeaturedSections(db, "en")).some((s) => s.slug === category.slug)).toBe(
      false,
    );

    await expect(
      replaceFeaturedPicks(db, category.slug, ["missing-featured-plugin"]),
    ).rejects.toMatchObject({ status: 422, code: "featured_plugin_not_found" });
    await expect(replaceFeaturedPicks(db, "missing-category", [])).rejects.toMatchObject({
      status: 404,
      code: "featured_category_not_found",
    });
  });
});
