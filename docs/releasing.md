# Releasing the first DSHX Preview

The first public Preview is a coordinated, local npm-2FA release. GitHub may open the Changesets version pull request, but it has no npm token, does not publish packages, does not push package tags, and does not create a GitHub Release. Framework Hub deployment is a separate, Cloudflare-authenticated operation.

## Target and channel

| Package                              | First Preview target | npm tag   |
| ------------------------------------ | -------------------- | --------- |
| `@becomeopc/dshx`                    | `0.2.0-preview.0`    | `preview` |
| `create-dshx`                        | `0.2.0-preview.0`    | `preview` |
| `@becomeopc/dshx-hub-cli`            | `0.1.3-preview.0`    | `preview` |
| `@becomeopc/dshx-plugin-marketplace` | `0.2.0-preview.0`    | `preview` |

Core and Creator are a fixed Changesets group and must share a version. The DSH-facing packages move to the `0.2.x` line together with `protocol-2`; use `minor` for breaking changes and `patch` for compatible fixes. Marketplace versions with that line so its supported DSH range matches the reference plugin. Hub CLI versions independently and its pending `agent-prompt` minor changeset produces `0.1.3-preview.0`.

The existing npm `latest` channel remains untouched. Do not create an aggregate `v0.2.0` tag or GitHub Release for this Preview; Changesets creates package-scoped local tags only for packages it actually publishes.

## 1. Freeze the release inputs

Finish code, documentation, Skill, migration notes, and every final changeset before entering pre mode. Confirm the intended stable-bump plan without consuming changesets:

```bash
pnpm install --frozen-lockfile
pnpm version:check
pnpm changeset status
```

At this point the expected ordinary plan is Core/Creator `0.2.0`, Hub CLI `0.1.3`, and Marketplace `0.2.0`. Do not run `version-packages` early: it moves consumed changeset files under `.changeset/pre/` and rewrites package versions and changelogs.

## 2. Enter Preview pre mode and version

Only after the release inputs are final:

```bash
pnpm preview:enter
pnpm version-packages
```

Review and commit `.changeset/pre.json`, package manifests, lockfile, changelogs, and the moved changeset files under `.changeset/pre/`. The resulting versions must be Core/Creator `0.2.0-preview.0`, Hub CLI `0.1.3-preview.0`, and Marketplace `0.2.0-preview.0`.

When the Hub CLI version or prompt content changes, regenerate and commit the Hub's copy of the version-pinned operator prompt in the same version commit:

```bash
pnpm hub:prompt:generate
```

This writes `apps/framework-hub/src/lib/generated/agent-prompt.json` and `agent-prompt-meta.json` from the freshly built CLI. CI rejects a stale snapshot with `pnpm hub:prompt:check`.

The serialized `release.yml` workflow refuses to create a stable version PR while `.changeset/pre.json` is absent, and only runs Changesets Action for `mode: pre` with `tag: preview`. It has repository write permission only. If the pre-state/version commit is prepared locally, the Action should find no additional version work; if pre mode is committed before versioning, it may open the corresponding Preview version PR.

Do not run `changeset pre exit` for this release. Exiting pre mode is a later, explicit stable-promotion decision.

## 3. Run the complete gates

Start from a clean, current `main` on a trusted development machine:

```bash
pnpm install --frozen-lockfile
DSH_SOURCE_ROOT=/path/to/deepseek-harness pnpm check:all
pnpm release:plan
pnpm release:preview:check
```

`check:all` includes lint, formatting, dependency and production-audit checks, Core/Creator/Marketplace tests and builds, Hub checks, generalized public-package tarball smoke, the latest verified real-DSH smoke, and the marketplace self-bootstrap smoke. `DSH_SOURCE_ROOT` makes that real-DSH smoke use the built source checkout and protects the recorded `protocol-2` boundary. Without it the smoke installs npm `0.2.1-rc.2`, which still contains stale profile-boot code; that npm artifact remains unverified and the smoke fails until upstream republishes it.

`release:preview:check` is intentionally stricter than a build: it requires clean `main`, the exact four Preview version shapes, public package metadata, `pre.json` in Preview mode, and a non-empty Changesets `publish-plan` containing only recognized packages with `tag: preview`. One exception is reported instead of failing: the Marketplace package has no stable registry version, so Changesets plans it for `latest`. The release command handles that package separately (below). `--strict` removes the exception and is used again after the Marketplace publish. Already-published Preview versions are correctly absent from an incremental plan; the remaining atomic Changesets release therefore contains only `@becomeopc/dshx-hub-cli` once Core, Creator, and Marketplace are current. The check must fail before pre mode or from a dirty worktree.

Changesets v3.0.1 rejects an explicit `changeset publish --tag preview` while pre mode is active. `pnpm release:preview` therefore runs in two phases: it first publishes `@becomeopc/dshx-plugin-marketplace` with `pnpm publish --tag preview` (the only safe way to keep it off `latest`), verifies its dist-tags, then reruns the plan check with `--strict` and invokes bare `changeset publish` for the remaining packages. The strict publish plan is the authoritative proof that npm receives the `preview` tag. The ordinary `pnpm release` alias calls this same guarded command and cannot select `latest`.

## 4. Deploy the endpoint, publish, and promote the catalog

Perform external operations only with explicit authorization and authenticated accounts. The operator prompt pins the published Hub CLI version, so publish the CLI and verify its prompt bytes before deploying the Hub:

1. Confirm npm identity, package write access, and interactive 2FA: `npm whoami` and `npm access list packages`. Run `pnpm release:plan` and confirm every planned release targets `preview` except the Marketplace, which Changesets plans for `latest` while it has no stable version. npm protects the `latest` dist-tag and returns 400 to `npm dist-tag rm ... latest`, so do not try to remove it. `pnpm release:preview` publishes the Marketplace first with an explicit `--tag preview` and verifies the tag; the standalone step is `pnpm release:preview:marketplace`, and `--dry-run` reports what it would do.
2. Run `pnpm release:preview`. It performs the pre-flight check, publishes or verifies the Marketplace preview tag, reruns the plan check with `--strict`, and then runs Changesets for the remaining packages. Record every published version and locally created package tag. Do not rerun with a different command after an uncertain response; inspect npm first. The Marketplace `latest` tag stays on the old `0.1.0-preview.0` because npm does not allow deleting it; the first stable release reassigns it. Never publish this Preview line to `latest`.
3. From clean temporary directories, verify `pnpm dlx @becomeopc/dshx-hub-cli@preview --version` reports the planned version and its help contains the atomic command tree without legacy Sync workflows. Create Starter and Showcase with `pnpm create dshx@preview`, then run their `check` and `build`. Install `@becomeopc/dshx-plugin-marketplace@preview` into a disposable DSH Profile and verify the real Settings → Plugins → Marketplace path.
4. Verify the published CLI exposes the new `ops bundle` surface and contains no administrator-only prompt files: `pnpm hub:prompt:release-check`. Do not deploy the Hub if this fails; the Hub snapshot pins a different or unpublished CLI version.
5. Deploy Framework Hub so `/api/marketplace/plugins` and exact detail routes exist, then run `node scripts/smoke-hub.mjs https://dshx.io`. This base smoke checks the endpoint and reports catalog promotion as pending.
6. Promote the exact marketplace package/version and valid DSH compatibility range into the Hub catalog.
7. Run `pnpm hub:smoke:published`. This requires the public list route, the exact marketplace detail with one active primary target matching the package manifest, and the localized homepage containing the marketplace package name.
8. Verify the administrator-only bundle boundary: `curl -i https://dshx.io/api/ops/v1/agent-bundle` must return 401 without an administrator bearer token. Confirm the Worker secret `AGENT_RESOURCE_KEY` is configured (32 random bytes, base64; never commit it), open `https://dshx.io/admin/agent-prompt` as an administrator, and save a throwaway `GITHUB_TOKEN` value to confirm encryption storage works. The admin page must never return the stored value; only the authenticated `ops bundle` command may decrypt it.
9. Publish the matching standalone DSHX Skill and verify its public raw URL. Push only the reviewed package tags with `git push --follow-tags` after npm and Hub verification succeeds.

Do not silently skip the catalog-presence smoke. A deployed endpoint with an empty or stale catalog is not a complete Marketplace release.

## 5. Post-publication evidence

Verify with clean npm metadata and actual archives:

- `npm view <package>@preview version dist-tags repository homepage engines peerDependencies`;
- each archive contains README, LICENSE, declarations, declared exports, and only intended runtime files;
- `dshx --version` and the generated project's pinned DSHX dependency match the Preview;
- Starter owns its `defineLocale()` dictionaries without declaration merging and includes the Locale provider edge;
- Client HMR and automatic Host restart both work in a real Profile;
- Marketplace installs one local test bundle, updates the Profile manifest/bundle list, and loads it after restart;
- npm `latest` values are unchanged and no GitHub Release was created.

Local npm publication does not produce GitHub OIDC Trusted Publishing provenance. Adding CI publication or provenance requires a separate policy change and credential design.
