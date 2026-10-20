# Changesets

Run `pnpm changeset` for publishable package changes. Framework and `create-dshx` are a fixed group; the Hub CLI versions independently. The website is private and deployed manually.

Public DSH-facing packages (`@becomeopc/dshx`, `create-dshx`, `@becomeopc/dshx-plugin-marketplace`) stay on the `0.2.x` line that tracks the supported DSH release line. Use `patch` for compatible fixes and features, and `minor` for breaking changes while the project remains on 0.x. CI rejects `major` changesets. The Hub CLI keeps its own version line.
