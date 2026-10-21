# Framework Hub Operations API

The Operations API is the authoritative write boundary for Agent-maintained Hub data. Clients collect and normalize public facts; the API resolves identity, applies source precedence, enforces revisions and permissions, commits each mutation atomically, and records audit history.

## Operations agent prompt

The full Agent prompt is administrator-only. An administrator previews it at `https://dshx.io/admin/agent-prompt`, configures allowlisted resources (currently `GITHUB_TOKEN`), and gives the short bootstrap prompt to the operations Agent. The Agent fetches the latest prompt, version metadata, and resources with an administrator CLI token:

```bash
dshx-hub ops bundle --output /absolute/private/path/agent-bundle.json
```

The bundle response is `no-store`, requires an administrator role on the CLI token, and is written to a `0600` file; resource values are never printed. Resource values are encrypted with AES-GCM before D1 storage using the Worker secret `AGENT_RESOURCE_KEY` (32 bytes, base64). The Agent follows the bundle's `prompt` and sets `bundle.resources` as environment variables for the run.

The Hub snapshot is generated from the private prompt package at release time and checked for drift in CI. The public CLI package does not contain the prompt text.

## Resource model

- A plugin projection combines stable identity, source observations, normalized facts, curated content, installation targets, media, metrics, visibility, risk signals, and revision.
- An observation is a source-specific statement captured at a point in time. It can add or refresh facts but cannot overwrite curated content or restore hidden visibility.
- `needs` and risk signals are computed views. They are query dimensions, not persisted work items.
- Authentication credentials, pagination cursors, and server revisions are protocol state. The API does not require clients to preserve cross-command progress.

## Endpoints

| Method  | Path                                       | Purpose                                 |
| ------- | ------------------------------------------ | --------------------------------------- |
| `GET`   | `/api/ops/v1/status`                       | Aggregate Hub and catalog status        |
| `GET`   | `/api/ops/v1/agent-bundle`                 | Administrator-only prompt and resources |
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
| `GET`   | `/api/ops/v1/blog`                         | List blog articles including drafts     |
| `POST`  | `/api/ops/v1/blog`                         | Create a bilingual blog article         |
| `GET`   | `/api/ops/v1/blog/{slug}`                  | Read one blog article and its revision  |
| `PUT`   | `/api/ops/v1/blog/{slug}`                  | Edit, publish, or withdraw an article   |
| `GET`   | `/api/ops/v1/featured`                     | Read curated featured shelves           |
| `PUT`   | `/api/ops/v1/featured/{category}`          | Replace the ordered picks for a shelf   |
| `POST`  | `/api/ops/v1/plugins/{id}/media`           | Upload plugin media and metadata        |
| `POST`  | `/api/ops/v1/catalog-scores`               | Recompute catalog ranking signals       |
| `GET`   | `/api/ops/v1/audit`                        | Read consistency findings               |

`GET /api/operations/reports` is the unprotected public, locale-selected report feed used by `/en/operations` and `/zh/operations`. It exposes one item per `Asia/Shanghai` calendar day: `day`, the day's run count, timestamps, outcome, the latest run ID, and the selected locale's Markdown body.

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
- An unavailable README expires: once the source has not been observed for 14 days, the entry reports `needs=readme` again so an operator re-inspects it and upserts the fresh observation. The public plugin page stays out of the index and the sitemap until a README is `available`.
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

## Catalog ranking signals

The public catalog sorts thousands of plugins by a quality and a popularity score. The aggregate parts of both formulas are stored per plugin in `plugin_scores`, so listing a page does not re-run the per-plugin aggregates. Recency buckets and the requested locale's translation bonus are applied while the catalog is read, so they never need a refresh.

Scores are rewritten automatically when an observation, media upload, review, bookmark, follow, visibility change, or approval effect changes a plugin's facts. Scores that are missing — for example after an out-of-band D1 repair — are backfilled in the background on the next catalog request, and `POST /catalog-scores` forces a full recompute. A plugin with no score row still appears in the catalog using the live formula.

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

Report bodies are GitHub-Flavored Markdown and rendered without raw HTML. The public detail URL is keyed by day (`/{locale}/operations/{YYYY-MM-DD}`); old run-based URLs redirect with 301. All runs published for the same `Asia/Shanghai` day are grouped: the newest body is shown, and when it starts with `<!-- daily-report:merged -->` the earlier same-day bodies are hidden because the newest report is cumulative. Without the marker, earlier bodies appear in a collapsed section so no work is lost. Reports must not contain credentials, email addresses, private addresses, local paths, raw stack traces, raw HTML, images, or internal audit payloads.

## Blog articles

`/api/ops/v1/blog` manages the bilingual editorial blog. A `POST` creates one article; a `PUT` edits, publishes, or withdraws it. Both require the `catalog:write` scope.

- `slug` is unique, lower-case kebab-case, and immutable after creation.
- `status` is `draft` or `published`; a published article cannot use a future `publishedAt`.
- `content.en` and `content.zh` are required and contain sections with `paragraph`, `list`, `code`, or `quote` blocks. Section IDs are unique per locale, and the serialized content must stay within 250 KB.
- `relatedPluginSlugs` stores at most eight unique, existing plugin slugs in display order; an unknown slug returns `422 blog_plugin_not_found`.
- Updates require `ifRevision`; a stale revision returns `409 revision_conflict` with the current article as the repair target. A duplicate create returns `409 blog_slug_conflict`.
- Public `/en/blog` and `/zh/blog` list only published articles whose `publishedAt` is today or earlier. Draft reads and writes require the bearer token.
- Creating or updating an article invalidates the blog sitemap cache. The administrator editor at `/admin/blog` uses the session-authenticated `/api/admin/blog` endpoints, which expose the same article contract.

## Featured shelves

`/featured` is curated per category and is separate from the derived `plugins.featured` quality flag.

- `PUT /api/ops/v1/featured/{category}` replaces the entire shelf for one category with the supplied `pluginSlugs` array, preserving array order. At most 24 unique slugs are accepted; an empty array clears the shelf.
- An unknown category returns `404 featured_category_not_found`; an unknown plugin slug returns `422 featured_plugin_not_found` with the missing slugs.
- `GET /api/ops/v1/featured` returns only categories that have picks, including each pick's status and lifecycle status so operators can see non-public selections. The public page renders published plugins only.
- Migration `0013` creates the blog tables and seeds up to four published picks per active category. Apply it with `pnpm db:migrate:remote` before deploying a Hub build that serves these routes.
