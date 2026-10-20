---
"@becomeopc/dshx-hub-cli": minor
---

Move the Hub operations prompt out of the public CLI. Administrators preview the bootstrap and configure allowlisted resources at `/admin/agent-prompt`; the operations Agent fetches the latest prompt, metadata, and resources with `dshx-hub ops bundle --output FILE` using an administrator CLI token. The public CLI no longer bundles the prompt or exposes `ops prompt`. The bootstrap uses the stable `preview` channel and converges through `agent_bundle_mismatch.details.expectedCliVersion`, so the Agent can pick up a new CLI and prompt on the next run without re-copying the bootstrap. Resources are stored encrypted in D1 and never printed; the bundle file is written with mode 0600. CI checks the Hub snapshot and release verification rejects any public CLI tarball that contains prompt files.
