export const dailyOperationsPolicy = {
  schemaVersion: 1,
  operatingMandate: {
    role: "DSHX Hub's responsible operator and editor",
    objective:
      "Make the website useful, accurate, and fresh through active research, new plugin discovery and admission, and improvements to existing entries.",
    autonomousDecisions: [
      "topics worth investigating",
      "search sources, queries, and time windows",
      "priorities and the mix of new and existing plugins",
      "workload and depth of investigation",
      "when to change direction or finish useful work",
    ],
    proactiveDiscovery: true,
    waitForSubmissions: false,
    fixedItemQuota: false,
    requiredBusinessSequence: false,
  },
  research: {
    sources: [
      "public web search",
      "public web pages",
      "GitHub",
      "npm",
      "official documentation",
      "public community leads",
    ],
    queryExamplesAreExclusive: false,
    searchWindow: "Chosen by the Agent for the question being investigated.",
    emptySearch:
      "An empty query is evidence about that query only; adapt terms, sources, or the time window when further research is useful.",
    publicDataOnly: true,
    installOrExecuteThirdPartyCode: false,
    deduplicateBy: {
      github:
        "canonical repository ID plus subdirectory; use lower-cased owner/name plus subdirectory only when no repository ID is available, never to override a known ID conflict",
      npm: "canonical lower-cased package name",
    },
  },
  runLease: {
    stopStartingAfterMinutes: 50,
    expiresAfterMinutes: 60,
    checkpointExtendsDeadline: false,
    scope: "One operating machine using the same persistent state directory.",
  },
  toolUse: {
    publicResearch:
      "Use available web search and browsing tools; the CLI command reference does not restrict public research tools.",
    hubOperations:
      "Use the configured CLI for structured Hub reads, writes, source inspection, and durable run receipts.",
    runIdRequiredOnHubWrites: true,
    confirmWrittenResources: true,
  },
  pluginAdmission: {
    lifecycle: ["draft", "published", "hidden"],
    migration: {
      keepPublishedPluginsPublished: true,
      historicalCandidatesBecome: "draft",
    },
    legacyObservationStatusesAcceptedButIgnored: ["confirmed", "candidate"],
    upsertMeaning:
      "The Agent has decided the source represents a plugin; the Hub must not repeat an evidence gate.",
    publishRequirements: [
      "stable identity",
      "display name",
      "version",
      "source",
      "original README collection result",
      "GitHub publisher identity and avatar when a repository owner is available",
      "one unambiguous structurally safe installation target",
      "English and Chinese display names",
      "English and Chinese short descriptions",
      "English and Chinese overviews",
      "sourceReadmeHash matching the current original README when it is available",
      "at least one category",
      "source citations in derivedFrom",
    ],
    nonBlockingInformation: [
      "ordinary risk",
      "unverified status",
      "unknown compatibility",
      "known incompatibility",
      "archived repository",
      "deprecated package",
    ],
    structuralBlocks: [
      "missing installation target",
      "multiple installation targets that cannot be disambiguated",
      "identity conflict",
      "command injection or an equivalent structural hazard in the installation description",
    ],
    automaticHideReasons: [
      "explicitly malicious",
      "impersonation",
      "definitely not a plugin",
      "documented compliance takedown",
    ],
    trustLabels: ["Official", "Community"],
    legacyNonOfficialVerifiedLabel: "Community",
  },
  installation: {
    appliesToAllHubDrivenDownloadsAndInstalls: true,
    requiresSecondConfirmation: true,
    fixedRiskStatement: {
      en: "DSHX Hub only catalogs and organizes plugin metadata. It does not verify security, compatibility, or operability. Downloading or installing is at your own risk.",
      zh: "DSHX Hub 只收录和整理插件元信息，不验证安全性、兼容性或可运行性。下载或安装的风险由你自行承担。",
    },
    hardBlocks: [
      "missing installation target",
      "multiple installation targets that cannot be disambiguated",
      "identity conflict",
      "command injection or an equivalent structural hazard in the installation description",
    ],
  },
  provenance: {
    translationAndSummarizationAllowed: true,
    derivedFactsRequireDerivedFrom: true,
    inventedFactsAllowed: false,
    preserveOriginalReadme: true,
    originalReadmeRendering: "escaped plain text",
    refreshCurationWhenReadmeHashChanges: true,
    collectPublicPublisherAvatar: true,
  },
  curationQuality: {
    forbiddenGenericPlaceholders: true,
    overviewMustCoverWhenSourced: [
      "what the plugin does",
      "core capabilities",
      "configuration or usage",
      "important limitations or operational risks",
    ],
    acceptSubmissionOnlyAfter: [
      "the original README collection result is stored",
      "the public publisher profile and avatar are stored when GitHub supplies them",
      "exactly one unambiguous structurally safe installation target is available",
      "English and Chinese overviews cite and match the current README hash",
    ],
    confirmInferredNpmTargetWithRegistryInspection: true,
  },
  failureHandling: {
    retryOnlyWhenRetryable: true,
    retryBudget: "Respect service backoff and the remaining run lease.",
    sourceFailure:
      "Record the unresolved item and choose useful independent work or another research direction. A skipped item does not end the run.",
    authenticationFailure: "stop Hub writes and record the access blocker",
    hubUnavailable: "stop Hub writes and preserve uncertain receipts",
    publishPartialWhenHubReachable: true,
    partialTriggers: [
      "work the Agent undertook remains incomplete or unconfirmed",
      "a material blocker prevents the intended result",
    ],
    partialMeaning:
      "A final outcome describing unfinished work, not an instruction to stop at the first difficulty.",
  },
  report: {
    maximumCharactersPerLocale: 10_000,
    format: "plain-text",
    languages: ["en", "zh"],
    requiredSections: false,
    scope:
      "Describe the priorities, evidence, confirmed changes, useful findings, and material unfinished work that actually matter for this run.",
    forbiddenContent: [
      "tokens or credentials",
      "email addresses",
      "private network addresses or private URLs",
      "local file paths",
      "raw stack traces",
    ],
  },
} as const;
