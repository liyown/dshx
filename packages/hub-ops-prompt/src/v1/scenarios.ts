import type { DailyOperationsScenario } from "../contracts.js";

/** Editorial examples, not scripts or a list each run must complete. */
export const dailyOperationsScenarios = [
  {
    schemaVersion: 1,
    id: "public-research-discovers-plugin-without-submission",
    title: "The operator finds a useful plugin through public web research",
    given: [
      "No user has submitted the plugin and it is absent from the catalog.",
      "A public community discussion links to official documentation and a GitHub source supporting a useful capability.",
    ],
    expectedCommands: [
      "source inspect",
      "plugin list",
      "plugin upsert",
      "plugin curate",
      "plugin get",
      "report publish",
    ],
    expectedOutcomes: [
      "The Agent uses public search and browsing, follows the lead, and verifies claims against the original source.",
      "It chooses this opportunity without waiting for submissions or requiring a source discover query first.",
      "It admits the canonical plugin with sourced bilingual content and confirms the resulting Hub entry.",
    ],
    expectedReportStatus: "completed",
  },
  {
    schemaVersion: 1,
    id: "important-existing-entry-earns-focused-attention",
    title: "An important inaccurate entry merits focused editorial work",
    given: [
      "An existing popular plugin's description contradicts current official documentation.",
      "Other submissions and discovery opportunities exist, but this correction has greater immediate value.",
    ],
    expectedCommands: ["plugin get", "plugin curate", "report publish"],
    expectedOutcomes: [
      "The Agent chooses the correction's depth and scope rather than filling a maintenance/discovery ratio.",
      "It researches the relevant documentation, cites evidence, and changes only the affected bilingual content.",
      "It verifies the update without repeating unrelated source writes or treating unselected backlog as failure.",
    ],
    expectedReportStatus: "completed",
  },
  {
    schemaVersion: 1,
    id: "empty-queries-lead-to-better-research",
    title: "Unproductive search examples prompt a different strategy",
    given: [
      "Several bundled GitHub/npm query examples return no results.",
      "A broader public web search using a capability or author name reveals a promising source.",
    ],
    expectedCommands: ["source discover", "source inspect", "report publish"],
    expectedOutcomes: [
      "The Agent adapts terms, channels, and time windows instead of treating the example query list as an allowlist.",
      "It reports the actual scope and returned results of each material search, not a claim that the entire ecosystem has no plugins.",
      "Research findings and confirmed admissions are distinguished in the report.",
    ],
    expectedReportStatus: "completed",
  },
  {
    schemaVersion: 1,
    id: "unchanged-blocker-does-not-monopolize-operations",
    title: "An unchanged non-retryable entry gives way to useful work",
    given: [
      "Prior receipts establish a non-retryable source problem and no evidence suggests it changed.",
      "Another plugin has a fresh release worth investigating.",
    ],
    expectedCommands: ["plugin get", "source inspect", "report publish"],
    expectedOutcomes: [
      "The Agent records what would unblock the old entry instead of mechanically repeating the same failed action every run.",
      "It chooses the new investigation and its workload based on expected value.",
      "It can end with an honest useful finding without inventing writes to meet a minimum item count.",
    ],
    expectedReportStatus: "completed",
  },
  {
    schemaVersion: 1,
    id: "submission-acceptance-follows-verified-quality",
    title: "A chosen submission is accepted only after its entry is complete",
    given: [
      "The Agent chooses to investigate a queued public plugin submission.",
    ],
    expectedCommands: [
      "submission get",
      "source inspect",
      "plugin upsert",
      "plugin curate",
      "plugin get",
      "submission resolve",
      "report publish",
    ],
    expectedOutcomes: [
      "Stored evidence preserves the original README hash and public publisher facts when available.",
      "Bilingual curation cites the evidence, and the exact installation target is unambiguous and structurally safe.",
      "A final plugin read clears readme, publisher, target, and content needs before acceptance.",
    ],
    expectedReportStatus: "completed",
  },
  {
    schemaVersion: 1,
    id: "structural-hazard-stays-draft",
    title: "Useful research does not justify unsafe publication",
    given: ["A promising source has an ambiguous installation target."],
    expectedCommands: [
      "source inspect",
      "plugin upsert",
      "plugin get",
      "report publish",
    ],
    expectedOutcomes: [
      "Safe sourced facts can be retained in draft without claiming the entry is complete or published.",
      "The Agent records the unresolved target and does not execute third-party code to test it.",
      "The intended publication remains incomplete and is reported as partial.",
    ],
    expectedReportStatus: "partial",
  },
  {
    schemaVersion: 1,
    id: "ordinary-risk-remains-visible",
    title: "Ordinary risk is explained with evidence",
    given: [
      "A plugin is archived, deprecated, incompatible, or unverified, with a valid identity and installation target.",
    ],
    expectedCommands: ["plugin get", "plugin curate", "report publish"],
    expectedOutcomes: [
      "The Agent explains sourced limitations without hiding the plugin merely for ordinary risk.",
      "It does not claim Hub verified security, compatibility, or operability.",
    ],
    expectedReportStatus: "completed",
  },
  {
    schemaVersion: 1,
    id: "source-failure-allows-independent-work",
    title: "An isolated failure does not dictate the rest of the run",
    given: [
      "A chosen source remains unavailable, while independent opportunities remain and the Hub is reachable.",
    ],
    expectedCommands: ["source inspect", "ops checkpoint", "report publish"],
    expectedOutcomes: [
      "Retry decisions respect retryable, backoff, uncertainty, and the remaining lease rather than a business quota.",
      "The Agent preserves the blocker and chooses another useful direction.",
      "Partial records material unfinished work at closure, not a requirement to stop immediately.",
    ],
    expectedReportStatus: "partial",
  },
  {
    schemaVersion: 1,
    id: "technical-lease-bounds-autonomous-work",
    title: "The operator respects the local lease without a work-count target",
    given: [
      "The returned stopStartingAt arrives while a chosen improvement is still incomplete.",
    ],
    expectedCommands: [
      "ops checkpoint",
      "report publish",
      "report latest",
      "ops finish",
    ],
    expectedOutcomes: [
      "No new item is started after stopStartingAt, and writes and reporting respect leaseExpiresAt.",
      "The Agent preserves unfinished work and reports what was actually confirmed.",
      "The local lease does not impose a minimum or maximum plugin count or a required business sequence.",
    ],
    expectedReportStatus: "partial",
  },
  {
    schemaVersion: 1,
    id: "uncertain-write-recovery-preserves-evidence",
    title: "Recovery reconciles uncertain writes before continuing",
    given: [
      "An earlier run lost a batch response and saved checkpoints before a later blocked preflight.",
    ],
    expectedCommands: [
      "ops begin",
      "ops status",
      "plugin get",
      "ops checkpoint",
      "report publish",
    ],
    expectedOutcomes: [
      "The Agent examines all recoveryRuns and distinguishes completed, uncertain, and unattempted observations.",
      "Missing receipts are not treated as proof of zero writes; current resources and idempotency guide recovery.",
      "Every Hub write uses the owned run ID and relevant resource revision.",
    ],
    expectedReportStatus: "completed",
  },
  {
    schemaVersion: 1,
    id: "hub-access-failure-blocks-writes",
    title: "An access blocker is reported accurately",
    given: [
      "The Hub returns an authentication failure or Cloudflare challenge.",
    ],
    expectedCommands: ["ops begin", "ops status"],
    expectedOutcomes: [
      "The Agent stops Hub writes, retains the real code/requestId, and does not repeatedly log in for an edge challenge.",
      "It records the blocked local result without claiming report publication or website improvement.",
      "Credentials and token prefixes remain private.",
    ],
    expectedReportStatus: "not-published",
  },
  {
    schemaVersion: 1,
    id: "report-is-flexible-factual-and-confirmed",
    title: "A concise report explains actual results without empty sections",
    given: [
      "The run produced one useful investigation and a confirmed content correction; no submissions or moderation were involved.",
    ],
    expectedCommands: ["report publish", "report latest", "ops finish"],
    expectedOutcomes: [
      "The Agent chooses a concise structure and omits irrelevant sections while preserving bilingual plain-text API fields.",
      "It distinguishes research from confirmed changes and excludes secrets, private URLs, paths, and raw internal errors.",
      "Immutable report retries reuse identical input, and local completion follows confirmation of the same report run ID.",
    ],
    expectedReportStatus: "completed",
  },
] as const satisfies readonly DailyOperationsScenario[];
