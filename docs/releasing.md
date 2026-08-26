# Releasing DSHX packages

GitHub maintains the Changesets version pull request, but it does not publish npm packages, create npm provenance, tag releases, or create GitHub Releases. Publication is an explicit developer-machine operation. Framework Hub deployment is also local-only through `pnpm hub:deploy`.

## Version policy

- `@becomeopc/dshx` and `create-dshx` are a fixed Changesets group and always release together.
- `@becomeopc/dshx-hub-cli` versions independently.
- All public packages remain on `0.1.x` until an explicit release-policy decision changes the line. Every changeset is `patch` during this period, including new features and breaking development changes; release notes must call out any breaking behavior.
- Node.js support remains `^22.19.0 || >=24.0.0` until a deliberate compatibility release changes it.

The serialized `release.yml` workflow has only repository write permissions and opens or updates the Changesets version PR. It has no npm token, OIDC permission, or publish command. Do not configure `release.yml` as an npm Trusted Publisher while this local-publication policy is active.

## Local publication

After the version PR is merged, start from a clean, current `main` on a trusted development machine:

```sh
pnpm install --frozen-lockfile
pnpm check:all
pnpm smoke:packages
pnpm smoke:dsh -- --version 0.1.0-rc.8
pnpm smoke:dsh -- --version 0.1.1-rc.2
pnpm version:check
npm login
pnpm release
git push --follow-tags
```

Complete npm 2FA interactively. `pnpm release` runs `changeset publish`, publishes only packages whose versions are not yet present, and creates the corresponding local git tags. Never commit npm credentials or `.npmrc` authentication material.

Before publishing, `check:all` covers lint, formatting, dependency checks, production audit, typecheck, unit tests, builds, package tarball/bin smoke, and Hub checks. Run both representative `protocol-1` boundaries explicitly for an API Candidate or build-kernel release. `smoke:packages` verifies packed public subpaths, NodeNext/Bundler consumers, publint, Are The Types Wrong, and declared exports/types/bin files.

After publication, verify:

- package metadata points to `https://dshx.io` and `liyown/dshx`;
- each tarball contains README, LICENSE, declarations, and its declared binary;
- `dshx`, `create-dshx`, and `dshx-hub` return the published version;
- the expected npm versions and git tags exist.

For a Core/Creator release, repeat creation from npm in fresh temporary directories rather than the workspace:

```sh
pnpm create dshx@<version> starter-css --template starter --style css-modules
pnpm create dshx@<version> showcase-tailwind --template showcase --style tailwind
```

Run each generated package's `check` and `build`, then link/load it through a real DSH Profile. Verify that the Tailwind project contains no Preflight reset and materializes one owned Client style. Deploy Framework Hub only after npm installation succeeds and its documentation/Skill references the published version.

Local npm publication does not produce GitHub OIDC Trusted Publishing provenance. Reintroducing provenance requires an explicit policy change that authorizes CI publishing.
