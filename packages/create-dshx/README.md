# create-dshx

Create a reproducible DeepSeek Harness plugin project with typed Host and Client entry points.

```bash
pnpm create dshx my-plugin
cd my-plugin
pnpm dev
```

The initializer refuses to overwrite an existing non-empty directory, generates a minimal Host Tool and Client Slot, pins the matching DSHX release, and declares the compatible DSH `0.1` range.

## Automation

```bash
pnpm create dshx my-plugin --yes --no-install
pnpm create dshx my-plugin --package-manager pnpm
```

- `--yes` disables interactive questions.
- `--install` and `--no-install` explicitly control dependency installation.
- `--package-manager pnpm|yarn|npm` overrides detection.
- `--cwd <path>` selects the parent directory.

Package-manager detection checks the explicit flag, existing lockfiles, the nearest `packageManager` declaration, and available commands on `PATH`, in that order.

See the [DSHX documentation](https://dshx.io/docs) and [repository](https://github.com/liyown/dshx) for the full development workflow.

MIT © DSHX contributors.
