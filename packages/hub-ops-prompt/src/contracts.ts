export type OperationsProvider = "github" | "npm";

export type DailyDiscoveryQuery = {
  readonly id: string;
  readonly provider: OperationsProvider;
  readonly query: string;
  readonly signal:
    | "dsh.bundle.patch"
    | "cordis.patch.yml"
    | "dsh-plugin-keywords"
    | "deepseek-harness-plugin-keywords";
  readonly rationale: string;
};

export type OperationsCommandContract = {
  readonly command: string;
  readonly usage: string;
  readonly access:
    "public-read" | "hub-read" | "hub-write" | "local-read" | "local-write";
};

export type ReportSection = {
  readonly id:
    | "source-scope"
    | "submissions"
    | "discovery"
    | "new-plugins"
    | "content"
    | "maintenance"
    | "skipped"
    | "errors";
  readonly en: string;
  readonly zh: string;
};

export type DailyOperationsScenario = {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly title: string;
  readonly given: readonly string[];
  /** Relevant CLI operations for the example, not a required execution order. */
  readonly expectedCommands: readonly string[];
  readonly expectedOutcomes: readonly string[];
  readonly expectedReportStatus: "completed" | "partial" | "not-published";
};
