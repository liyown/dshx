import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getPlatformProxy } from "wrangler";

import { Route as ProtectedReportsRoute } from "@/routes/api/ops/v1/reports/index";

import { operationReportInputSchema } from "./operations-v1.contracts";
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

  beforeAll(async () => {
    proxy = await getPlatformProxy<Env>({
      configPath: "wrangler.jsonc",
      persist: true,
      remoteBindings: false,
    });
    binding = proxy.env.DB;
  });

  beforeEach(async () => {
    await binding.prepare("delete from hub_operation_reports").run();
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
    await expect(
      publishOperationReport(binding, "actor-token", input),
    ).resolves.toMatchObject({ status: "created", report: input });
    await expect(
      publishOperationReport(binding, "actor-token", input),
    ).resolves.toMatchObject({ status: "unchanged", report: input });
    await expect(latestOperationReport(binding)).resolves.toMatchObject(input);

    await expect(
      publishOperationReport(binding, "actor-token", {
        ...input,
        body: { ...input.body, en: "different immutable report" },
      }),
    ).rejects.toMatchObject({
      status: 409,
      code: "idempotency_conflict",
    });

    await expect(
      listPublicOperationReports(binding, { locale: "en", limit: 20 }),
    ).resolves.toMatchObject({
      items: [{ runId: input.runId, body: input.body.en, outcome: "partial" }],
      nextCursor: null,
    });
    await expect(
      listPublicOperationReports(binding, { locale: "zh", limit: 20 }),
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
    await publishOperationReport(binding, "actor-token", input);
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
        binding,
        "actor-token",
        report({
          runId: `11111111-1111-4111-8111-${String(index + 1).padStart(12, "0")}`,
          completedAt: `2026-08-27T00:${minute}:00.000Z`,
          body: { en: `report ${index}`, zh: `报告 ${index}` },
        }),
      );
    }
    const first = await listPublicOperationReports(binding, { locale: "en", limit: 2 });
    expect(first.items.map(({ body }) => body)).toEqual(["report 2", "report 1"]);
    expect(first.nextCursor).toEqual(expect.any(String));
    const second = await listPublicOperationReports(binding, {
      locale: "en",
      limit: 2,
      cursor: first.nextCursor!,
    });
    expect(second.items.map(({ body }) => body)).toEqual(["report 0"]);
    expect(second.nextCursor).toBeNull();
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
    await publishOperationReport(binding, "actor-token", newest);
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
