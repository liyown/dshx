# DSHX Hub Operations Prompt

Private workspace package for the versioned DSHX Hub daily operations contract. It centralizes the Agent prompt, operating policy, GitHub/npm discovery queries, bilingual plain-text report template, and simulation fixtures.

This package is not published to npm and does not schedule or run daily operations. An external Agent runner loads the prompt and invokes the atomic `dshx-hub` CLI commands.

## Exports

```ts
import {
  dailyDiscoveryQueries,
  dailyOperationsPolicy,
  dailyOperationsScenarios,
  dailyReportTemplate,
  loadDailyOperationsPrompt,
} from "@becomeopc/dshx-hub-ops-prompt";
```

- `loadDailyOperationsPrompt()` returns the deterministic v4 prompt used for a complete daily run.
- `dailyOperationsPolicy` records limits, lifecycle and admission rules, provenance constraints, and failure behavior.
- `dailyDiscoveryQueries` contains the versioned GitHub and npm query matrix.
- `dailyReportTemplate` defines the immutable bilingual plain-text report shape and fixed sections.
- `dailyOperationsScenarios` provides fixtures for full mock-Hub simulations.

The package also exports `dailyOperationsPromptVersion`, `dailyOperationsCommandContract`, `dailyOperationsApiContract`, and `dailyReportSections` so contract-drift tests can compare the prompt with the CLI and Hub API.

## Daily run

The prompt executes the following bounded sequence:

1. Process queued submissions, storing the original README and public publisher profile before completing sourced bilingual curation.
2. Repair existing plugins that still need an original README, public publisher/avatar, exact installation target, or sourced bilingual content.
3. Refresh stale existing plugin observations when no completeness backlog remains.
4. Discover public GitHub and npm sources from the previous report boundary with a 72-hour overlap only when higher-priority work leaves batch capacity.
5. Read catalog, storage, and community audit findings.
6. Publish one immutable English/Chinese report.

A run processes 5 to 10 canonical items when enough eligible work exists and stops starting new work after 90 minutes or 10 items. It begins with 5 items and expands toward 10 only when completed quality gates and remaining time allow another item to finish fully. One item may be retried once. Independent source failures are skipped and produce a `partial` report while the Hub remains available; Hub authentication failure or unavailability stops the run.

When completeness debt exists, the Agent uses all 5 to 10 item slots for incomplete plugins and performs no proactive discovery. A submission is accepted only after a final read proves that README, publisher, target, and content needs are all cleared. Reaching 10 fully completed items is a normal completed run even if unselected backlog remains.

The Agent preserves the original README as source evidence, records its content hash, and refreshes English/Chinese curation when that hash changes. It may translate and summarize public metadata with `derivedFrom` citations, but generic catalog placeholders are incomplete. It never installs or executes third-party plugins and never claims that Hub has verified security, compatibility, or operability.

## Development

```sh
pnpm --dir packages/hub-ops-prompt typecheck
pnpm --dir packages/hub-ops-prompt test
pnpm --dir packages/hub-ops-prompt build
pnpm --dir packages/hub-ops-prompt lint
```

When an atomic CLI command, report API field, plugin lifecycle, discovery policy, or report rule changes, update the corresponding versioned contract, prompt, and simulation scenario in the same change. The tests intentionally compare these surfaces to make omissions visible.
