type HelpEntry = {
  summary: string;
  usage: string;
  reads: string;
  writes: string;
  recovery: string;
};

const commands: Record<string, HelpEntry> = {
  capabilities: {
    summary:
      "Read machine-readable commands and input JSON Schemas from this CLI.",
    usage: "dshx-hub capabilities [--output FILE]",
    reads: "The executing package and its runtime input schemas.",
    writes: "Nothing except an explicitly requested output file.",
    recovery:
      "Use this JSON directly; do not parse help text or TypeScript source.",
  },
  "ops prompt": {
    summary: "Read the operations prompt shipped with this CLI.",
    usage: "dshx-hub ops prompt [--output FILE]",
    reads: "The bundled, version-matched operations prompt and policy.",
    writes: "Nothing except an explicitly requested output file.",
    recovery:
      "Repair the package if its prompt is missing; do not search other checkouts.",
  },
  "ops preflight": {
    summary: "Verify this package and catalog access with one bounded read.",
    usage: "dshx-hub ops preflight [--expect-cli-version VERSION] [--hub URL]",
    reads: "Executing package metadata and the Hub credential endpoint.",
    writes: "Nothing. Credential values and token prefixes are omitted.",
    recovery:
      "Use the error code to distinguish missing credentials, edge challenges, access denial, and timeout.",
  },
  "ops begin": {
    summary: "Claim one local operations run and verify Hub access.",
    usage: "dshx-hub ops begin [--expect-cli-version VERSION] [--hub URL]",
    reads:
      "The bundled prompt, local run state, package metadata, and Hub credential endpoint.",
    writes:
      "Private local run state only, in DSHX_HUB_OPS_STATE_DIR. No Hub writes.",
    recovery:
      "An active run blocks overlap. Expired runs return preserved checkpoints for reconciliation; failed preflight is recorded locally.",
  },
  "ops status": {
    summary: "Read local active and prior runs without contacting the Hub.",
    usage: "dshx-hub ops status [--hub URL]",
    reads: "Private state under DSHX_HUB_OPS_STATE_DIR.",
    writes: "Nothing.",
    recovery:
      "Use checkpoints as receipts; verify current Hub resources before recovering uncertain writes.",
  },
  "ops checkpoint": {
    summary: "Persist the confirmed stage and identifiers for one item.",
    usage: "dshx-hub ops checkpoint --run-id RUN_ID --input FILE|- [--hub URL]",
    reads: "A checkpoint matching the JSON Schema in capabilities.",
    writes: "Private local state owned by the matching active run.",
    recovery:
      "An expired or superseded run cannot checkpoint. Never store credentials or raw source payloads.",
  },
  "ops finish": {
    summary: "Record the local run outcome and release its claim.",
    usage:
      "dshx-hub ops finish --run-id RUN_ID --outcome completed|partial|blocked [--hub URL]",
    reads: "The matching active local run.",
    writes:
      "Local outcome and retained checkpoints only; no Hub report is published.",
    recovery:
      "Confirm the Hub report before using completed or partial; use blocked when protected access or report confirmation is unavailable.",
  },
  "auth login": {
    summary:
      "Authorize this machine and store the revocable Hub token in the system keyring.",
    usage: "dshx-hub auth login [--hub URL] [--scopes LIST]",
    reads: "Browser authorization response and requested scopes.",
    writes: "One token in the operating-system credential store.",
    recovery:
      "Retry login if browser authorization expires; no catalog data is changed.",
  },
  "auth status": {
    summary: "Validate the stored token and show its user, scopes, and expiry.",
    usage: "dshx-hub auth status [--hub URL]",
    reads: "The local keyring and Hub token endpoint.",
    writes: "Nothing.",
    recovery: "Login again when the token is absent, expired, or revoked.",
  },
  "auth logout": {
    summary:
      "Revoke the current Hub token and remove it from the system keyring.",
    usage: "dshx-hub auth logout [--hub URL]",
    reads: "The current local token, when present.",
    writes: "Token revocation and local keyring deletion only.",
    recovery: "Login again when Hub access is needed.",
  },
  status: {
    summary:
      "Read Hub reachability, authentication, catalog, source-failure, and submission counts.",
    usage: "dshx-hub status [--hub URL] [--output FILE]",
    reads: "The aggregate Hub operations status.",
    writes: "Nothing except an explicitly requested output file.",
    recovery:
      "Use the returned facts to plan; the command never recommends or starts another action.",
  },
  "source inspect": {
    summary:
      "Inspect one public GitHub repository or npm package and emit PluginObservationV1 data.",
    usage: "dshx-hub source inspect SOURCE [--output FILE]",
    reads:
      "Public GitHub/npm metadata, bounded repository manifests, exact README source documents, and public GitHub publisher/avatar facts.",
    writes:
      "Nothing except an explicitly requested output file; packages are never installed or executed.",
    recovery:
      "Retry only retryable source errors; truncated results are complete up to the stated 100-package bound.",
  },
  "source discover": {
    summary:
      "Search one public GitHub or npm page for recently updated plugin candidates.",
    usage:
      "dshx-hub source discover --provider github|npm --query TEXT --since DATE [--cursor CURSOR] [--limit N] [--output FILE]",
    reads:
      "Public GitHub repository search or npm registry search metadata only.",
    writes:
      "Nothing except an explicitly requested output file; results are not admitted automatically.",
    recovery:
      "Continue with nextCursor; retry a rate limit once, then record and skip the source.",
  },
  "report latest": {
    summary: "Read the newest immutable bilingual Hub operations report.",
    usage: "dshx-hub report latest [--hub URL] [--output FILE]",
    reads:
      "The latest operations run timestamp, outcome, and bilingual plain-text body.",
    writes: "Nothing except an explicitly requested output file.",
    recovery:
      "Use a 72-hour overlap when no previous report exists or the prior run was partial.",
  },
  "report publish": {
    summary:
      "Publish one immutable bilingual report for a completed or partial operations run.",
    usage: "dshx-hub report publish --input FILE|- [--hub URL] [--output FILE]",
    reads:
      "A versioned runId, timestamps, outcome, and English and Chinese plain text.",
    writes:
      "One idempotent report; Hub prunes the oldest rows beyond the global 1,000 limit.",
    recovery:
      "Reuse the same runId only for the identical body; use a new runId for a new run.",
  },
  "plugin list": {
    summary:
      "Query plugins with composable state, need, source, risk, date, and cursor filters.",
    usage:
      "dshx-hub plugin list [--state VALUE] [--needs VALUE] [--source VALUE] [--risk VALUE] [--observed-before DATE] [--updated-before DATE] [--limit N] [--cursor CURSOR] [--all]",
    reads: "The Hub plugin operations projection.",
    writes: "Nothing.",
    recovery:
      "Reuse nextCursor, or use --all for pagination confined to this process.",
  },
  "plugin get": {
    summary: "Read the complete operations view for one plugin ID or slug.",
    usage: "dshx-hub plugin get ID_OR_SLUG [--output FILE]",
    reads:
      "Plugin facts, original README, publisher profile, curation, risks, visibility, revision, and recent audit data.",
    writes: "Nothing.",
    recovery: "Use the latest revision when preparing a curation update.",
  },
  "plugin upsert": {
    summary:
      "Submit one or more observations; observation IDs and per-item idempotency are automatic.",
    usage: "dshx-hub plugin upsert --input FILE|- [--dry-run] [--output FILE]",
    reads:
      "PluginObservationV1, an array, {observations}, or source-inspect success JSON.",
    writes:
      "Merges source observations into Hub facts unless --dry-run is set.",
    recovery:
      "Retry rejected items after repair; created, updated, and unchanged items are independently safe.",
  },
  "plugin curate": {
    summary:
      "Replace the curated bilingual content, categories, tags, and provenance for one plugin.",
    usage: "dshx-hub plugin curate PLUGIN_ID --input FILE [--if-revision N]",
    reads: "Curated content JSON and an optional resource revision.",
    writes: "Curated fields only; source facts and metrics cannot be supplied.",
    recovery:
      "On revision_conflict, read plugin get, merge with the latest curation, and retry.",
  },
  "plugin hide": {
    summary: "Hide one plugin from public visibility with an audit reason.",
    usage: "dshx-hub plugin hide PLUGIN_ID --reason TEXT",
    reads: "Plugin identity and reason.",
    writes: "Public visibility only.",
    recovery: "Use plugin restore only after a deliberate reviewed decision.",
  },
  "plugin restore": {
    summary: "Restore one deliberately hidden plugin with an audit reason.",
    usage: "dshx-hub plugin restore PLUGIN_ID --reason TEXT",
    reads: "Plugin identity and reason.",
    writes:
      "Public visibility only; source observations never restore automatically.",
    recovery: "Read plugin get before retrying a rejected visibility change.",
  },
  "submission list": {
    summary: "List user submissions, optionally filtered by status.",
    usage:
      "dshx-hub submission list [--status queued] [--limit N] [--cursor CURSOR] [--all]",
    reads: "Submission queue data.",
    writes: "Nothing.",
    recovery:
      "Continue with nextCursor or use --all for current-process pagination.",
  },
  "submission get": {
    summary: "Read one submission and its source and resolution context.",
    usage: "dshx-hub submission get SUBMISSION_ID",
    reads: "One submission.",
    writes: "Nothing.",
    recovery: "Inspect its source independently before deciding a resolution.",
  },
  "submission resolve": {
    summary: "Resolve one submission as accepted, duplicate, or ignored.",
    usage:
      "dshx-hub submission resolve SUBMISSION_ID --result accepted|duplicate|ignored [--plugin PLUGIN_ID] [--reason TEXT]",
    reads: "Resolution, related plugin ID when required, and audit reason.",
    writes: "The submission resolution only.",
    recovery:
      "Read the current submission before retrying a conflicting resolution.",
  },
  "media upload": {
    summary: "Validate and upload one image for a plugin.",
    usage: "dshx-hub media upload PLUGIN_ID --input media.json",
    reads:
      "A local PNG, JPEG, WebP, or AVIF plus bilingual Alt text and optional provenance.",
    writes: "Content-addressed media and its plugin metadata.",
    recovery:
      "Correct MIME, size, dimensions, hash, or Alt text and retry the same content safely.",
  },
  audit: {
    summary: "Read consistency findings without applying repairs.",
    usage: "dshx-hub audit [--scope catalog|storage|community] [--output FILE]",
    reads: "Catalog, storage, or community integrity checks.",
    writes: "Nothing.",
    recovery:
      "Choose atomic commands based on findings; this command never fixes data.",
  },
};

const groups: Record<string, string[]> = {
  auth: ["login", "status", "logout"],
  source: ["discover", "inspect"],
  report: ["latest", "publish"],
  plugin: ["list", "get", "upsert", "curate", "hide", "restore"],
  submission: ["list", "get", "resolve"],
  media: ["upload"],
  ops: ["prompt", "preflight", "begin", "status", "checkpoint", "finish"],
};

function commandHelp(entry: HelpEntry) {
  return `${entry.summary}\n\nUsage:\n  ${entry.usage}\n\nReads:\n  ${entry.reads}\n\nWrites:\n  ${entry.writes}\n\nRecovery:\n  ${entry.recovery}\n\nUse capabilities for machine-readable options and input schemas. Scheduled Hub writes accept --run-id RUN_ID to validate the local run before sending.\n`;
}

export function helpText(path: string[] = []) {
  const key = path.join(" ");
  if (commands[key]) return commandHelp(commands[key]);
  if (path.length === 1 && groups[path[0]!]) {
    const group = path[0]!;
    return `dshx-hub ${group}\n\nCommands:\n${groups[group]!.map(
      (name) => `  ${name}`,
    ).join("\n")}\n\nUse dshx-hub ${group} <command> --help for details.\n`;
  }
  return `dshx-hub — atomic operations for DSHX Hub\n\nRead capabilities for input schemas. Scheduled operations use ops begin and the bundled ops prompt. Domain commands remain independently callable.\n\nCommands:\n  capabilities\n  ops prompt|preflight|begin|status|checkpoint|finish\n  auth login|status|logout\n  status\n  source discover|inspect\n  plugin list|get|upsert|curate|hide|restore\n  submission list|get|resolve\n  report latest|publish\n  media upload\n  audit\n\nUse dshx-hub <group> <command> --help for details.\n`;
}
