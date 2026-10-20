# @becomeopc/dshx-hub-cli

## 0.1.3-preview.0

### Minor Changes

- Move the Hub operations prompt out of the public CLI. Administrators preview the bootstrap and configure allowlisted resources at `/admin/agent-prompt`; the operations Agent fetches the latest prompt, metadata, and resources with `dshx-hub ops bundle --output FILE` using an administrator CLI token. The public CLI no longer bundles the prompt or exposes `ops prompt`. The bootstrap uses the stable `preview` channel and converges through `agent_bundle_mismatch.details.expectedCliVersion`, so the Agent can pick up a new CLI and prompt on the next run without re-copying the bootstrap. Resources are stored encrypted in D1 and never printed; the bundle file is written with mode 0600. CI checks the Hub snapshot and release verification rejects any public CLI tarball that contains prompt files.

## 0.1.2-preview.5

### Patch Changes

- Ship machine-readable input contracts and the v7 operator guidance with the CLI. Let the Agent choose research, discovery, and catalog improvements without fixed quotas or a business workflow. Add credential preflight checks, local run ownership and durable checkpoints, distinguish edge challenges from authentication failures, and preserve confirmed progress when a batch is interrupted.

## 0.1.2-preview.4

### Patch Changes

- Verify Keychain persistence after login and use an atomic `0600` operations-state credential fallback when a headless macOS session silently drops Keychain writes.

## 0.1.2-preview.3

### Patch Changes

- Publish registry-resolvable runtime dependency versions so the standalone CLI can be installed outside the pnpm workspace.

## 0.1.2-preview.2

### Patch Changes

- Bound Hub API requests to 30 seconds and report `hub_request_timeout` instead of hanging an operations run indefinitely.

## 0.1.2-preview.1

### Patch Changes

- a148391: Reject removed workflow command groups before parsing their legacy options so saved commands receive the stable `deprecated_command` repair response without making a Hub request.

## 0.1.2-preview.0

### Patch Changes

- 4c2a7f5: Replace the Preview catalog workflow commands with stateless Hub operations, public GitHub and npm source inspection, observation upserts, revisioned curation, explicit visibility, submissions, media, audit, stable envelopes, and partial-failure exit codes.

## 0.1.1

### Patch Changes

- 586ff4e: Add the Hub community and approval operations contract, approval-aware CLI workflows, and a real DSH loader/HMR release gate while preserving the runtime-thin framework boundary.
