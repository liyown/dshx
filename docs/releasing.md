# Releasing the first DSHX Preview

The first public Preview is a coordinated, local npm-2FA release. GitHub may open the Changesets version pull request, but it has no npm token, does not publish packages, does not push package tags, and does not create a GitHub Release. Framework Hub deployment is a separate, Cloudflare-authenticated operation.

## Target and channel

| Package                              | First Preview target | npm tag   |
| ------------------------------------ | -------------------- | --------- |
| `@becomeopc/dshx`                    | `0.1.4-preview.0`    | `preview` |
| `create-dshx`                        | `0.1.4-preview.0`    | `preview` |
| `@becomeopc/dshx-hub-cli`            | `0.1.2-preview.0`    | `preview` |
| `@becomeopc/dshx-plugin-marketplace` | `0.1.0-preview.0`    | `preview` |

Core and Creator are a fixed Changesets group and must share a version. Marketplace begins at `0.0.0` in the repository so its one initial `minor` changeset produces `0.1.0-preview.0`; subsequent public-package changesets remain `patch` while the project stays on `0.1.x`. Hub CLI versions independently and is included because the `atomic-hub-operations` changeset replaces the already-published legacy 0.1.1 protocol.

The existing npm `latest` channel remains untouched. Do not create an aggregate `v0.1.4` tag or GitHub Release for this Preview; Changesets creates package-scoped local tags only for packages it actually publishes.

## 1. Freeze the release inputs

Finish code, documentation, Skill, migration notes, and every final changeset before entering pre mode. Confirm the intended stable-bump plan without consuming changesets:

```bash
pnpm install --frozen-lockfile
pnpm version:check
pnpm changeset status
```

At this point the expected ordinary plan is Core/Creator `0.1.4`, Hub CLI `0.1.2`, and Marketplace `0.1.0`. Do not run `version-packages` early: it deletes consumed changeset files and rewrites package versions and changelogs.

## 2. Enter Preview pre mode and version

Only after the release inputs are final:

```bash
pnpm preview:enter
pnpm version-packages
```

Review and commit `.changeset/pre.json`, package manifests, lockfile, changelogs, and removed changeset files. The resulting versions must be Core/Creator `0.1.4-preview.0`, Hub CLI `0.1.2-preview.0`, and Marketplace `0.1.0-preview.0`.

The serialized `release.yml` workflow refuses to create a stable version PR while `.changeset/pre.json` is absent, and only runs Changesets Action for `mode: pre` with `tag: preview`. It has repository write permission only. If the pre-state/version commit is prepared locally, the Action should find no additional version work; if pre mode is committed before versioning, it may open the corresponding Preview version PR.

Do not run `changeset pre exit` for this release. Exiting pre mode is a later, explicit stable-promotion decision.

## 3. Run the complete gates

Start from a clean, current `main` on a trusted development machine:

```bash
pnpm install --frozen-lockfile
pnpm check:all
pnpm smoke:dsh -- --version 0.1.0-rc.8
pnpm smoke:dsh -- --version 0.1.1-rc.2
pnpm release:plan
pnpm release:preview:check
```

`check:all` includes lint, formatting, dependency and production-audit checks, Core/Creator/Marketplace tests and builds, Hub checks, generalized public-package tarball smoke, the latest verified real-DSH smoke, and the marketplace self-bootstrap smoke. The two explicit DSH commands protect both recorded `protocol-1` boundaries.

`release:preview:check` is intentionally stricter than a build: it requires clean `main`, the exact four Preview version shapes, public package metadata, `pre.json` in Preview mode, and a non-empty Changesets `publish-plan` containing only recognized packages with `tag: preview`. Already-published Preview versions are correctly absent from an incremental plan; the atomic Hub CLI release therefore contains only `@becomeopc/dshx-hub-cli`. The check must fail before pre mode or from a dirty worktree.

Changesets v3.0.1 rejects an explicit `changeset publish --tag preview` while pre mode is active. Therefore `pnpm release:preview` uses the validated pre-state and then invokes bare `changeset publish`; the publish plan is the authoritative proof that npm receives the `preview` tag. The ordinary `pnpm release` alias calls this same guarded command and cannot select `latest`.

## 4. Deploy the endpoint, publish, and promote the catalog

Perform external operations only with explicit authorization and authenticated accounts:

1. Deploy Framework Hub so `/api/marketplace/plugins` and exact detail routes exist, then run `node scripts/smoke-hub.mjs https://dshx.io`. This base smoke checks the endpoint and reports catalog promotion as pending.
2. Confirm npm identity, package write access, and interactive 2FA: `npm whoami` and `npm access list packages`.
3. Run `pnpm release:preview`. Record every published version and locally created package tag. Do not rerun with a different command after an uncertain response; inspect npm first.
4. From clean temporary directories, verify `pnpm dlx @becomeopc/dshx-hub-cli@preview --version` reports the planned version and its help contains the atomic command tree without legacy Sync workflows. Create Starter and Showcase with `pnpm create dshx@preview`, then run their `check` and `build`. Install `@becomeopc/dshx-plugin-marketplace@preview` into a disposable DSH Profile and verify the real Settings → Plugins → Marketplace path.
5. Promote the exact marketplace package/version and valid DSH compatibility range into the Hub catalog.
6. Run `pnpm hub:smoke:published`. This requires the public list route, the exact marketplace detail with one active primary target matching the package manifest, and the localized homepage containing the marketplace package name.
7. Publish the matching standalone DSHX Skill and verify its public raw URL. Push only the reviewed package tags with `git push --follow-tags` after npm and Hub verification succeeds.

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
