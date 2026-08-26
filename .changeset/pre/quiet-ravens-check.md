---
"@becomeopc/dshx": patch
"create-dshx": patch
---

Add `defineLocale()` as the type-safe plugin-owned localization API. It infers one exact `zh`/`en` key set, registers and disposes dictionaries before Slots, supplies typed translation props, and removes the need for plugin authors to augment `LocaleNamespaceMap`. The starter now demonstrates the complete Locale-to-Slot path and writes the official Locale provider edge automatically.

Fail `check`, `build`, and every `dev` Client rebuild before runtime when Locale usage is missing either its Cordis service declaration or official provider package edge. Generated project documentation now explains the two Client dependency layers.

Add a validated `dshx dev --port` option and run the real DSH smoke on an OS-assigned, session-stable loopback port so it can execute beside another live development server.

Keep packaged Host and Client artifacts relocatable by omitting build-machine absolute project paths from generated runtime metadata and source maps.

Publish npm-safe DSH provider peer ranges that explicitly include the verified `0.1.1-rc.2` boundary instead of relying on package managers to include a cross-patch prerelease implicitly.
