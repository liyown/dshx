# Releasing

Changesets owns package versions. `@becomeopc/dshx` and `create-dshx` form a fixed group; `@becomeopc/dshx-hub-cli` is independent.

Before automated CLI publishing, create `@becomeopc/dshx-hub-cli` once manually with npm 2FA and configure the GitHub Actions trusted publisher for `.github/workflows/release.yml`. The release workflow uses npm OIDC provenance and must not receive Cloudflare credentials.

The website is deployed only from a Cloudflare-authenticated development machine:

```bash
pnpm hub:deploy
```

That command runs all checks including the real DSH loader/HMR smoke, applies remote D1 migrations, deploys the Worker and verifies `https://dshx.io`.
