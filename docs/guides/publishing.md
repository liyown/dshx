# Publishing a DSHX plugin

Publish the plugin as an ordinary DSH bundle. DSHX is build-time tooling; the resulting Host and Client artifacts load through the official DSH/Cordis runtime.

## Package contract

Before packaging, confirm `package.json` contains:

- a public, stable package identity, description, keywords, license, repository, bugs, homepage, and Node engine;
- `files`, `exports`, and `types` entries that point only to built artifacts and intended documentation;
- a public `@deepseek-ai/dsh` peer range contained by one DSHX protocol generation, plus one concrete DSH development version;
- every official Host/Client package imported at runtime as a peer dependency;
- every Client provider needed before the bundle in `dsh.client.inject`, and every official runtime external in `dsh.client.external` when required by the DSH manifest;
- `publishConfig.access: "public"` for a public scoped package.

Include a README and LICENSE in the tarball. Do not ship source maps, fixtures, local Profile data, credentials, terminal logs, or workspace-only dependencies unless they are an intentional public artifact.

## Local gates

Use the project's selected package manager and existing scripts:

```bash
pnpm install --frozen-lockfile
pnpm check
pnpm test
pnpm build
pnpm pack --dry-run
pnpm exec dshx check --runtime
```

Inspect the actual tarball, not only the workspace build. Install that tarball into a disposable Profile with the official CLI, restart the Profile, and verify the requested Host registration and Client path in a real DSH Web session. For UI work, exercise Client HMR and a Host change separately.

`dshx check` validates the project declaration and provider edges; `dshx build` verifies the emitted DSH artifact. Neither proves that npm accepted the package or that a Hub catalog entry is active.

## Preview publication

For an independent plugin that has not published a stable version, choose an explicit prerelease version and preserve the npm stable channel:

```bash
npm whoami
npm publish --tag preview
npm view <package>@preview version
```

Complete npm 2FA interactively. Never commit an npm token or authentication `.npmrc`. Publishing, pushing tags, deploying a Hub, and submitting a catalog entry are separate external actions and each requires explicit authorization.

The DSHX monorepo itself uses Changesets pre mode and its guarded `pnpm release:preview` runbook; do not copy that repository-only command into an ordinary plugin package.

## Framework Hub entry

Hub visibility requires catalog evidence in addition to npm publication. The active primary target must name the exact published package and version, declare a valid DSH compatibility range, and pass Hub validation. Treat npm metadata and the package archive as untrusted input: Hub and installer validation still control what can be displayed or executed.

After catalog promotion, verify the public listing endpoint, exact detail endpoint, localized Hub page, and a clean Profile installation from the published spec. A successful direct npm install does not substitute for this end-to-end check.
