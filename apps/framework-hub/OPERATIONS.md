# Framework Hub Operations API

The Operations API is the authoritative write boundary for Agent-maintained Hub data. Clients collect and normalize public facts; the API resolves identity, applies source precedence, enforces revisions and permissions, commits each mutation atomically, and records audit history.

## Resource model

- A plugin projection combines stable identity, source observations, normalized facts, curated content, installation targets, media, metrics, visibility, risk signals, and revision.
- An observation is a source-specific statement captured at a point in time. It can add or refresh facts but cannot overwrite curated content or restore hidden visibility.
- `needs` and risk signals are computed views. They are query dimensions, not persisted work items.
- Authentication credentials, pagination cursors, and server revisions are protocol state. The API does not require clients to preserve cross-command progress.

## Endpoints

| Method  | Path                                       | Purpose                                 |
| ------- | ------------------------------------------ | --------------------------------------- |
| `GET`   | `/api/ops/v1/status`                       | Aggregate Hub and catalog status        |
| `GET`   | `/api/ops/v1/plugins`                      | Filtered, cursor-paginated plugin list  |
| `GET`   | `/api/ops/v1/plugins/{id}`                 | Complete operational plugin projection  |
| `PUT`   | `/api/ops/v1/observations/{observationId}` | Upsert one observation                  |
| `POST`  | `/api/ops/v1/observations:batch`           | Upsert observations independently       |
| `PATCH` | `/api/ops/v1/plugins/{id}/curation`        | Update curated content with a revision  |
| `PUT`   | `/api/ops/v1/plugins/{id}/visibility`      | Hide or restore public visibility       |
| `GET`   | `/api/ops/v1/submissions`                  | List submissions                        |
| `GET`   | `/api/ops/v1/submissions/{id}`             | Read one submission                     |
| `PUT`   | `/api/ops/v1/submissions/{id}/resolution`  | Resolve a submission                    |
| `GET`   | `/api/ops/v1/reports`                      | Read the latest operations report       |
| `POST`  | `/api/ops/v1/reports`                      | Publish one immutable operations report |
| `POST`  | `/api/ops/v1/plugins/{id}/media`           | Upload plugin media and metadata        |
| `GET`   | `/api/ops/v1/audit`                        | Read consistency findings               |

`GET /api/operations/reports` is the unprotected public, locale-selected report feed used by `/en/operations` and `/zh/operations`. It exposes only `runId`, timestamps, outcome, and the selected plain-text body.

Protected endpoints authenticate a bearer token and authorize the smallest scope required by the operation. Identity and permission decisions are always server-side.

## Response envelope

Every successful response uses:

```json
{
  "ok": true,
  "data": {},
  "warnings": [],
  "meta": {
    "requestId": "..."
  }
}
```

Every failed response uses:

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
  "meta": {
    "requestId": "..."
  }
}
```

`code`, `retryable`, and `repairHint` are the machine decision surface. `message` is explanatory text and must not be the only way to distinguish failures.

## Status and queries

`GET /status` aggregates Hub reachability/version, authentication/scopes, plugin state counts, computed catalog needs, source failures, and queued submissions. It reports current state only; it does not return a suggested command or required action.

`GET /plugins` supports composable filters:

- `state=draft|published|hidden`
- `needs=refresh|content|metadata|source|target|readme|publisher`
- `source=npm|github`
- `risk=repository-archived|package-deprecated|install-target-unavailable|identity-conflict`
- `observedBefore`, `updatedBefore`, `limit`, and `cursor`

The response contains concise plugin summaries plus `nextCursor`. A client may follow cursors in memory, but cursors do not imply a durable task.

`GET /plugins/{id}` returns source timestamps, package and repository facts, installation targets, compatibility declarations, metrics, curated content, visibility, computed risk signals, revision, and recent audit entries.

## PluginObservationV1

Only these fields are required:

```text
schemaVersion
observationId
observedAt
identity
source
```

`identity` is either an npm package name or a GitHub repository identity plus subdirectory. `source` records kind, URL, optional immutable ref/etag/content hash, and availability. Detection signals, package facts, repository facts, original README facts, public GitHub publisher identity/avatar facts, installation targets, compatibility declarations, and metrics are optional. A README fact records `available|unavailable`; available documents retain the exact Markdown, source URL/ref/path, and SHA-256 content hash without translation or truncation. Legacy `detection.status=confirmed|candidate` input is accepted and discarded; it is not a product state or publication gate.

The CLI derives `observationId` from canonical identity, source URL, ref, and etag or content hash. The path ID and body ID must match. Repeating the same observation returns `unchanged`; accepted additional material may return `updated`; the first accepted write returns `created`.

### Merge rules

- A present incoming field may update the corresponding source-owned fact.
- A missing incoming field preserves the existing value.
- An older observation does not overwrite a newer value from the same source tier.
- An unavailable source changes only that source's availability and observation time.
- Observations never overwrite curated content.
- A current README is projected into `plugin_source_documents`; immutable observation payloads retain its source history.
- GitHub publisher facts upsert the publisher profile and attach its public avatar to the plugin and repository.
- Observations never restore hidden visibility.

Published package facts use this precedence:

```text
npm published manifest > npm registry > GitHub release or tag > GitHub default branch
```

Content inputs use:

```text
package manifest > README > repository description > Agent-derived content
```

Conflicting identities remain visible as an explainable risk signal; the API does not silently merge them.

## Batch writes

`POST /observations:batch` validates and commits each item independently. One rejected item does not roll back accepted siblings:

```json
{
  "ok": true,
  "data": {
    "results": [
      { "identity": "npm:a", "status": "created" },
      { "identity": "npm:b", "status": "unchanged" },
      {
        "identity": "npm:c",
        "status": "rejected",
        "error": { "code": "invalid_source", "retryable": false }
      }
    ]
  },
  "warnings": [],
  "meta": { "requestId": "..." }
}
```

The HTTP request succeeds when the batch was processed, even if some items were rejected. Clients surface that distinction with their partial-failure exit code.

## Curation and revisions

`PATCH /plugins/{id}/curation` accepts localized display names, short descriptions, overview Markdown, categories, tags, `derivedFrom`, and `sourceReadmeHash`. When an original README is available, its current hash must match before a draft is publication-complete; a later README change adds `needs=content` until the bilingual overview is refreshed. Source-owned versions, metrics, repository URLs/state, publisher facts, original README content, installation facts, and observation timestamps are rejected as invalid curation fields.

Clients may send the last-read revision as a precondition. A stale value returns:

```json
{
  "ok": false,
  "error": {
    "code": "revision_conflict",
    "message": "Plugin content changed after it was read.",
    "retryable": true,
    "repairHint": "Fetch the plugin, merge the current content, and retry."
  },
  "meta": { "requestId": "..." }
}
```

A successful content or visibility mutation increments the resource revision and appends an audit entry. A new plugin starts as `draft`; curation automatically publishes it when identity, name, version, an available source, one exact safe primary target, bilingual names/descriptions/overviews, a category, and `derivedFrom` are all present. Ordinary risk and legacy verification do not block publication.

## Visibility, submissions, media, and audit

Visibility accepts an explicit `hidden` or `visible` state and a reason. Temporary source failures, missing translations, absent metrics, unknown compatibility, or inactivity do not change visibility automatically. Hiding is reserved for a wrong plugin identity, malicious content, dangerous installation target, or a documented compliance decision.

A submission resolution is one of:

- `accepted` with the resulting plugin ID;
- `duplicate` with the existing plugin ID;
- `ignored` with a reason.

Media upload validates MIME type, byte size, dimensions, content hash, Alt text, and plugin identity before storing metadata and content. It is an independent plugin mutation.

`GET /audit?scope=catalog|storage|community` is read-only. Findings cover duplicate identities, orphaned sources, invalid URLs, broken media references, missing search entries, stale source observations, suspicious installation targets, and invalid data relationships. The endpoint reports evidence and does not repair data automatically.

## Daily operations reports

`POST /reports` accepts `runId`, `startedAt`, `completedAt`, `outcome=completed|partial`, and `body.en/body.zh` (maximum 10,000 characters each). A `runId` with identical content is an idempotent success; different content returns `idempotency_conflict`. Reports cannot be updated. Each insert atomically prunes the oldest rows by `completedAt, runId`, keeping at most 1,000 globally.

Public report bodies are rendered as plain text. They must not contain credentials, email addresses, private addresses, local paths, raw stack traces, or internal audit payloads.
