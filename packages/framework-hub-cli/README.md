# @becomeopc/dshx-hub-cli

Stateless, JSON-first operations client for the [DSHX Framework Hub](https://dshx.io). It gives Agents small domain operations they can inspect, combine, and retry independently while the Hub owns validation, merging, concurrency, visibility, and audit history.

## Install

```bash
pnpm add -g @becomeopc/dshx-hub-cli
dshx-hub --help
```

Authentication tokens are the only local operational state. Resource revisions, plugin data, source observations, and audit records live in the Hub. `--all` may follow pagination cursors while the current process is active, but the CLI does not save progress or require a fixed command order.

## Command surface

```text
dshx-hub
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

Use `dshx-hub <command> --help` for the exact input, output, write, and retry contract of a command.

MIT © DSHX contributors.
