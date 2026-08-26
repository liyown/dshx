# @becomeopc/dshx-hub-cli

Deterministic local verification and privileged operations client for the [DSHX Framework Hub](https://dshx.io).

## Install

```bash
pnpm add -g @becomeopc/dshx-hub-cli
dshx-hub --help
```

The CLI is JSON-first and designed for repeatable human or agent-operated workflows:

- validate plugin evidence and complete catalog pages locally;
- stage, preview, resume, commit, or abort catalog synchronization runs;
- submit sourced metrics, target verification, and media;
- process moderation and approval work through explicit effects;
- authenticate through browser PKCE and store tokens only in the system keyring.

Local verification never runs third-party package scripts. Privileged writes require an authenticated Hub token and preserve idempotency, approval, and recovery boundaries.

The artifact path passed to `catalog verify` is input-only. Its attestation records the safe archive basename and byte count as `artifact.size.observed.file` and `bytes`; it never retains the local directory or absolute path. When assembling `CatalogProposalV2`, copy `attestation.checks` unchanged into `repositoryPackage.checks` so local validation and Hub promotion verify the same evidence.

```bash
dshx-hub auth login --hub https://dshx.io
dshx-hub catalog verify --input evidence.json --output verified.json
dshx-hub catalog check --input proposals.json
dshx-hub catalog inventory --all --output inventory.json
```

Run `dshx-hub help` or `dshx-hub <group> --help` for command-specific input, output, write, and recovery contracts.

MIT © DSHX contributors.
