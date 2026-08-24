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
npm login
pnpm release
git push --follow-tags
```

Complete npm 2FA interactively. `pnpm release` runs `changeset publish`, publishes only packages whose versions are not yet present, and creates the corresponding local git tags. Never commit npm credentials or `.npmrc` authentication material.

Before publishing, `check:all` covers lint, formatting, dependency checks, production audit, typecheck, unit tests, builds, package tarball/bin smoke, Hub checks, and the latest verified real DSH boundary. CI separately runs every generation's minimum/latest compatibility boundary.

After publication, verify:

- package metadata points to `https://dshx.io` and `liyown/dshx`;
- each tarball contains README, LICENSE, declarations, and its declared binary;
- `dshx`, `create-dshx`, and `dshx-hub` return the published version;
- the expected npm versions and git tags exist.

Local npm publication does not produce GitHub OIDC Trusted Publishing provenance. Reintroducing provenance requires an explicit policy change that authorizes CI publishing.
