# DSHX Hub Operations Prompt

Private workspace package for the v7 DSHX Hub operator mandate. The Agent is responsible for making the website useful, accurate, and fresh through active research, discovery and admission of new plugins, and improvements to existing entries. It decides what deserves attention, how to investigate it, and how much useful work to undertake. The CLI supplies tools and reliable receipts.

This package does not schedule or execute the Agent. The CLI build bundles the prompt, policy, and command reference into `dist/ops-prompt.json`; operating machines read it through `dshx-hub ops prompt` without needing this private package or a Git checkout.

## Editorial autonomy

The Agent actively uses public web search, web pages, GitHub, npm, official documentation, release notes, and community leads. It follows and verifies promising evidence, adjusts its search strategy, and chooses priorities based on value to the website's users. It does not wait for submissions or limit itself to clearing existing backlog.

There are no fixed item quotas, maintenance/discovery ratios, required providers per run, or required business stages. Bundled search queries are optional inspiration; `source discover` is one research tool, not the only route to finding a plugin. Hub status, lists, reports, and audits are available when relevant. An unchanged non-retryable entry should not monopolize successive runs when more useful work exists.

Publication quality remains required: original source evidence, canonical identity, accurate installation facts, useful bilingual content and citations, and verification of the resulting entry. The Agent chooses the operations needed for each change. It never invents facts, executes third-party plugin code, or claims that Hub verified safety, compatibility, or operability. Existing end-user installation warnings and confirmation rules remain in the product policy; they are not an Agent research workflow.

## Tool constraints

Use the configured executable and explicit `DSHX_HUB_OPS_STATE_DIR`. `ops begin` performs preflight and establishes a local run; `capabilities` exposes the real command registry and input schemas. Every Hub write uses `--run-id`, current revisions where applicable, and observation idempotency. Useful `ops checkpoint` receipts let later runs reconcile unfinished work against current Hub state. The local claim covers one machine and state directory, not cross-machine concurrency.

The returned `stopStartingAt` and `leaseExpiresAt` remain technical limits: stop opening new items at 50 minutes and finish verification/reporting before 60 minutes. Checkpoints cannot extend the lease. These limits do not prescribe an item count, strategy, or business sequence. Retry decisions consider the error, backoff, uncertainty, and remaining time.

Access failures stop Hub writes. Retain the real code/request ID, distinguish Cloudflare challenges from unknown-origin 403 responses, and preserve partial batch receipts. A missing response is not proof of zero writes. A scheduler interruption before any CLI invocation still requires runner diagnostics.

## Reporting

The Agent chooses a concise structure explaining actual priorities, useful findings, evidence, confirmed changes, and material unfinished work. Section labels are optional suggestions; reports do not need empty sections or a tally for every type of activity. Research, rejected leads, attempted writes, and confirmed admissions must remain distinguishable. Zero writes can be an honest outcome, while publishing a report alone does not prove website improvement.

The API remains compatible: immutable `runId`, ISO `startedAt`/`completedAt`, `outcome=completed|partial`, and English/Chinese plain-text `body.en`/`body.zh`, each at most 10,000 characters. Preserve identical input for idempotent retries, re-read the matching stored report, then `ops finish completed/partial`. Use local `blocked` when access or publication confirmation is unavailable. Local completion is not report publication. Exclude secrets and private operational details.

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

- `loadDailyOperationsPrompt()` returns the deterministic v7 operator mandate.
- `dailyOperationsPolicy` describes editorial autonomy, research, provenance, publication quality, tool constraints, and reporting.
- `dailyDiscoveryQueries` contains optional GitHub/npm search examples.
- `dailyReportTemplate` preserves the API shape and offers optional organization ideas.
- `dailyOperationsScenarios` illustrates editorial decisions and tool constraints, not mandatory execution sequences.

Existing export names remain for compatibility. `dailyOperationsPromptVersion`, `dailyOperationsCommandContract`, `dailyOperationsApiContract`, and `dailyReportSections` are also exported. The command reference applies to CLI operations; it does not restrict external public research tools. Obsolete `runLimits`, `workflow`, `workAllocation`, and `itemAccounting` policy fields are removed.

## Development

```sh
pnpm --dir packages/hub-ops-prompt typecheck
pnpm --dir packages/hub-ops-prompt test
pnpm --dir packages/hub-ops-prompt build
pnpm --dir packages/hub-ops-prompt lint
```

Tests protect editorial autonomy, supported CLI calls, evidence requirements, the local lease, and the stable report API. They do not prescribe a research order or establish that a live Agent completed useful work. The CLI source build requires this sibling package and checks bundled prompt version and command availability; published CLI tarballs carry the resulting JSON without a runtime dependency on the private package.
