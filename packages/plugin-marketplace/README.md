# DSHX Plugin Marketplace

`@becomeopc/dshx-plugin-marketplace` is DSHX's self-hosting reference plugin. It adds **Settings → Plugins → Marketplace** to a DSH Web Profile and reads Framework Hub's installable marketplace catalog.

The package exercises the complete plugin authoring path produced by `create-dshx`: `defineHost`, `defineSettings`, `defineApi`, `defineClient`, `defineLocale`, `defineSlot`, Standard Schema validation, and `useApiQuery`. It is built and installed as an ordinary DSH bundle; no Harness or DSHX core patch is required.

## Develop and build

From the DSHX workspace:

```sh
pnpm install
pnpm --filter @becomeopc/dshx-plugin-marketplace check
pnpm --filter @becomeopc/dshx-plugin-marketplace typecheck
pnpm --filter @becomeopc/dshx-plugin-marketplace test
pnpm --filter @becomeopc/dshx-plugin-marketplace build
```

Run `pnpm --filter @becomeopc/dshx-plugin-marketplace dev` to start the real DSH development Profile. Client changes use official HMR; Host changes rebuild and restart the Host process. Add `-- --port 0` when the default Web port is occupied.

## Install

The Preview package is installed into the Profile that should own the marketplace:

```sh
dsh plugin --profile web add @becomeopc/dshx-plugin-marketplace@preview
dsh --profile web
```

For an unpublished workspace build, run `pnpm --filter @becomeopc/dshx-plugin-marketplace pack`, then pass the emitted `.tgz` path to the same `dsh plugin --profile web add` command.

Installed plugins become active after the Profile is restarted. The first version intentionally does not restart DSH automatically.

## Framework Hub configuration

The settings namespace is `dshx-plugin-marketplace`:

```yaml
dshx-plugin-marketplace:
  hubBaseUrl: https://dshx.io
```

The value updates live. Production endpoints must use HTTPS; loopback HTTP is accepted only for local development and smoke tests.

The Host reads `GET /api/marketplace/plugins` and `GET /api/marketplace/plugins/:slug`. Those endpoints are separate from Hub's discovery/SEO catalog. An install always re-fetches the exact detail and accepts only one active primary target whose package and version match the published catalog entry. The client does not submit a package name, version, or command.

## Security boundary

- The browser submits only a Hub slug. The Host fetches the plugin detail again and accepts exactly one active primary install target.
- Compatibility is checked against the running DSH version before installation.
- The DSH CLI is invoked with a fixed argument array, without a shell, with cancellation, a five-minute timeout, and one install task per Profile process.
- Host responses are validated before display. Local paths and raw terminal output remain in Host logs.
- Community plugins display an additional third-party code warning before installation.

This Preview contains categories, compact cards, pagination, installation, and restart guidance. It does not contain search, sorting controls, ratings, details, uninstall, update, hot loading, or automatic restart. Installation works only from a loopback DSH Web session because the typed Host API is intentionally loopback-only.
