# create-dshx

Create a reproducible DeepSeek Harness plugin project with typed Host and Client entry points.

```bash
pnpm create dshx@preview my-plugin
cd my-plugin
pnpm dev
```

Choose a feature template and an independent Client styling setup:

```bash
pnpm create dshx@preview my-plugin --template starter --style css-modules
pnpm create dshx@preview my-plugin --template showcase --style tailwind
pnpm create dshx@preview my-plugin --template starter --style none
```

- `starter` contains one Host Tool and one localized visible Client Slot. Its `defineLocale()` contribution supplies typed `zh`/`en` copy without `LocaleNamespaceMap` declaration merging.
- `showcase` adds a Prompt Section, dynamic Prompt Context, Settings contract, typed API, and Runtime Deck Slot. Experimental Conversation APIs are intentionally excluded.
- `css-modules` uses the standard Vite CSS Modules pipeline.
- `tailwind` uses Tailwind v4's Vite plugin, CSS-first configuration, a `dshx:` prefix, and omits Preflight so the plugin cannot reset the shared DSH page.
- `none` emits no stylesheet or styling dependency.

Every generated project provides `check`, `build`, `dev --open`, and `prepack`; `prepack` runs the offline check and production build through the selected package manager. The initializer refuses to overwrite an existing directory, pins the matching DSHX release, installs the latest verified DSH boundary for local development, and only declares dependencies and provider edges used by the selected combination. A starter that uses `defineLocale()` includes the required `@deepseek-ai/dsh-client-locale` provider edge automatically.

## Automation

```bash
pnpm create dshx@preview my-plugin --yes --no-install
pnpm create dshx@preview my-plugin --package-manager pnpm
```

- `--yes` disables interactive questions.
- `--yes` defaults to `starter` with `css-modules` when no selectors are passed.
- `--template starter|showcase` selects the feature set.
- `--style css-modules|tailwind|none` selects the styling setup.
- `--install` and `--no-install` explicitly control dependency installation.
- `--package-manager pnpm|yarn|npm` overrides detection.
- `--cwd <path>` selects the parent directory.

Package-manager detection checks the explicit flag, existing lockfiles, the nearest `packageManager` declaration, and available commands on `PATH`, in that order.

See the [DSHX documentation](https://dshx.io/docs) and [repository](https://github.com/liyown/dshx) for the full development workflow.

MIT © DSHX contributors.
