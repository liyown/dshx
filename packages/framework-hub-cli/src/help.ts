type HelpEntry = {
  summary: string;
  usage: string;
  input: string;
  output: string;
  writes: string;
  recovery: string;
  example: string;
};

const commands: Record<string, HelpEntry> = {
  "auth login": {
    summary:
      "Use browser PKCE authorization to issue a local Hub operations token.",
    usage: "dshx-hub auth login [--hub URL] [--scopes LIST]",
    input: "Hub URL and requested Hub scopes; no external-source credentials.",
    output: "Authenticated user, scopes, and token expiry.",
    writes:
      "Creates a revocable Hub token and stores its raw value in the system keychain.",
    recovery: "Retry safely or use auth logout to revoke the current token.",
    example: "dshx-hub auth login --hub https://dshx.io",
  },
  "auth status": {
    summary: "Validate the local Hub operations token.",
    usage: "dshx-hub auth status [--hub URL]",
    input: "No input.",
    output: "Current Hub authentication state.",
    writes: "Only updates token last-used metadata.",
    recovery: "Run auth login when the token is missing, revoked, or expired.",
    example: "dshx-hub auth status",
  },
  "auth logout": {
    summary: "Revoke the current Hub token and remove it from the keychain.",
    usage: "dshx-hub auth logout [--hub URL]",
    input: "No input.",
    output: "Revocation result.",
    writes: "Revokes the server token and deletes the local credential.",
    recovery: "Run auth login to issue another token.",
    example: "dshx-hub auth logout",
  },
  "contract show": {
    summary:
      "Read a versioned live Hub input contract and controlled policy values.",
    usage:
      "dshx-hub contract show --kind catalog|metrics|target|media|moderation",
    input: "Contract kind; catalog is the default.",
    output: "JSON Schema, version, page limit, taxonomy, and hash policy.",
    writes: "None.",
    recovery:
      "Refresh the contract after a schema mismatch; never guess new fields.",
    example:
      "dshx-hub contract show --kind catalog --output catalog-contract.json",
  },
  "catalog inventory": {
    summary: "Read published plugin identities and their current Hub state.",
    usage: "dshx-hub catalog inventory [--cursor CURSOR] [--limit N] [--all]",
    input: "Optional Hub cursor or --all for every page.",
    output:
      "Stable identities, repositories, install targets, and latest metrics.",
    writes: "None.",
    recovery: "Continue with nextCursor or rerun --all; reads are repeatable.",
    example: "dshx-hub catalog inventory --all --output inventory.json",
  },
  "catalog worklist": {
    summary:
      "Read Hub-originated submissions and stale or incomplete catalog work.",
    usage: "dshx-hub catalog worklist [--output FILE]",
    input: "No input.",
    output: "User submissions and catalog data requiring Agent research.",
    writes: "None.",
    recovery: "Rerun after publishing or maintenance changes.",
    example: "dshx-hub catalog worklist --output worklist.json",
  },
  "catalog verify": {
    summary:
      "Deterministically inspect one local package archive without executing it.",
    usage:
      "dshx-hub catalog verify --input evidence.json [--output attestation.json]",
    input:
      "EvidenceManifestV1 with local npm/git tar path, identity, and source evidence.",
    output:
      "Checks and VerificationAttestationV1 with path-free artifact basename/bytes when qualified; exit code 2 when rejected.",
    writes:
      "Only optional local output; never calls GitHub, npm, or package scripts.",
    recovery:
      "Replace or correct the local evidence and rerun the same command.",
    example:
      "dshx-hub catalog verify --input evidence.json --output verified.json",
  },
  "catalog check": {
    summary:
      "Validate complete CatalogProposalV2 pages against the live Hub contract.",
    usage: "dshx-hub catalog check --input proposals.json [--output FILE]",
    input: "One page containing 1–100 complete, bilingual proposals.",
    output:
      "Validity, item count, and stable identities or structured repair errors.",
    writes: "None.",
    recovery: "Correct the reported field/hash/category and check again.",
    example: "dshx-hub catalog check --input proposals.json",
  },
  "sync start": {
    summary: "Create a recoverable V2 staging run after qualified items exist.",
    usage:
      "dshx-hub sync start --idempotency-key KEY --expected N [--mode MODE]",
    input: "Deterministic key and exact qualified item count from 1 to 500.",
    output: "Open run metadata.",
    writes: "Creates catalog_sync_runs only; nothing becomes public.",
    recovery: "Reuse the same key, then sync resume, put, commit, or abort.",
    example:
      "dshx-hub sync start --idempotency-key daily-2026-08-24 --expected 3",
  },
  "sync put": {
    summary:
      "Atomically validate and stage one complete CatalogProposalV2 page.",
    usage: "dshx-hub sync put --run UUID --input proposals.json",
    input: "A locally checked page containing at most 100 proposals.",
    output: "Canonical plugin IDs, slugs, identities, and current run counts.",
    writes:
      "Writes accepted catalog_sync_items only; an invalid page writes nothing.",
    recovery:
      "Correct the page and resend; run and identity keys make retransmission idempotent.",
    example: "dshx-hub sync put --run RUN_ID --input page-1.json",
  },
  "sync preview": {
    summary: "Inspect an open run or locally validate a proposal page.",
    usage: "dshx-hub sync preview (--run UUID | --input proposals.json)",
    input: "Run ID or proposal page.",
    output: "Run completeness or local page summary.",
    writes: "None.",
    recovery: "Upload missing items or correct the local page.",
    example: "dshx-hub sync preview --run RUN_ID",
  },
  "sync commit": {
    summary: "Atomically promote a complete staging run to the public catalog.",
    usage: "dshx-hub sync commit --run UUID",
    input: "Open run with the exact expected qualified item count.",
    output: "Committed status and publication count.",
    writes:
      "Updates catalog, aliases, search, evidence, releases, and dependencies in one batch.",
    recovery:
      "An atomic failure leaves public data unchanged; inspect with sync resume and retry.",
    example: "dshx-hub sync commit --run RUN_ID",
  },
  "sync resume": {
    summary: "Read one run or locate the newest open run.",
    usage: "dshx-hub sync resume [--run UUID]",
    input: "Optional run ID.",
    output: "Run state and staged accepted items.",
    writes: "None.",
    recovery: "Continue with put, preview, commit, or explicit abort.",
    example: "dshx-hub sync resume --run RUN_ID",
  },
  "sync abort": {
    summary: "Mark an open staging run aborted without touching public data.",
    usage: "dshx-hub sync abort --run UUID",
    input: "Open run ID.",
    output: "Aborted run state.",
    writes: "Changes only the staging run status.",
    recovery:
      "Aborted runs cannot commit; create a new run only for a genuinely new operation.",
    example: "dshx-hub sync abort --run RUN_ID",
  },
  "metrics submit": {
    summary:
      "Submit Agent-collected MetricObservationV2 values in idempotent pages.",
    usage: "dshx-hub metrics submit --input metrics.json",
    input:
      "Sourced observations; unavailable values must not be fabricated as zero.",
    output: "Stored counts and server-computed 7/30-day trends.",
    writes: "Upserts metric daily/current rows by plugin and date.",
    recovery:
      "Resubmit the same plugin/date after correcting evidence or values.",
    example: "dshx-hub metrics submit --input metrics.json",
  },
  "targets submit": {
    summary: "Submit Agent-prepared full installation-target observations.",
    usage: "dshx-hub targets submit --input targets.json --idempotency-key KEY",
    input:
      "TargetObservationV2 results with sources, a complete-target check, and a qualified attestation for passes.",
    output: "Verification run pages and consecutive-failure effects.",
    writes:
      "Resets successful targets or increments complete failures; third failure may unpublish.",
    recovery:
      "Reuse the same key; a duplicate page never increments failures twice.",
    example:
      "dshx-hub targets submit --input targets.json --idempotency-key targets-2026-08-24",
  },
  "media check": {
    summary:
      "Validate local media bytes, dimensions, hash, source, and bilingual Alt text.",
    usage: "dshx-hub media check --input media.json [--output FILE]",
    input:
      "MediaUploadV2 items containing localPath; the CLI never downloads sourceUrl.",
    output: "Normalized MIME, size, dimensions, and SHA-256.",
    writes: "Only optional local output.",
    recovery: "Replace or re-encode invalid local files, then check again.",
    example: "dshx-hub media check --input media.json",
  },
  "media upload": {
    summary: "Recheck and upload local media through Hub to R2.",
    usage: "dshx-hub media upload --input media.json",
    input: "Locally available MediaUploadV2 items.",
    output: "Media IDs, R2 keys, and hash deduplication state.",
    writes: "Writes verified media metadata and content-addressed R2 objects.",
    recovery:
      "Rerun safely; plugin/kind/hash metadata and R2 content are deduplicated.",
    example: "dshx-hub media upload --input media.json",
  },
  "maintenance audit": {
    summary: "Run Hub-side D1, R2, FTS, alias, and catalog consistency checks.",
    usage: "dshx-hub maintenance audit --scope daily|full [--output FILE]",
    input: "Audit depth; external public-page inspection belongs to the Agent.",
    output: "Critical issues, warnings, and data statistics.",
    writes: "None.",
    recovery:
      "Stop catalog writes on critical findings and rerun after the underlying repair.",
    example: "dshx-hub maintenance audit --scope full",
  },
};

commands["moderation queue"] = {
  summary:
    "Read reported content, authors, aggregate evidence, and prior enforcement.",
  usage: "dshx-hub moderation queue [--output FILE]",
  input: "No input.",
  output: "Open moderation targets with reports and policy history.",
  writes: "None.",
  recovery:
    "Rerun after decisions; never infer hidden evidence from list summaries.",
  example: "dshx-hub moderation queue --output moderation.json",
};

for (const action of [
  "hide",
  "restore",
  "dismiss",
  "restrict",
  "unrestrict",
  "ban",
  "unban",
])
  commands[`moderation ${action}`] = {
    summary: `Request the registered ${action} moderation effect through Hub policy.`,
    usage: `dshx-hub moderation ${action} --target ID [--type TYPE] [--reports IDS] [--reason TEXT] [--idempotency-key KEY]`,
    input:
      "Stable target, linked report IDs, policy reason, and optional decision metadata.",
    output:
      "Atomic moderation result or an approval-aware pause with URL and resume command.",
    writes:
      "Executes policy-allowed effects; high-risk actions create approval requests instead of bypassing policy.",
    recovery:
      "Reuse the idempotency key or follow the returned approval resume command.",
    example: `dshx-hub moderation ${action} --target TARGET_ID --reason "policy decision"`,
  };

Object.assign(commands, {
  "approvals create": {
    summary:
      "Create one registered high-risk approval from preserved evidence.",
    usage: "dshx-hub approvals create --input approval.json",
    input:
      "Versioned evidence snapshot, effect, preconditions, policy, and idempotency key.",
    output: "Approval ID, admin URL, state, expiry, and stable wait command.",
    writes:
      "Creates an immutable approval request/version; does not execute the effect.",
    recovery:
      "Wait, revise only after changes_requested, or preserve the pause.",
    example: "dshx-hub approvals create --input approval.json",
  },
  "approvals show": {
    summary: "Read a visible approval and its current effect state.",
    usage: "dshx-hub approvals show --id UUID",
    input: "Approval ID.",
    output: "Redacted approval status plus URL and resume command.",
    writes: "None.",
    recovery: "Use the returned state to wait, revise, claim, or stop.",
    example: "dshx-hub approvals show --id APPROVAL_ID",
  },
  "approvals wait": {
    summary:
      "Short-poll a pending approval without treating the pause as failure.",
    usage: "dshx-hub approvals wait --id UUID [--timeout SECONDS]",
    input: "Approval ID and bounded wait duration.",
    output:
      "Terminal/actionable state or awaitingApproval with the same resume command.",
    writes: "None.",
    recovery:
      "Run the identical command later; do not create a duplicate approval.",
    example: "dshx-hub approvals wait --id APPROVAL_ID --timeout 300",
  },
  "approvals revise": {
    summary:
      "Submit a complete new immutable version after changes are requested.",
    usage: "dshx-hub approvals revise --id UUID --input revision.json",
    input:
      "Fresh evidence, source hash, preconditions, policy, and registered effect.",
    output: "New pending version with approval URL and resume command.",
    writes: "Appends an approval version; never mutates the prior version.",
    recovery:
      "Correct a rejected revision locally or wait on the accepted new version.",
    example: "dshx-hub approvals revise --id APPROVAL_ID --input revision.json",
  },
  "approvals claim-effect": {
    summary:
      "Claim a short Agent execution lease for an approved registered effect.",
    usage: "dshx-hub approvals claim-effect --id UUID [--run RUN_ID]",
    input: "Approved approval ID and its original run when run-bound.",
    output: "Lease token, expiry, and immutable registered task parameters.",
    writes:
      "Creates an auditable effect attempt/lease; it does not invent a new task.",
    recovery: "The same run may reclaim only after lease expiry.",
    example: "dshx-hub approvals claim-effect --id APPROVAL_ID --run RUN_ID",
  },
  "approvals effect-result": {
    summary:
      "Complete an approved Agent effect lease with a structured result.",
    usage:
      "dshx-hub approvals effect-result --id UUID --lease TOKEN --status succeeded|failed [--input result.json]",
    input: "Lease token, terminal status, and registered structured result.",
    output: "Idempotent effect state and related workflow update.",
    writes:
      "Appends the effect result and applies only the registered completion semantics.",
    recovery:
      "A repeated identical result is safe; preserve a failed result for policy recovery.",
    example:
      "dshx-hub approvals effect-result --id APPROVAL_ID --lease LEASE --status succeeded --input result.json",
  },
  "users role set": {
    summary:
      "Request a registered user-role change through mandatory approval.",
    usage:
      "dshx-hub users role set --user UUID --role ROLE [--reason TEXT] [--idempotency-key KEY]",
    input: "User ID, proposed role, reason, and deterministic idempotency key.",
    output: "Approval-aware response with admin URL and resume command.",
    writes:
      "Creates an approval; role changes cannot be written directly by this command.",
    recovery: "Wait on the returned approval and reuse its resume command.",
    example:
      'dshx-hub users role set --user USER_ID --role moderator --reason "scope change"',
  },
} satisfies Record<string, HelpEntry>);

const passthroughGroups: Record<string, string[]> = {
  moderation: [
    "queue",
    "hide",
    "restore",
    "dismiss",
    "restrict",
    "unrestrict",
    "ban",
    "unban",
  ],
  approvals: [
    "create",
    "show",
    "wait",
    "revise",
    "claim-effect",
    "effect-result",
  ],
  users: ["role set"],
};

const groups: Record<string, string[]> = {
  auth: ["login", "status", "logout"],
  contract: ["show"],
  catalog: ["inventory", "worklist", "verify", "check"],
  sync: ["start", "put", "preview", "commit", "resume", "abort"],
  metrics: ["submit"],
  targets: ["submit"],
  media: ["check", "upload"],
  maintenance: ["audit"],
  ...passthroughGroups,
};

function commandHelp(key: string, entry: HelpEntry) {
  return `${entry.summary}\n\nUsage:\n  ${entry.usage}\n\nInput:\n  ${entry.input}\n\nOutput:\n  ${entry.output}\n\nWrites:\n  ${entry.writes}\n\nRecovery:\n  ${entry.recovery}\n\nExample:\n  ${entry.example}\n`;
}

export function helpText(path: string[] = []) {
  const key = path.join(" ");
  if (commands[key]) return commandHelp(key, commands[key]);
  if (key === "users role")
    return "dshx-hub users role\n\nCommands:\n  set\n\nRun dshx-hub users role set --help for details.\n";
  if (path.length === 1 && groups[path[0]!]) {
    const group = path[0]!;
    return `dshx-hub ${group}\n\nCommands:\n${groups[group]!.map(
      (name) => `  ${name}`,
    ).join("\n")}\n\nRun dshx-hub ${group} <command> --help for details.\n`;
  }
  return `dshx-hub — stable DSHX Hub verification and write gateway\n\nThe external Agent discovers, researches, downloads, and decides. This CLI validates local evidence and performs authenticated Hub effects.\n\nGroups:\n${Object.keys(
    groups,
  )
    .map((name) => `  ${name}`)
    .join("\n")}\n\nRun dshx-hub <group> --help for commands.\n`;
}
