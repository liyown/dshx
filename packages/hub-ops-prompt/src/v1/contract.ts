import type { OperationsCommandContract } from "../contracts.js";

export const dailyOperationsPromptVersion = 7 as const;

export const dailyOperationsCommandContract = [
  {
    command: "capabilities",
    usage: "dshx-hub capabilities",
    access: "local-read",
  },
  { command: "ops prompt", usage: "dshx-hub ops prompt", access: "local-read" },
  {
    command: "ops preflight",
    usage: "dshx-hub ops preflight [--expect-cli-version VERSION]",
    access: "hub-read",
  },
  {
    command: "ops begin",
    usage: "dshx-hub ops begin [--expect-cli-version VERSION]",
    access: "local-write",
  },
  { command: "ops status", usage: "dshx-hub ops status", access: "local-read" },
  {
    command: "ops checkpoint",
    usage: "dshx-hub ops checkpoint --run-id RUN_ID --input FILE",
    access: "local-write",
  },
  {
    command: "ops finish",
    usage:
      "dshx-hub ops finish --run-id RUN_ID --outcome completed|partial|blocked",
    access: "local-write",
  },
  {
    command: "auth status",
    usage: "dshx-hub auth status",
    access: "hub-read",
  },
  {
    command: "status",
    usage: "dshx-hub status",
    access: "hub-read",
  },
  {
    command: "source discover",
    usage:
      "dshx-hub source discover --provider github|npm --query TEXT --since DATE [--cursor CURSOR] [--limit N]",
    access: "public-read",
  },
  {
    command: "source inspect",
    usage: "dshx-hub source inspect SOURCE [--output FILE]",
    access: "public-read",
  },
  {
    command: "plugin list",
    usage:
      "dshx-hub plugin list [--state VALUE] [--needs VALUE] [--source VALUE] [--risk VALUE] [--observed-before DATE] [--updated-before DATE] [--limit N] [--cursor CURSOR] [--all]",
    access: "hub-read",
  },
  {
    command: "plugin get",
    usage: "dshx-hub plugin get ID_OR_SLUG [--output FILE]",
    access: "hub-read",
  },
  {
    command: "plugin upsert",
    usage:
      "dshx-hub plugin upsert --input FILE|- --run-id RUN_ID [--dry-run] [--output FILE]",
    access: "hub-write",
  },
  {
    command: "plugin curate",
    usage:
      "dshx-hub plugin curate PLUGIN_ID --input FILE --run-id RUN_ID [--if-revision N]",
    access: "hub-write",
  },
  {
    command: "plugin hide",
    usage: "dshx-hub plugin hide PLUGIN_ID --reason TEXT --run-id RUN_ID",
    access: "hub-write",
  },
  {
    command: "plugin restore",
    usage: "dshx-hub plugin restore PLUGIN_ID --reason TEXT --run-id RUN_ID",
    access: "hub-write",
  },
  {
    command: "submission list",
    usage:
      "dshx-hub submission list [--status queued] [--limit N] [--cursor CURSOR] [--all]",
    access: "hub-read",
  },
  {
    command: "submission get",
    usage: "dshx-hub submission get SUBMISSION_ID",
    access: "hub-read",
  },
  {
    command: "submission resolve",
    usage:
      "dshx-hub submission resolve SUBMISSION_ID --result accepted|duplicate|ignored --run-id RUN_ID [--plugin PLUGIN_ID] [--reason TEXT]",
    access: "hub-write",
  },
  {
    command: "media upload",
    usage: "dshx-hub media upload PLUGIN_ID --input FILE --run-id RUN_ID",
    access: "hub-write",
  },
  {
    command: "report latest",
    usage: "dshx-hub report latest",
    access: "hub-read",
  },
  {
    command: "report publish",
    usage: "dshx-hub report publish --input FILE --run-id RUN_ID",
    access: "hub-write",
  },
  {
    command: "audit",
    usage: "dshx-hub audit [--scope catalog|storage|community] [--output FILE]",
    access: "hub-read",
  },
] as const satisfies readonly OperationsCommandContract[];

export const dailyOperationsApiContract = {
  schemaVersion: 1,
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
} as const;
