import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { parsePluginObservation } from "../src/contracts.js";
import { CliError, normalizedError } from "../src/errors.js";
import * as keychain from "../src/keychain.js";
import { setKeyringEntryFactoryForTests } from "../src/keychain.js";
import { withOperationGuard } from "../src/operation-context.js";
import {
  curatePlugin,
  exitCodeForSuccess,
  latestReport,
  listPlugins,
  publishReport,
  resolveSubmission,
  setPluginVisibility,
  upsertPlugins,
} from "../src/operations.js";
import { successEnvelope } from "../src/protocol.js";

const originalFetch = globalThis.fetch;

function observation(packageName: string) {
  return {
    schemaVersion: 1,
    observedAt: "2026-08-27T00:00:00.000Z",
    identity: { kind: "npm", packageName },
    source: {
      kind: "npm",
      url: `https://registry.npmjs.org/${encodeURIComponent(packageName)}`,
      ref: "1.0.0",
      contentHash: "a".repeat(64),
      availability: "available",
    },
    detection: {
      status: "confirmed",
      signals: [{ kind: "dsh.bundle.patch", value: "plugin.patch.json" }],
    },
  };
}

function response(
  data: unknown,
  options: { status?: number; warnings?: unknown[]; requestId?: string } = {},
) {
  const ok = (options.status ?? 200) < 400;
  return new Response(
    JSON.stringify(
      ok
        ? {
            ok: true,
            data,
            warnings: options.warnings ?? [],
            meta: { requestId: options.requestId ?? "request-id" },
          }
        : data,
    ),
    {
      status: options.status ?? 200,
      headers: { "content-type": "application/json" },
    },
  );
}

beforeEach(() => {
  setKeyringEntryFactoryForTests(() => ({
    getPassword: () => "test-token",
    setPassword: () => undefined,
    deletePassword: () => true,
  }));
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  setKeyringEntryFactoryForTests();
  vi.restoreAllMocks();
});

describe("atomic Hub operations", () => {
  it("automatically makes repeated single upserts idempotent", async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    globalThis.fetch = vi.fn(async (input, init) => {
      requests.push({ url: String(input), ...(init ? { init } : {}) });
      return response({ status: "unchanged" });
    });

    await upsertPlugins(
      "https://hub.test",
      observation("@fixture/plugin"),
      true,
    );
    await upsertPlugins(
      "https://hub.test",
      observation("@fixture/plugin"),
      true,
    );

    expect(requests).toHaveLength(2);
    expect(requests[0]!.url).toMatch(
      /^https:\/\/hub\.test\/api\/ops\/v1\/observations\/[a-f0-9]{64}\?dryRun=true$/,
    );
    expect(requests[1]!.url).toBe(requests[0]!.url);
    const firstBody = JSON.parse(String(requests[0]!.init?.body)) as Record<
      string,
      unknown
    >;
    const secondBody = JSON.parse(String(requests[1]!.init?.body)) as Record<
      string,
      unknown
    >;
    expect(firstBody["observationId"]).toBe(secondBody["observationId"]);
    expect(requests[0]!.init?.method).toBe("PUT");
  });

  it("preserves pipeline warnings and input result order across partial batches", async () => {
    let sent: unknown;
    globalThis.fetch = vi.fn(async (_input, init) => {
      sent = JSON.parse(String(init?.body));
      return response({
        results: [
          { identity: "npm:a", status: "created" },
          { identity: "npm:c", status: "unchanged" },
        ],
      });
    });
    const inspected = successEnvelope(
      {
        source: { kind: "github", canonical: "github:fixture/repository" },
        observations: [
          observation("a"),
          { schemaVersion: 99 },
          observation("c"),
        ],
        truncated: true,
      },
      [
        {
          code: "workspace-truncated",
          message: "Only 100 packages were inspected.",
        },
      ],
      "collector-request",
    );
    const result = await upsertPlugins("https://hub.test", inspected, false);

    expect(sent).toMatchObject({ dryRun: false, observations: [{}, {}] });
    expect((sent as { observations: unknown[] }).observations).toHaveLength(2);
    expect(
      (result.data as { results: Array<{ status: string }> }).results.map(
        ({ status }) => status,
      ),
    ).toEqual(["created", "rejected", "unchanged"]);
    expect(result.warnings).toContainEqual(
      expect.objectContaining({ code: "workspace-truncated" }),
    );
    expect(exitCodeForSuccess(result)).toBe(2);
  });

  it("chunks batches at 100 items and honors an embedded dryRun request", async () => {
    const batchSizes: number[] = [];
    const dryRuns: boolean[] = [];
    let request = 0;
    globalThis.fetch = vi.fn(async (_input, init) => {
      request += 1;
      const body = JSON.parse(String(init?.body)) as {
        observations: Array<{ identity: { packageName: string } }>;
        dryRun: boolean;
      };
      batchSizes.push(body.observations.length);
      dryRuns.push(body.dryRun);
      return response(
        {
          results: body.observations.map((item) => ({
            identity: `npm:${item.identity.packageName}`,
            status: "unchanged",
          })),
        },
        {
          warnings: [{ code: `chunk-${request}`, message: "Chunk warning." }],
          requestId: `request-${request}`,
        },
      );
    });
    const observations = Array.from({ length: 101 }, (_, index) =>
      observation(`plugin-${String(index).padStart(3, "0")}`),
    );
    const result = await upsertPlugins(
      "https://hub.test",
      { observations, dryRun: true },
      false,
    );

    expect(batchSizes).toEqual([100, 1]);
    expect(dryRuns).toEqual([true, true]);
    expect((result.data as { results: unknown[] }).results).toHaveLength(101);
    expect(result.warnings.map(({ code }) => code)).toEqual([
      "chunk-1",
      "chunk-2",
    ]);
    expect(result.meta).toEqual({
      requestId: "request-1",
      requestIds: ["request-1", "request-2"],
    });
  });

  it("preserves completed chunks and separates uncertain writes from unattempted observations", async () => {
    const observations = Array.from({ length: 201 }, (_, index) =>
      parsePluginObservation(observation(`plugin-${index}`)),
    );
    const completed = observations.slice(0, 100).map((item, index) => ({
      identity: `npm:plugin-${index}`,
      observationId: item.observationId,
      status: "created",
    }));
    let requests = 0;
    globalThis.fetch = vi.fn(async () => {
      requests += 1;
      if (requests === 1)
        return response(
          { results: completed },
          { requestId: "completed-chunk" },
        );
      // Headers arrived, but the response body failed. The request may have
      // committed its writes before the connection was lost.
      return new Response(
        new ReadableStream({
          start(controller) {
            controller.error(new Error("secret-transport-detail"));
          },
        }),
        { headers: { "x-request-id": "uncertain-chunk" } },
      );
    });

    const error = await upsertPlugins(
      "https://hub.test",
      observations,
      false,
    ).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(CliError);
    expect(normalizedError(error)).toMatchObject({
      requestId: "uncertain-chunk",
      error: {
        code: "hub_unreachable",
        repairHint: expect.stringContaining("does not prove a write failed"),
        details: {
          batchProgress: {
            completedResults: completed,
            completedRequestIds: ["completed-chunk"],
            uncertainObservationIds: observations
              .slice(100, 200)
              .map(({ observationId }) => observationId),
            notAttemptedObservationIds: [observations[200]!.observationId],
          },
        },
      },
    });
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(normalizedError(error))).not.toContain("secret");
  });

  it("marks a chunk as unattempted when local credentials fail before fetch", async () => {
    const observations = Array.from({ length: 101 }, (_, index) =>
      parsePluginObservation(observation(`plugin-${index}`)),
    );
    globalThis.fetch = vi.fn(async (_input, init) => {
      const body = JSON.parse(String(init?.body)) as {
        observations: Array<{ observationId: string }>;
      };
      setKeyringEntryFactoryForTests(() => ({
        getPassword: () => null,
        setPassword: () => undefined,
        deletePassword: () => true,
      }));
      return response(
        {
          results: body.observations.map(({ observationId }) => ({
            observationId,
            status: "created",
          })),
        },
        { requestId: "completed-chunk" },
      );
    });

    const error = await upsertPlugins(
      "https://hub.test",
      observations,
      false,
    ).catch((caught: unknown) => caught);

    expect(normalizedError(error)).toMatchObject({
      error: {
        code: "authentication_required",
        retryable: false,
        details: {
          batchProgress: {
            completedResults: expect.any(Array),
            completedRequestIds: ["completed-chunk"],
            uncertainObservationIds: [],
            notAttemptedObservationIds: [observations[100]!.observationId],
          },
        },
      },
    });
    expect(globalThis.fetch).toHaveBeenCalledOnce();
  });

  it("marks pending chunks as unattempted when the credential fallback cannot be read", async () => {
    const observations = Array.from({ length: 201 }, (_, index) =>
      parsePluginObservation(observation(`plugin-${index}`)),
    );
    const completed = observations.slice(0, 100).map(({ observationId }) => ({
      observationId,
      status: "created",
    }));
    vi.spyOn(keychain, "readToken")
      .mockReturnValueOnce("fake-token")
      .mockImplementationOnce(() => {
        throw new CliError(
          {
            code: "credential_store_unavailable",
            message: "The operations credential fallback cannot be read.",
            retryable: true,
            details: { operation: "reading the Hub token" },
          },
          "credential-read-request",
        );
      });
    globalThis.fetch = vi.fn(async () =>
      response({ results: completed }, { requestId: "completed-chunk" }),
    );

    const error = await upsertPlugins(
      "https://hub.test",
      observations,
      false,
    ).catch((caught: unknown) => caught);

    expect(normalizedError(error)).toMatchObject({
      requestId: "credential-read-request",
      error: {
        code: "credential_store_unavailable",
        retryable: true,
        details: {
          operation: "reading the Hub token",
          batchProgress: {
            completedResults: completed,
            completedRequestIds: ["completed-chunk"],
            uncertainObservationIds: [],
            notAttemptedObservationIds: observations
              .slice(100)
              .map(({ observationId }) => observationId),
          },
        },
      },
    });
    expect(keychain.readToken).toHaveBeenCalledTimes(2);
    expect(globalThis.fetch).toHaveBeenCalledOnce();
  });

  it.each(["ops_run_expired", "ops_run_not_owner", "ops_state_invalid"])(
    "does not send a later chunk when the operation guard rejects it with %s",
    async (code) => {
      const observations = Array.from({ length: 201 }, (_, index) =>
        parsePluginObservation(observation(`plugin-${index}`)),
      );
      const completed = observations.slice(0, 100).map(({ observationId }) => ({
        observationId,
        status: "created",
      }));
      globalThis.fetch = vi.fn(async () =>
        response({ results: completed }, { requestId: "completed-chunk" }),
      );
      let checks = 0;
      const guard = vi.fn(async () => {
        checks += 1;
        if (checks === 2)
          throw new CliError(
            {
              code,
              message: "The operation run no longer permits writes.",
              retryable: false,
            },
            "guard-request",
          );
      });

      const error = await withOperationGuard(guard, () =>
        upsertPlugins("https://hub.test", observations, false),
      ).catch((caught: unknown) => caught);

      expect(normalizedError(error)).toMatchObject({
        requestId: "guard-request",
        error: {
          code,
          retryable: false,
          details: {
            batchProgress: {
              completedResults: completed,
              completedRequestIds: ["completed-chunk"],
              uncertainObservationIds: [],
              notAttemptedObservationIds: observations
                .slice(100)
                .map(({ observationId }) => observationId),
            },
          },
        },
      });
      expect(globalThis.fetch).toHaveBeenCalledOnce();
      expect(guard).toHaveBeenCalledTimes(2);
    },
  );

  it("keeps prior progress when a later chunk returns an incomplete result list", async () => {
    const observations = Array.from({ length: 101 }, (_, index) =>
      parsePluginObservation(observation(`plugin-${index}`)),
    );
    let requests = 0;
    globalThis.fetch = vi.fn(async (_input, init) => {
      requests += 1;
      const body = JSON.parse(String(init?.body)) as {
        observations: Array<{ observationId: string }>;
      };
      return response(
        {
          results:
            requests === 1
              ? body.observations.map(({ observationId }) => ({
                  observationId,
                  status: "created",
                }))
              : [],
        },
        { requestId: `chunk-${requests}` },
      );
    });

    const error = await upsertPlugins(
      "https://hub.test",
      observations,
      false,
    ).catch((caught: unknown) => caught);

    expect(normalizedError(error)).toMatchObject({
      requestId: "chunk-2",
      error: {
        code: "invalid_hub_response",
        details: {
          offset: 100,
          submitted: 1,
          received: 0,
          batchProgress: {
            completedRequestIds: ["chunk-1"],
            uncertainObservationIds: [observations[100]!.observationId],
            notAttemptedObservationIds: [],
          },
        },
      },
    });
    const progress = (error as CliError).issue.details as {
      batchProgress: { completedResults: unknown[] };
    };
    expect(progress.batchProgress.completedResults).toHaveLength(100);
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  it("combines repeated filters and follows --all cursors only in the current call", async () => {
    const urls: URL[] = [];
    globalThis.fetch = vi.fn(async (input) => {
      const url = new URL(String(input));
      urls.push(url);
      return url.searchParams.get("cursor") === "next"
        ? response(
            { items: [{ id: "second" }], nextCursor: null },
            { requestId: "page-2" },
          )
        : response(
            { items: [{ id: "first" }], nextCursor: "next" },
            { requestId: "page-1" },
          );
    });
    const filters = {
      state: ["published", "draft"],
      needs: ["refresh", "content"],
      source: ["npm", "github"],
      risk: ["repository-archived", "package-deprecated"],
      observedBefore: "2026-08-01",
      updatedBefore: "2026-08-02",
      limit: 2,
      all: true,
    };
    const first = await listPlugins("https://hub.test", filters);
    const second = await listPlugins("https://hub.test", {
      all: true,
      limit: 2,
    });

    expect((first.data as { items: unknown[] }).items).toHaveLength(2);
    expect((second.data as { items: unknown[] }).items).toHaveLength(2);
    expect(urls[0]!.searchParams.getAll("state")).toEqual([
      "published",
      "draft",
    ]);
    expect(urls[0]!.searchParams.getAll("needs")).toEqual([
      "refresh",
      "content",
    ]);
    expect(urls[0]!.searchParams.getAll("source")).toEqual(["npm", "github"]);
    expect(urls[0]!.searchParams.getAll("risk")).toEqual([
      "repository-archived",
      "package-deprecated",
    ]);
    expect(urls[1]!.searchParams.get("cursor")).toBe("next");
    expect(urls[2]!.searchParams.has("cursor")).toBe(false);
  });

  it("uses the agreed curation, visibility, and submission request bodies", async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    globalThis.fetch = vi.fn(async (input, init) => {
      requests.push({ url: String(input), ...(init ? { init } : {}) });
      return response({ updated: true });
    });
    const content = {
      displayName: { en: "Fixture", zh: "测试" },
      shortDescription: { en: "Fixture plugin", zh: "测试插件" },
      overviewMarkdown: { en: "Overview", zh: "概览" },
      categories: ["tools"],
      tags: ["fixture"],
      derivedFrom: ["https://example.test/readme"],
    };
    await curatePlugin("https://hub.test", "plugin-id", content, 3);
    await setPluginVisibility(
      "https://hub.test",
      "plugin-id",
      "hidden",
      "malicious content",
    );
    const resolvedPluginId = "11111111-1111-4111-8111-111111111111";
    await resolveSubmission("https://hub.test", "submission-id", {
      result: "duplicate",
      pluginId: resolvedPluginId,
    });

    expect(JSON.parse(String(requests[0]!.init?.body))).toEqual({
      content,
      ifRevision: 3,
    });
    expect(JSON.parse(String(requests[1]!.init?.body))).toEqual({
      visibility: "hidden",
      reason: "malicious content",
    });
    expect(JSON.parse(String(requests[2]!.init?.body))).toEqual({
      result: "duplicate",
      pluginId: resolvedPluginId,
    });
    await expect(
      curatePlugin("https://hub.test", "plugin-id", content, 0),
    ).rejects.toThrow("positive integer");
  });

  it("reads the latest report and publishes the immutable bilingual report contract", async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    globalThis.fetch = vi.fn(async (input, init) => {
      requests.push({ url: String(input), ...(init ? { init } : {}) });
      return response({ status: init?.method === "POST" ? "created" : "ok" });
    });
    const report = {
      runId: "11111111-1111-4111-8111-111111111111",
      startedAt: "2026-08-27T00:00:00.000Z",
      completedAt: "2026-08-27T00:30:00.000Z",
      outcome: "partial" as const,
      body: { en: "Plain English report", zh: "纯文本中文报告" },
    };
    await latestReport("https://hub.test");
    await publishReport("https://hub.test", report);
    expect(requests.map(({ url }) => url)).toEqual([
      "https://hub.test/api/ops/v1/reports",
      "https://hub.test/api/ops/v1/reports",
    ]);
    expect(requests[1]?.init?.method).toBe("POST");
    expect(JSON.parse(String(requests[1]?.init?.body))).toEqual({
      schemaVersion: 1,
      ...report,
    });
    expect(() =>
      publishReport("https://hub.test", {
        ...report,
        completedAt: "2026-08-26T23:00:00.000Z",
      }),
    ).toThrow("completedAt must be at or after startedAt");
    expect(() =>
      publishReport("https://hub.test", {
        ...report,
        body: { ...report.body, en: "x".repeat(10_001) },
      }),
    ).toThrow();
  });

  it("forwards structured revision conflicts and keeps warnings successful", async () => {
    globalThis.fetch = vi.fn(async () =>
      response(
        {
          ok: false,
          error: {
            code: "revision_conflict",
            message: "Revision changed.",
            retryable: true,
            repairHint: "Run plugin get, merge the latest content, and retry.",
          },
          meta: { requestId: "conflict-request" },
        },
        { status: 409 },
      ),
    );
    const error = await setPluginVisibility(
      "https://hub.test",
      "plugin-id",
      "hidden",
      "reviewed reason",
    ).catch((caught: unknown) => caught);
    expect(normalizedError(error)).toEqual({
      error: {
        code: "revision_conflict",
        message: "Revision changed.",
        retryable: true,
        repairHint: "Run plugin get, merge the latest content, and retry.",
      },
      requestId: "conflict-request",
    });
    expect(
      exitCodeForSuccess(
        successEnvelope({ status: "unchanged" }, [
          { code: "stale", message: "Review later." },
        ]),
      ),
    ).toBe(0);
    expect(
      exitCodeForSuccess(
        successEnvelope({ results: [{ status: "rejected" }] }),
      ),
    ).toBe(1);
  });

  it("rejects malformed 2xx Hub responses instead of reporting false success", async () => {
    globalThis.fetch = vi.fn(
      async () =>
        new Response("not-json", {
          status: 200,
          headers: {
            "content-type": "text/plain",
            "x-request-id": "bad-json",
          },
        }),
    );
    const nonJson = await listPlugins("https://hub.test", {}).catch(
      (error: unknown) => error,
    );
    expect(normalizedError(nonJson)).toMatchObject({
      error: { code: "invalid_hub_response", retryable: true },
      requestId: "bad-json",
    });

    globalThis.fetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ ok: true, data: { items: [] } }), {
          status: 200,
          headers: {
            "content-type": "application/json",
            "x-request-id": "bad-envelope",
          },
        }),
    );
    const malformed = await listPlugins("https://hub.test", {}).catch(
      (error: unknown) => error,
    );
    expect(normalizedError(malformed)).toMatchObject({
      error: { code: "invalid_hub_response", retryable: true },
      requestId: "bad-envelope",
    });
  });
});
