import { describe, expect, it } from "vitest";

import {
  dailyDiscoveryQueries,
  dailyOperationsApiContract,
  dailyOperationsCommandContract,
  dailyOperationsPolicy,
  dailyOperationsPromptVersion,
  dailyOperationsScenarios,
  dailyReportSections,
  dailyReportTemplate,
  loadDailyOperationsPrompt,
} from "../src/index.js";

describe("daily operations v1 contract", () => {
  it("exports a deterministic versioned prompt", () => {
    const first = loadDailyOperationsPrompt();
    expect(dailyOperationsPromptVersion).toBe(4);
    expect(first).toBe(loadDailyOperationsPrompt());
    expect(first).toContain("daily operations Agent for DSHX Hub");
    expect(first).toContain("exact original README");
    expect(first).toContain("sourceReadmeHash");
    expect(first).toContain(
      "public GitHub publisher identity and avatar facts",
    );
    expect(first).toContain(
      "A generic sentence saying only that the package is cataloged is incomplete",
    );
    expect(first).not.toContain("${");
  });

  it("binds every supported atomic command to the prompt", () => {
    const prompt = loadDailyOperationsPrompt();
    expect(
      dailyOperationsCommandContract.map(({ command }) => command),
    ).toEqual([
      "source discover",
      "source inspect",
      "plugin list",
      "plugin get",
      "plugin upsert",
      "plugin curate",
      "plugin hide",
      "plugin restore",
      "submission list",
      "submission get",
      "submission resolve",
      "report latest",
      "report publish",
      "audit",
    ]);
    for (const contract of dailyOperationsCommandContract) {
      expect(prompt).toContain(contract.usage);
    }
  });

  it("keeps the bounded-run and failure policy explicit", () => {
    expect(dailyOperationsPolicy.runLimits).toEqual({
      maximumDurationMinutes: 90,
      minimumProcessedItemsWhenAvailable: 5,
      maximumProcessedItems: 10,
      maximumRetriesPerItem: 1,
    });
    expect(dailyOperationsPolicy.discovery).toMatchObject({
      lookbackHours: 72,
      publicDataOnly: true,
      installOrExecuteThirdPartyCode: false,
    });
    expect(
      dailyOperationsPolicy.failureHandling.publishPartialWhenHubReachable,
    ).toBe(true);
    expect(loadDailyOperationsPrompt()).toContain(
      "Stop the entire run immediately on Hub authentication failure",
    );
    expect(dailyOperationsPolicy.workflow.slice(0, 3)).toEqual([
      "submissions",
      "catalog-completeness",
      "catalog-refresh",
    ]);
    expect(dailyOperationsPolicy.workAllocation).toEqual({
      completenessItemsBeforeDiscovery: 10,
      maximumDiscoveryItemsWhileCompletenessBacklogExists: 0,
      completenessNeeds: ["readme", "publisher", "target", "content"],
      qualityFirst:
        "Finish each selected item through source inspection, fact upsert, bilingual curation, and final needs verification before using another item slot.",
    });
    expect(loadDailyOperationsPrompt()).toContain(
      "select an initial batch of 5",
    );
    expect(loadDailyOperationsPrompt()).toContain(
      "Reaching the 10-item quality cap",
    );
    expect(loadDailyOperationsPrompt()).toContain(
      "If needs still contains readme, publisher, target, or content",
    );
  });

  it("does not reintroduce a verification gate", () => {
    const admission = dailyOperationsPolicy.pluginAdmission;
    expect(admission.lifecycle).toEqual(["draft", "published", "hidden"]);
    expect(admission.migration).toEqual({
      keepPublishedPluginsPublished: true,
      historicalCandidatesBecome: "draft",
    });
    expect(admission.legacyObservationStatusesAcceptedButIgnored).toEqual([
      "confirmed",
      "candidate",
    ]);
    expect(admission.nonBlockingInformation).toContain("known incompatibility");
    expect(admission.automaticHideReasons).toEqual([
      "explicitly malicious",
      "impersonation",
      "definitely not a plugin",
      "documented compliance takedown",
    ]);
    expect(loadDailyOperationsPrompt()).toContain(
      "Do not send or rely on confirmed/candidate as a product state",
    );
  });

  it("exports the fixed install warning and confirmation policy", () => {
    expect(dailyOperationsPolicy.installation).toEqual({
      appliesToAllHubDrivenDownloadsAndInstalls: true,
      requiresSecondConfirmation: true,
      fixedRiskStatement: {
        en: "DSHX Hub only catalogs and organizes plugin metadata. It does not verify security, compatibility, or operability. Downloading or installing is at your own risk.",
        zh: "DSHX Hub 只收录和整理插件元信息，不验证安全性、兼容性或可运行性。下载或安装的风险由你自行承担。",
      },
      hardBlocks: dailyOperationsPolicy.pluginAdmission.structuralBlocks,
    });
    expect(loadDailyOperationsPrompt()).toContain(
      dailyOperationsPolicy.installation.fixedRiskStatement.en,
    );
    expect(loadDailyOperationsPrompt()).toContain(
      dailyOperationsPolicy.installation.fixedRiskStatement.zh,
    );
  });
});

describe("daily discovery queries", () => {
  it("covers every required signal on GitHub and npm", () => {
    expect(new Set(dailyDiscoveryQueries.map(({ id }) => id)).size).toBe(
      dailyDiscoveryQueries.length,
    );
    for (const provider of ["github", "npm"] as const) {
      const signals = dailyDiscoveryQueries
        .filter((query) => query.provider === provider)
        .map(({ signal }) => signal);
      expect(signals).toEqual([
        "dsh.bundle.patch",
        "cordis.patch.yml",
        "dsh-plugin-keywords",
        "deepseek-harness-plugin-keywords",
      ]);
    }
  });

  it("places every query verbatim in the loaded prompt", () => {
    const prompt = loadDailyOperationsPrompt();
    for (const query of dailyDiscoveryQueries) {
      expect(prompt).toContain(query.id);
      expect(prompt).toContain(JSON.stringify(query.query));
    }
  });
});

describe("daily report contract", () => {
  it("requires the immutable bilingual input and public endpoints", () => {
    expect(dailyOperationsApiContract).toMatchObject({
      protectedReportsEndpoint: "/api/ops/v1/reports",
      publicReportsEndpoint: "/api/operations/reports",
      reportStatuses: ["completed", "partial"],
      maximumBodyCharactersPerLocale: 10_000,
      maximumStoredReports: 1_000,
      publicPageSize: 20,
      idempotencyKey: "runId",
      immutableAfterPublish: true,
    });
    expect(dailyOperationsApiContract.reportInputFields).toEqual([
      "runId",
      "startedAt",
      "completedAt",
      "outcome",
      "body.en",
      "body.zh",
    ]);
  });

  it("keeps all fixed sections in both plain-text templates", () => {
    expect(dailyReportTemplate.rendering).toEqual({
      mediaType: "text/plain",
      parseMarkdown: false,
      parseHtml: false,
    });
    expect(dailyReportTemplate.body.en.length).toBeLessThanOrEqual(10_000);
    expect(dailyReportTemplate.body.zh.length).toBeLessThanOrEqual(10_000);
    for (const section of dailyReportSections) {
      expect(dailyReportTemplate.body.en).toContain(section.en);
      expect(dailyReportTemplate.body.zh).toContain(section.zh);
    }
  });
});

describe("daily operations scenarios", () => {
  it("covers discovery, submissions, safety, partial runs, and idempotency", () => {
    expect(dailyOperationsScenarios.map(({ id }) => id)).toEqual([
      "complete-mock-hub-run",
      "catalog-backlog-precedes-discovery",
      "github-discovery-publishes-complete-plugin",
      "npm-query-overlap-is-deduplicated",
      "submission-is-accepted-atomically",
      "ordinary-risk-remains-visible",
      "structural-install-hazard-blocks-publication",
      "malicious-plugin-is-hidden",
      "source-failure-publishes-partial-report",
      "run-limit-publishes-partial-report",
      "hub-authentication-failure-stops-run",
      "report-run-id-is-idempotent",
      "report-content-is-sanitized",
    ]);
    expect(
      dailyOperationsScenarios.some(
        ({ expectedReportStatus }) => expectedReportStatus === "partial",
      ),
    ).toBe(true);
    expect(
      dailyOperationsScenarios.some(
        ({ expectedReportStatus }) => expectedReportStatus === "not-published",
      ),
    ).toBe(true);
  });

  it("uses only commands from the atomic command contract", () => {
    const commands = new Set(
      dailyOperationsCommandContract.map(({ command }) => command),
    );
    for (const scenario of dailyOperationsScenarios) {
      for (const command of scenario.expectedCommands) {
        expect(commands.has(command), `${scenario.id}: ${command}`).toBe(true);
      }
    }
  });
});
