# @becomeopc/dshx-hub-cli

JSON-first operations client for the [DSHX Framework Hub](https://dshx.io). It gives Agents small domain operations they can inspect, combine, and retry independently. The Hub owns resource validation, merging, revisions, visibility, and audit history; the CLI provides fixed preflight checks and local run checkpoints for scheduled operations.

## Install

```bash
pnpm add -g @becomeopc/dshx-hub-cli
dshx-hub --help
```

Configure and verify an executable path and package version once during installation. Scheduled runs reuse that executable. Authentication prefers the operating-system credential store and verifies that a saved token can be read back. When that store is unavailable or does not persist the token, an explicitly configured `DSHX_HUB_OPS_STATE_DIR` permits a private credential file compatible with the existing preview CLI; its directory uses mode `0700` and the file uses `0600`. Preserve that directory when updating the CLI, and never copy credentials between operating machines. The same explicit directory holds local run ownership, outcomes, and item checkpoints; the CLI does not derive it from `CODEX_HOME`. Resource revisions, plugin data, source observations, and audit records remain in the Hub. Pagination cursors followed by `--all` remain in the current process.

## Command surface

```text
dshx-hub
├── capabilities
├── ops
│   ├── prompt
│   ├── preflight
│   ├── begin
│   ├── status
│   ├── checkpoint
│   └── finish
├── auth
│   ├── login
│   ├── status
│   └── logout
├── status
├── source
│   ├── discover
│   └── inspect
├── plugin
│   ├── list
│   ├── get
│   ├── upsert
│   ├── curate
│   ├── hide
│   └── restore
├── submission
│   ├── list
│   ├── get
│   └── resolve
├── report
│   ├── latest
│   └── publish
├── media
│   └── upload
└── audit
```

Community moderation and user-role administration are separate from routine plugin operations and do not appear in this default surface.

## JSON and exit codes

Successful commands return:

```json
{
  "ok": true,
  "data": {},
  "warnings": [],
  "meta": { "requestId": "..." }
}
```

Failures return one stable error:

```json
{
  "ok": false,
  "error": {
    "code": "stable_error_code",
    "message": "...",
    "retryable": false,
    "repairHint": "...",
    "details": {}
  },
  "meta": { "requestId": "..." }
}
```

Exit codes are `0` for success, warnings, and unchanged data; `1` when the command as a whole fails; and `2` when a batch contains both accepted and rejected items. Agents should branch on `code`, `retryable`, and `repairHint`, not parse prose.

Hub requests have a 30-second deadline covering both headers and the response body. `hub_edge_challenge` identifies a Cloudflare challenge response; it requires an API access or edge-rule fix, not another browser login. An unclassified `hub_http_403` means access was denied, with the rejecting layer still unknown. Preserve the error code, request ID, and available request diagnostics for investigation. A timeout on the optional aggregate `status` route alone does not prove all Hub operations are unavailable. Authentication and access failures always stop the run before further Hub writes.

## Scheduled operations

The installed package supplies its own v7 prompt, policy, command contract, and input schemas:

```bash
export DSHX_HUB_OPS_STATE_DIR='/absolute/private/operations-state'
dshx-hub capabilities --output capabilities.json
dshx-hub ops prompt --output prompt.json
dshx-hub ops begin --expect-cli-version INSTALLED_VERSION --output begin.json
```

`capabilities` reads the executing package version and enumerates the same command registry used by argument validation. Its JSON Schemas are generated from the runtime Zod validators, including the exact bilingual `plugin curate` input. Commands still enforce cross-field refinements, canonical observation IDs, and local media validation. `ops prompt` reads the version-matched bundled prompt; neither command needs a source checkout or a Hub request.

`ops begin` verifies the bundled prompt, claims one local run, validates the executing CLI version, and checks catalog access with one authenticated read. It performs no Hub writes. If preflight fails after the claim, it records the blocked result locally. Its successful `data.run` contains `runId`, `startedAt`, `stopStartingAt`, and `leaseExpiresAt`. `ops preflight` provides the same package/access check without claiming or writing a run. Successful preflight output omits token values, token prefixes, and user details.

Follow the bundled prompt with the returned run identity. The Agent owns catalog operations: proactively search public sources, judge which plugins are valuable, add them to the Hub, and improve existing information. Choose priorities, search queries, workload, and action order from current evidence; the CLI imposes no discovery quota or fixed business pipeline. Stop starting new work at the returned 50-minute cutoff and finish before the fixed 60-minute lease expires. Checkpoints do not extend that technical deadline.

Pass `--run-id RUN_ID` on every scheduled Hub write: `plugin upsert/curate/hide/restore`, `submission resolve`, `report publish`, and `media upload`. The CLI checks local ownership and expiry before issuing the operation. Standalone atomic commands remain available without a run ID; scheduled Agents must use the guard. Save a checkpoint after each confirmed stage:

```json
{
  "itemId": "github:owner/repository",
  "stage": "curated",
  "pluginId": "PLUGIN_ID",
  "requestId": "CONFIRMED_REQUEST_ID"
}
```

```bash
dshx-hub plugin curate PLUGIN_ID --if-revision 5 --input content.json --run-id RUN_ID
dshx-hub ops checkpoint --run-id RUN_ID --input checkpoint.json
dshx-hub ops status
dshx-hub report publish --input report.json --run-id RUN_ID
dshx-hub report latest
dshx-hub ops finish --run-id RUN_ID --outcome completed
```

Checkpoint stages are `inspected`, `upserted`, `curated`, `verified`, and `skipped`. Store identifiers and outcomes only. `ops status` reads local state without contacting the Hub. An active claim rejects another begin with `ops_run_active`; an expired claim is preserved as interrupted and the next begin returns prior checkpoints for recovery. Re-read the named Hub resources before resuming an uncertain write. Missing receipts do not prove that no write happened.

The claim coordinates processes using the same state directory on one machine. It is not a remote transaction or a cross-machine lock. Hub observation idempotency, immutable report IDs, and current resource revisions remain necessary. `ops finish` records a local outcome and releases the claim; it does not publish or verify a Hub report. Confirm the matching report before finishing as `completed` or `partial`. Use `blocked` if protected access is unavailable or report publication remains unconfirmed, and preserve the report input for reconciliation.

### Scheduler prompt template

Replace the three placeholders during installation, using the configured executable, persistent state directory, and verified package version:

```text
Own DSHX Hub operations: proactively search the public web, add valuable plugins, and improve missing information. Decide priorities and actions from current evidence.
Use {{CLI_PATH}} for Hub operations.
Set DSHX_HUB_OPS_STATE_DIR={{STATE_DIR}} for every command.
Run {{CLI_PATH}} ops begin --expect-cli-version {{CLI_VERSION}} once.
On failure, stop and retain the exact JSON error; ops_run_active/ops_state_busy must not start a second run.
On success, read {{CLI_PATH}} ops prompt and {{CLI_PATH}} capabilities, then follow the bundled prompt using the existing begin result.
Use its runId on every Hub write and checkpoint each confirmed item stage.
Respect stopStartingAt and leaseExpiresAt. Verify the Hub report before ops finish; finish blocked if access or report confirmation is unavailable.
Do not reinstall the CLI, inspect Git checkouts, parse help, scan processes, or reconstruct the environment during a run.
```

The external scheduler is still responsible for starting and keeping the Agent task alive. A scheduler-level `interrupted` result before any CLI invocation leaves no CLI execution to recover and needs investigation in the runner. These commands do not repair that execution failure.

## Discover and inspect public sources

`source discover` searches only GitHub or npm public metadata and returns normalized leads with pagination. It neither downloads nor executes packages:

```bash
dshx-hub source discover --provider github --query '"dsh.bundle.patch"' --since 2026-08-24 --limit 50
dshx-hub source discover --provider npm --query 'deepseek-harness plugin' --since 2026-08-24
```

`source inspect` accepts canonical shorthand and public URLs:

```bash
dshx-hub source inspect github:owner/repository
dshx-hub source inspect npm:package-name
dshx-hub source inspect https://github.com/owner/repository
dshx-hub source inspect https://www.npmjs.com/package/package-name
```

It normalizes GitHub and npm facts, discovers bounded workspace packages, proposes installation targets, and emits one or more `PluginObservationV1` values. Evidence signals remain attached for Agent decisions, but `confirmed` and `candidate` are no longer product states or publication gates.

Inspection uses public metadata endpoints. It does not install dependencies, execute package scripts, start DSH, test plugin behavior, or clone an entire repository by default. Workspace discovery is capped; a capped result reports `truncated: true`.

Write the complete success envelope to a file or pipe it directly into `plugin upsert`:

```bash
dshx-hub source inspect https://github.com/foo/bar --output /tmp/plugin.json
dshx-hub plugin upsert --input /tmp/plugin.json

dshx-hub source inspect npm:foo \
  | dshx-hub plugin upsert --input -
```

`plugin upsert` accepts an inspect envelope, one observation, an observation array, or a batch document. The CLI derives the observation ID; callers do not provide a separate write key. Repeating the same observation returns `unchanged`. Use `--dry-run` to receive a field-level diff without changing Hub data.

Large batches use bounded requests. If a later request fails, the failure preserves the original error and `details.batchProgress`: `completedResults` and `completedRequestIds` are confirmed receipts, `uncertainObservationIds` need reconciliation, and `notAttemptedObservationIds` were not sent. Inspect each result status; an overall exit code of `1` does not imply zero writes. Re-read uncertain observations or reuse their existing observation IDs before retrying, and do not resend confirmed chunks unnecessarily.

## Query and curate plugins

Use `plugin list` filters as independent query dimensions:

```bash
dshx-hub plugin list --state draft --needs content --source github --limit 20
dshx-hub plugin list --needs readme --needs publisher --all
dshx-hub plugin list --risk repository-archived --observed-before 2026-08-01
dshx-hub plugin list --needs refresh --all
```

`needs` values are computed by the server; they are not stored tasks. README and publisher needs keep older records eligible for source-profile backfill, while content becomes needed again whenever a stored README hash no longer matches the curation. `plugin get <id-or-slug>` returns the full operational projection, including source observations, the original README, public publisher facts, curated content, visibility, risk signals, revision, and recent audit information.

Curated copy is deliberately separate from observed facts:

```bash
dshx-hub plugin get PLUGIN_ID
dshx-hub plugin curate PLUGIN_ID --if-revision 5 --input content.json
```

`plugin curate` can update localized display names, descriptions, overviews, categories, tags, `derivedFrom`, and `sourceReadmeHash`. The hash records which exact original README the bilingual overview summarizes; a README change reopens the content need. Curation cannot change versions, metrics, source URLs, repository state, installation facts, publisher facts, the original README, or observation timestamps. On `revision_conflict`, fetch the current plugin, merge the intended content, and retry with the new revision.

Visibility changes are explicit and audited:

```bash
dshx-hub plugin hide PLUGIN_ID --reason "dangerous installation target"
dshx-hub plugin restore PLUGIN_ID --reason "identity corrected"
```

Missing translations, unknown compatibility, stale sources, or absent metrics are risk signals and do not hide a plugin automatically.

## Daily reports

```bash
dshx-hub report latest
dshx-hub report publish --input report.json
```

Reports use an immutable UUID `runId`, ISO start/completion times, `outcome=completed|partial`, and English/Chinese plain-text bodies of at most 10,000 characters each. Identical retries are idempotent; conflicting content for one `runId` is rejected.

## Submissions, media, and audit

Submission operations are independently retryable:

```bash
dshx-hub submission list --status queued
dshx-hub submission get SUBMISSION_ID
dshx-hub submission resolve SUBMISSION_ID --result accepted --plugin PLUGIN_ID
dshx-hub submission resolve SUBMISSION_ID --result ignored --reason "not a DSH plugin"
```

Upload validated plugin media with:

```bash
dshx-hub media upload PLUGIN_ID --input media.json
```

The metadata keeps MIME type, byte size, dimensions, hash, Alt text, and plugin identity. Media writes are not tied to any other plugin operation.

Use the read-only aggregate commands to decide what to do next:

```bash
dshx-hub status
dshx-hub audit --scope catalog
dshx-hub audit --scope storage
dshx-hub audit --scope community
```

`status`, `plugin list`, and `audit` report current facts and anomalies without prescribing the next command. The examples above are possible compositions, not a required state machine.

Use `capabilities` for machine-readable inputs and `dshx-hub <command> --help` for human-readable usage.

## Build from source

```bash
pnpm --dir packages/framework-hub-cli build
```

Source builds require the sibling private `packages/hub-ops-prompt` workspace package. The build compiles that package and embeds its matching prompt, policy, and command contract into `dist/ops-prompt.json`, checking the prompt version and registered commands. Published CLI packages include this JSON in the tarball; operating machines do not need the private package, a Git checkout, or a prompt build at runtime.

MIT © DSHX contributors.
