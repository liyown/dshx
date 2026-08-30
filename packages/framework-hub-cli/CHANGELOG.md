# @becomeopc/dshx-hub-cli

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
