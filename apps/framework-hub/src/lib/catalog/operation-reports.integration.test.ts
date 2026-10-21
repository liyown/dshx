import { sql } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getPlatformProxy } from "wrangler";

import { Route as ProtectedReportsRoute } from "@/routes/api/ops/v1/reports/index";
import { createDatabase, type Database } from "@/lib/db/client";
import { listIndexableSitemapLocales } from "@/lib/sitemap.repository.server";

import { operationReportInputSchema } from "./operations-v1.contracts";
import { getPublicOperationReportDetail } from "./operation-report-detail.server";
import {
  latestOperationReport,
  listPublicOperationReports,
  publishOperationReport,
} from "./operation-reports.server";

function report(overrides: Record<string, unknown> = {}) {
  return operationReportInputSchema.parse({
    runId: "11111111-1111-4111-8111-111111111111",
    startedAt: "2026-08-27T00:00:00.000Z",
    completedAt: "2026-08-27T00:30:00.000Z",
    outcome: "completed",
    body: {
      en: "Source scope\nGitHub and npm\n\nErrors\nNone",
      zh: "来源范围\nGitHub 与 npm\n\n错误\n无",
    },
    ...overrides,
  });
}

describe("immutable Hub operations reports with local D1", () => {
  let proxy: Awaited<ReturnType<typeof getPlatformProxy<Env>>>;
  let binding: D1Database;
  let db: Database;
  const createdPluginIds: string[] = [];

  beforeAll(async () => {
    proxy = await getPlatformProxy<Env>({
      configPath: "wrangler.jsonc",
      persist: true,
      remoteBindings: false,
    });
    binding = proxy.env.DB;
    db = createDatabase(binding);
  });

  beforeEach(async () => {
    await binding.prepare("delete from hub_operation_reports").run();
  });

  afterEach(async () => {
    if (createdPluginIds.length === 0) return;
    // The audit ledger is append-only and intentionally has no foreign key to
    // plugins, so removing the fixtures leaves those ledger rows harmless.
    const placeholders = createdPluginIds.map(() => "?").join(",");
    await binding
      .prepare(`delete from plugins where id in (${placeholders})`)
      .bind(...createdPluginIds)
      .run();
    createdPluginIds.length = 0;
  });

  afterAll(async () => proxy.dispose());

  it("publishes bilingual text, returns latest, and enforces runId idempotency", async () => {
    const input = report({
      outcome: "partial",
      body: {
        en: "<script>alert('plain text')</script>",
        zh: "<b>只作为纯文本</b>",
      },
    });
    await expect(publishOperationReport(db, "actor-token", input)).resolves.toMatchObject({
      status: "created",
      report: input,
    });
    await expect(publishOperationReport(db, "actor-token", input)).resolves.toMatchObject({
      status: "unchanged",
      report: input,
    });
    await expect(latestOperationReport(db)).resolves.toMatchObject(input);

    await expect(
      publishOperationReport(db, "actor-token", {
        ...input,
        body: { ...input.body, en: "different immutable report" },
      }),
    ).rejects.toMatchObject({
      status: 409,
      code: "idempotency_conflict",
    });

    await expect(
      listPublicOperationReports(db, { locale: "en", limit: 20 }),
    ).resolves.toMatchObject({
      items: [{ runId: input.runId, body: input.body.en, outcome: "partial" }],
      nextCursor: null,
    });
    await expect(
      listPublicOperationReports(db, { locale: "zh", limit: 20 }),
    ).resolves.toMatchObject({
      items: [{ runId: input.runId, body: input.body.zh }],
    });
  });

  it("requires a catalog token on the protected reports endpoint", async () => {
    const handlers = ProtectedReportsRoute.options.server?.handlers as unknown as
      | {
          GET: (input: { request: Request; context: unknown }) => Promise<Response>;
        }
      | undefined;
    if (!handlers) throw new Error("Protected reports route handlers are unavailable");
    const handler = handlers.GET;
    const response = await handler({
      request: new Request("https://hub.test/api/ops/v1/reports"),
      context: { cloudflare: { DB: binding } },
    });
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: { code: "unauthorized", retryable: false },
    });
  });

  it("validates body limits, time order, control characters, and immutable rows", async () => {
    expect(
      operationReportInputSchema.safeParse({
        ...report(),
        body: { en: "x".repeat(10_001), zh: "中文" },
      }).success,
    ).toBe(false);
    expect(
      operationReportInputSchema.safeParse({
        ...report(),
        body: { en: "unsafe\u0000text", zh: "中文" },
      }).success,
    ).toBe(false);
    expect(
      operationReportInputSchema.safeParse({
        ...report(),
        completedAt: "2026-08-26T23:59:59.000Z",
      }).success,
    ).toBe(false);

    const input = report();
    await publishOperationReport(db, "actor-token", input);
    await expect(
      binding
        .prepare("update hub_operation_reports set body_en='mutated' where run_id=?")
        .bind(input.runId)
        .run(),
    ).rejects.toThrow(/immutable/i);
  });

  it("paginates newest first with a stable cursor", async () => {
    for (let index = 0; index < 3; index += 1) {
      const minute = String(index).padStart(2, "0");
      await publishOperationReport(
        db,
        "actor-token",
        report({
          runId: `11111111-1111-4111-8111-${String(index + 1).padStart(12, "0")}`,
          completedAt: `2026-08-27T00:${minute}:00.000Z`,
          body: { en: `report ${index}`, zh: `报告 ${index}` },
        }),
      );
    }
    const first = await listPublicOperationReports(db, { locale: "en", limit: 2 });
    expect(first.items.map(({ body }) => body)).toEqual(["report 2", "report 1"]);
    expect(first.nextCursor).toEqual(expect.any(String));
    const second = await listPublicOperationReports(db, {
      locale: "en",
      limit: 2,
      cursor: first.nextCursor!,
    });
    expect(second.items.map(({ body }) => body)).toEqual(["report 0"]);
    expect(second.nextCursor).toBeNull();
  });

  it("serves one report with audit-derived plugins and neighbouring runs", async () => {
    const suffix = crypto.randomUUID().replaceAll("-", "").slice(0, 12);
    const actor = `actor-run-detail-${suffix}`;
    const plugin = async (name: string) => {
      const id = `report-plugin-${name}-${suffix}`;
      const slug = `report-plugin-${name}-${suffix}`;
      createdPluginIds.push(id);
      await db.run(sql`
        insert into plugins (
          id,slug,identity_key,package_name,name,description,author_handle,category,
          latest_version,compatibility_range,lifecycle_status,status
        ) values (
          ${id},${slug},${`report:${slug}`},${`@report-fixture/${slug}`},${`Report ${name}`},
          ${`Report fixture ${name}`},'report-fixture','tools','1.0.0','*','active','published'
        )
      `);
      return { id, slug };
    };
    const first = await plugin("first");
    const ignored = await plugin("ignored");

    const input = report({
      runId: "33333333-3333-4333-8333-333333333333",
      body: { en: "Long enough report body", zh: "足够长的日报正文" },
    });
    await publishOperationReport(db, actor, input);
    const stored = await binding
      .prepare("select created_at from hub_operation_reports where run_id=?")
      .bind(input.runId)
      .first<{ created_at: number }>();
    if (!stored) throw new Error("Published report was not stored");
    const createdAt = stored.created_at;

    const audit = (pluginId: string, action: string, actor: string, when: number) =>
      binding
        .prepare(
          `insert into plugin_operation_audit(
            id,request_id,actor_token_id,action,resource_type,resource_id,plugin_id,created_at
          ) values(?,?,?,?,?,?,?,?)`,
        )
        .bind(
          crypto.randomUUID(),
          crypto.randomUUID(),
          actor,
          action,
          "plugin",
          pluginId,
          pluginId,
          when,
        )
        .run();
    await audit(first.id, "observation.created", actor, createdAt - 10 * 60_000);
    await audit(first.id, "plugin.curate", actor, createdAt - 5 * 60_000);
    await audit(ignored.id, "observation.updated", "another-actor", createdAt - 5 * 60_000);
    await audit(first.id, "observation.updated", actor, createdAt - 70 * 60_000);

    const detail = await getPublicOperationReportDetail(db, input.runId, "en");
    expect(detail).toMatchObject({
      runId: input.runId,
      body: input.body.en,
      related: [
        {
          plugin: { slug: first.slug },
          actions: ["observation.created", "plugin.curate"],
        },
      ],
      newer: null,
      older: null,
    });
    await expect(getPublicOperationReportDetail(db, crypto.randomUUID(), "en")).resolves.toBeNull();

    await publishOperationReport(
      db,
      actor,
      report({
        runId: "33333333-3333-4333-8333-333333333334",
        completedAt: "2026-08-27T01:00:00.000Z",
        body: { en: "Newer report", zh: "较新的日报" },
      }),
    );
    await publishOperationReport(
      db,
      actor,
      report({
        runId: "33333333-3333-4333-8333-333333333332",
        startedAt: "2026-08-26T22:30:00.000Z",
        completedAt: "2026-08-26T23:00:00.000Z",
        body: { en: "Older report", zh: "更早的日报" },
      }),
    );
    await expect(getPublicOperationReportDetail(db, input.runId, "en")).resolves.toMatchObject({
      newer: { runId: "33333333-3333-4333-8333-333333333334" },
      older: { runId: "33333333-3333-4333-8333-333333333332" },
    });
  });

  it("indexes only reports with substantive localized bodies", async () => {
    const shortBody = report({
      runId: "44444444-4444-4444-8444-444444444441",
      body: { en: "short", zh: "短" },
    });
    const longBody = report({
      runId: "44444444-4444-4444-8444-444444444442",
      body: { en: "x".repeat(400), zh: "中".repeat(400) },
    });
    await publishOperationReport(db, "actor-token", shortBody);
    await publishOperationReport(db, "actor-token", longBody);

    expect(await listIndexableSitemapLocales(db, "operation-report", shortBody.runId)).toEqual([]);
    expect(await listIndexableSitemapLocales(db, "operation-report", longBody.runId)).toEqual([
      "en",
      "zh",
    ]);
  });

  it("keeps exactly the latest 1000 reports after the 1001st publish", async () => {
    const base = Date.parse("2026-08-01T00:00:00.000Z");
    await binding
      .prepare(
        `with recursive sequence(value) as (
          select 0 union all select value + 1 from sequence where value < 999
        )
        insert into hub_operation_reports(
          run_id,started_at,completed_at,outcome,body_en,body_zh,payload_hash,actor_token_id,created_at
        )
        select
          'seed-' || printf('%04d',value), ? + value, ? + value, 'completed',
          'seed ' || value, '种子 ' || value, 'hash-' || value, 'actor-token', ? + value
        from sequence`,
      )
      .bind(base, base, base)
      .run();

    const newest = report({
      runId: "22222222-2222-4222-8222-222222222222",
      startedAt: new Date(base + 1_000).toISOString(),
      completedAt: new Date(base + 1_000).toISOString(),
    });
    await publishOperationReport(db, "actor-token", newest);
    const count = await binding
      .prepare("select count(*) count,min(completed_at) oldest from hub_operation_reports")
      .first<{ count: number; oldest: number }>();
    expect(count).toEqual({ count: 1_000, oldest: base + 1 });
    expect(
      await binding
        .prepare("select count(*) count from hub_operation_reports where run_id='seed-0000'")
        .first(),
    ).toEqual({ count: 0 });
  });
});
