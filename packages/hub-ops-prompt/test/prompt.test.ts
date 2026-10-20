import { describe, expect, it } from "vitest";

import {
  dailyDiscoveryQueries,
  dailyOperationsApiContract,
  dailyOperationsCliPackageName,
  dailyOperationsCommandContract,
  dailyOperationsPolicy,
  dailyOperationsPromptVersion,
  dailyOperationsPromptUrl,
  dailyOperationsScenarios,
  dailyReportSections,
  dailyReportTemplate,
  loadDailyOperationsPrompt,
  renderDailyOperationsBootstrap,
  renderDailyOperationsPrompt,
} from "../src/index.js";

const promptContext = {
  cliVersion: "1.2.3",
  promptUrl: dailyOperationsPromptUrl,
} as const;

describe("autonomous operations mandate", () => {
  it("ships a deterministic v9 mandate centered on website value", () => {
    const prompt = loadDailyOperationsPrompt();
    expect(dailyOperationsPromptVersion).toBe(9);
    expect(prompt).toBe(loadDailyOperationsPrompt());
    expect(prompt).toContain("responsible operator and editor");
    expect(prompt).toContain("useful, accurate, and fresh");
    expect(prompt).toContain("discover and admit worthwhile new plugins");
    expect(prompt).toContain("improve or update existing entries");
    expect(prompt).not.toContain("${");
  });

  it("leaves business priorities and workload to the Agent", () => {
    expect(dailyOperationsPolicy.operatingMandate).toMatchObject({
      proactiveDiscovery: true,
      waitForSubmissions: false,
      fixedItemQuota: false,
      requiredBusinessSequence: false,
    });
    expect(dailyOperationsPolicy.operatingMandate.autonomousDecisions).toEqual(
      expect.arrayContaining([
        "topics worth investigating",
        "search sources, queries, and time windows",
        "priorities and the mix of new and existing plugins",
        "workload and depth of investigation",
      ]),
    );
    for (const obsolete of [
      "runLimits",
      "workflow",
      "workAllocation",
      "itemAccounting",
    ])
      expect(dailyOperationsPolicy).not.toHaveProperty(obsolete);
    const prompt = loadDailyOperationsPrompt();
    expect(prompt).toContain("There is no fixed item quota");
    expect(prompt).toContain("Do not wait for submissions");
    expect(prompt).toContain(
      "choose more useful work instead of repeating it every run",
    );
    expect(prompt).not.toMatch(
      /initial (?:five|batch)|reserved.*slots|5 to 10|three maintenance|72.hour overlap/iu,
    );
  });

  it("permits broader public research and treats query examples as inspiration", () => {
    expect(dailyOperationsPolicy.research).toMatchObject({
      publicDataOnly: true,
      queryExamplesAreExclusive: false,
      installOrExecuteThirdPartyCode: false,
    });
    expect(dailyOperationsPolicy.research.sources).toEqual(
      expect.arrayContaining([
        "public web search",
        "public web pages",
        "GitHub",
        "npm",
        "official documentation",
        "public community leads",
      ]),
    );
    const prompt = loadDailyOperationsPrompt();
    expect(prompt).toContain(
      "Use available public web search and browsing tools",
    );
    expect(prompt).toContain("optional starting points, not an exclusive list");
    expect(prompt).toContain("does not restrict public web research tools");
    expect(prompt).toContain("adapt queries, sources, or time windows");
    for (const query of dailyDiscoveryQueries)
      expect(prompt).toContain(JSON.stringify(query.query));
    expect(new Set(dailyDiscoveryQueries.map(({ id }) => id)).size).toBe(
      dailyDiscoveryQueries.length,
    );
  });

  it("preserves publication evidence and quality without prescribing every operation", () => {
    const prompt = loadDailyOperationsPrompt();
    expect(prompt).toContain("choose only operations needed for the change");
    for (const requirement of [
      "exact original README",
      "sourceReadmeHash",
      "derivedFrom",
      "public GitHub publisher identity and avatar facts",
      "one unambiguous structurally safe installation target",
      "Confirm the resulting plugin with plugin get",
      "never install, build, import, or execute third-party plugin code",
    ])
      expect(prompt).toContain(requirement);
    expect(dailyOperationsPolicy.provenance.inventedFactsAllowed).toBe(false);
    expect(dailyOperationsPolicy.pluginAdmission.lifecycle).toEqual([
      "draft",
      "published",
      "hidden",
    ]);
    expect(
      dailyOperationsPolicy.pluginAdmission.nonBlockingInformation,
    ).toContain("known incompatibility");
    expect(dailyOperationsPolicy.pluginAdmission.automaticHideReasons).toEqual([
      "explicitly malicious",
      "impersonation",
      "definitely not a plugin",
      "documented compliance takedown",
    ]);
  });
});

describe("tool and recovery contracts", () => {
  it("includes the actual CLI command surface and guards every Hub write", () => {
    const prompt = loadDailyOperationsPrompt();
    const names = dailyOperationsCommandContract.map(({ command }) => command);
    expect(new Set(names).size).toBe(names.length);
    expect(names).toEqual(
      expect.arrayContaining([
        "capabilities",
        "ops bundle",
        "ops begin",
        "auth login",
        "ops checkpoint",
        "ops finish",
        "source discover",
        "source inspect",
        "plugin list",
        "plugin get",
        "plugin upsert",
        "plugin curate",
        "submission resolve",
        "media upload",
        "report publish",
        "report latest",
      ]),
    );
    for (const entry of dailyOperationsCommandContract) {
      expect(prompt).toContain(entry.usage);
      if (entry.access === "hub-write")
        expect(entry.usage).toContain("--run-id RUN_ID");
      expect(entry.command).not.toMatch(
        /^(?:contract|catalog|maintenance|sync|targets|metrics|approvals|moderation|users)\b/u,
      );
    }
    expect(dailyOperationsPolicy.toolUse.runIdRequiredOnHubWrites).toBe(true);
    expect(prompt).toContain(
      "do not reconstruct the environment from checkouts",
    );
  });

  it("retains the technical lease and uncertainty rules without an editorial quota", () => {
    expect(dailyOperationsPolicy.runLease).toMatchObject({
      stopStartingAfterMinutes: 50,
      expiresAfterMinutes: 60,
      checkpointExtendsDeadline: false,
    });
    const prompt = loadDailyOperationsPrompt();
    for (const text of [
      "Run ops begin once",
      "DSHX_HUB_OPS_STATE_DIR",
      "technical boundaries, not output targets",
      "all recoveryRuns",
      "missing receipts do not prove writes failed",
      "uncertainObservationIds",
      "notAttemptedObservationIds",
      "hub_edge_challenge",
    ])
      expect(prompt).toContain(text);
    expect(dailyOperationsPolicy.failureHandling.retryOnlyWhenRetryable).toBe(
      true,
    );
    expect(dailyOperationsPolicy.failureHandling).not.toHaveProperty(
      "retryItemAtMostOnce",
    );
    expect(prompt).toContain("A skipped lead does not end independent work");
  });

  it("preserves the existing end-user installation product rules", () => {
    expect(dailyOperationsPolicy.installation).toEqual({
      appliesToAllHubDrivenDownloadsAndInstalls: true,
      requiresSecondConfirmation: true,
      fixedRiskStatement: {
        en: "DSHX Hub only catalogs and organizes plugin metadata. It does not verify security, compatibility, or operability. Downloading or installing is at your own risk.",
        zh: "DSHX Hub 只收录和整理插件元信息，不验证安全性、兼容性或可运行性。下载或安装的风险由你自行承担。",
      },
      hardBlocks: dailyOperationsPolicy.pluginAdmission.structuralBlocks,
    });
  });
});

describe("flexible reporting with a stable API", () => {
  it("retains the immutable bilingual plain-text API fields", () => {
    expect(dailyOperationsApiContract).toMatchObject({
      protectedReportsEndpoint: "/api/ops/v1/reports",
      publicReportsEndpoint: "/api/operations/reports",
      reportInputFields: [
        "runId",
        "startedAt",
        "completedAt",
        "outcome",
        "body.en",
        "body.zh",
      ],
      reportStatuses: ["completed", "partial"],
      maximumBodyCharactersPerLocale: 10_000,
      maximumStoredReports: 1_000,
      publicPageSize: 20,
      idempotencyKey: "runId",
      immutableAfterPublish: true,
    });
    expect(dailyReportTemplate.rendering).toEqual({
      mediaType: "text/plain",
      parseMarkdown: false,
      parseHtml: false,
    });
    expect(dailyReportTemplate.body.en.length).toBeLessThanOrEqual(10_000);
    expect(dailyReportTemplate.body.zh.length).toBeLessThanOrEqual(10_000);
  });

  it("makes section labels optional and separates useful results from activity", () => {
    expect(dailyReportTemplate.requiredSections).toBe(false);
    expect(dailyOperationsPolicy.report.requiredSections).toBe(false);
    expect(dailyReportTemplate.sections).toEqual(dailyReportSections);
    const prompt = loadDailyOperationsPrompt();
    expect(prompt).toContain("there are no mandatory report sections");
    expect(prompt).toContain(
      "publishing a report is not itself a website improvement",
    );
    expect(prompt).toContain("an unexecuted query is not zero results");
    expect(prompt).toContain(
      "confirm its runId before ops finish completed/partial",
    );
    expect(prompt).not.toContain("sections in order");
    expect(prompt).not.toContain("say None");
    expect(dailyReportTemplate.forbiddenContent).toEqual(
      expect.arrayContaining([
        "tokens or credentials",
        "private network addresses or private URLs",
        "internal audit payloads",
      ]),
    );
  });
});

describe("editorial scenarios", () => {
  it("covers autonomous decisions and real tool boundaries, not one workflow", () => {
    expect(dailyOperationsScenarios.map(({ id }) => id)).toEqual(
      expect.arrayContaining([
        "public-research-discovers-plugin-without-submission",
        "important-existing-entry-earns-focused-attention",
        "empty-queries-lead-to-better-research",
        "unchanged-blocker-does-not-monopolize-operations",
        "technical-lease-bounds-autonomous-work",
        "uncertain-write-recovery-preserves-evidence",
        "report-is-flexible-factual-and-confirmed",
      ]),
    );
    expect(
      new Set(
        dailyOperationsScenarios.map(
          ({ expectedReportStatus }) => expectedReportStatus,
        ),
      ),
    ).toEqual(new Set(["completed", "partial", "not-published"]));
    const relevantCommands = new Set(
      dailyOperationsCommandContract.map(({ command }) => command),
    );
    for (const scenario of dailyOperationsScenarios)
      for (const command of scenario.expectedCommands)
        expect(
          relevantCommands.has(command),
          `${scenario.id}: ${command}`,
        ).toBe(true);
    const webDiscovery = dailyOperationsScenarios.find(
      ({ id }) => id === "public-research-discovers-plugin-without-submission",
    );
    expect(webDiscovery?.expectedCommands).not.toContain("source discover");
    expect(webDiscovery?.expectedCommands).not.toContain("submission list");
  });
});

describe("copyable running prompt", () => {
  it("substitutes the pinned CLI version and administrator URL", () => {
    const rendered = renderDailyOperationsPrompt(promptContext);
    expect(rendered).toContain(
      `npx --yes --package ${dailyOperationsCliPackageName}@1.2.3 dshx-hub`,
    );
    expect(rendered).toContain("ops bundle");
    expect(rendered).not.toContain("{{");
    expect(rendered).not.toContain("${");
  });

  it("renders a stable bootstrap that converges to the bundle's CLI version", () => {
    const bootstrap = renderDailyOperationsBootstrap(promptContext);
    expect(bootstrap).toContain(
      `npx --yes --package ${dailyOperationsCliPackageName}@preview dshx-hub ops bundle`,
    );
    expect(bootstrap).toContain("agent_bundle_mismatch");
    expect(bootstrap).toContain("expectedCliVersion");
    expect(bootstrap).toContain("bundle.meta.cliVersion");
    expect(bootstrap).toContain("bundle.prompt");
    expect(bootstrap).toContain("bundle.resources");
    expect(bootstrap).toContain(dailyOperationsPromptUrl);
    expect(bootstrap).not.toContain("{{");
    expect(bootstrap.length).toBeLessThan(1_800);
  });

  it("contains the start, discipline, error, and finish contracts", () => {
    const rendered = renderDailyOperationsPrompt(promptContext);
    for (const text of [
      "Mandatory start checklist",
      "capabilitiesHash",
      "ops preflight",
      "ops begin once",
      "recoveryRuns",
      "Minimum research effort before declaring zero useful work",
      "distinct discovery queries",
      "identical failed command",
      "Anti-drift",
      "Anti-stall",
      "Checkpoint input:",
      "Report input:",
      "idempotency_conflict",
      "ops_run_expired",
      "ops_run_not_owner",
      "hub_edge_challenge",
      "Exit code 2 means a partial batch",
      "Hard prohibitions",
      "Run ops finish with the matching run ID",
    ])
      expect(rendered).toContain(text);
  });

  it("documents the effort floor without turning it into an output quota", () => {
    expect(
      dailyOperationsPolicy.discipline.minimumResearchBeforeZeroWork,
    ).toEqual({
      distinctQueries: 3,
      distinctProviders: 2,
      candidatesInspected: 3,
      reviewQueuedSubmissions: true,
      reviewIncompleteEntries: true,
      recordRejectedLeads: true,
    });
    expect(dailyOperationsPolicy.discipline.identicalFailureRetryLimit).toBe(2);
    expect(dailyOperationsPolicy.credentials).toMatchObject({
      managedBy: "dshx-hub auth login",
      tokenLifetimeDays: 180,
      automaticRefresh: false,
      tokenInPrompt: false,
    });
    const rendered = renderDailyOperationsPrompt(promptContext);
    expect(rendered).toContain(
      "This is an effort floor, not a publication quota",
    );
    expect(rendered).toContain("180 days");
    expect(rendered).toContain("there is no automatic refresh");
  });

  it("keeps the generated prompt bounded and free of credentials", () => {
    const rendered = renderDailyOperationsPrompt(promptContext);
    expect(rendered.length).toBeLessThan(24_000);
    expect(rendered).not.toMatch(/dshx_hub_[A-Za-z0-9_-]+/u);
    expect(rendered).not.toMatch(/Bearer\s+[A-Za-z0-9._-]+/u);
  });
});
