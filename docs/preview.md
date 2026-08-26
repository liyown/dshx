# DSHX Preview

The first usable DSHX release is published through the npm `preview` dist-tag. It is intended for real out-of-tree plugin authoring and Profile validation, while the project continues to gather compatibility evidence before promoting the same line to `latest`.

## Packages in the first Preview

| Package                              | Planned first Preview | Purpose                                       |
| ------------------------------------ | --------------------- | --------------------------------------------- |
| `@becomeopc/dshx`                    | `0.1.4-preview.0`     | Authoring APIs, checks, build, dev, and tools |
| `create-dshx`                        | `0.1.4-preview.0`     | Starter and showcase project generation       |
| `@becomeopc/dshx-plugin-marketplace` | `0.1.0-preview.0`     | Self-hosted reference plugin and installer UI |

Use the tag, not a floating untagged version:

```bash
pnpm create dshx@preview my-plugin
pnpm add -D @becomeopc/dshx@preview
dsh plugin --profile web add @becomeopc/dshx-plugin-marketplace@preview
```

The existing `latest` releases remain unchanged until an explicit stable-promotion decision. A Preview consumer should commit its lockfile so a working toolchain can be reproduced.

## Verified runtime boundary

The current `protocol-1` adapter publishes the npm-safe peer range `@deepseek-ai/dsh >=0.1.0-rc.8 <0.2.0-0 || 0.1.1-rc.2`. Real-runtime smoke evidence covers the minimum `0.1.0-rc.8` and latest verified `0.1.1-rc.2` boundaries. The explicit rc.2 arm prevents package-manager prerelease exclusion; a version that merely falls inside the protocol range can still be compatible or experimental rather than verified.

Run the offline and runtime checks separately:

```bash
pnpm check
pnpm exec dshx check --runtime
pnpm dev -- --port 0
```

The development command launches a real DSH Profile. Client changes flow through official HMR; successful Host rebuilds restart the Host automatically unless the project selects manual restart policy.

## Preview limits

- The authoring surface is an API Candidate, not a 1.0 stability guarantee. Preview changes include a Changeset and migration guidance when they break an earlier `0.1.x` shape.
- Conversation Components and programmatic Tooling remain Experimental.
- Compatibility evidence is limited to the declared protocol adapter and its recorded DSH boundaries. Direct native DSH calls remain the plugin author's responsibility.
- Framework Hub publication is curated. Publishing an npm package does not automatically create or activate a Hub catalog entry.
- The marketplace installs only from a loopback DSH Web session, installs one verified primary target at a time, and requires a Profile restart. It does not provide details, search, uninstall, upgrade, or automatic restart in this Preview.
- Package publication is a local, npm-2FA operation. The repository CI does not hold npm credentials and does not create GitHub Releases.

Report a reproducible issue with the DSHX version, installed DSH version, package manager and lockfile, `dshx check --json` output, and whether the failure occurred offline, during build, or in a real Profile. Remove local paths or secrets before sharing logs.

See [Compatibility](./compatibility.md), [Client and Locale](./guides/client.md), and [Publishing](./guides/publishing.md) for the corresponding contracts and gates.
