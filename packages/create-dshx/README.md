# create-dshx

Create a DSHX plugin project with the standard Host and Client entry points.

```bash
pnpm create dshx my-plugin
```

Use `--yes` for non-interactive generation. Add `--install` or `--no-install` to control dependency installation explicitly, and use `--package-manager pnpm|yarn|npm` when the package manager cannot be inferred from the target project.

The generated project pins the DSHX release version and declares the compatible DSH 0.1 protocol range. It includes a minimal Host Tool and Client Slot that can be built and inspected with `dshx`.
