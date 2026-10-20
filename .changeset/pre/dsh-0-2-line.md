---
"@becomeopc/dshx": minor
"create-dshx": minor
"@becomeopc/dshx-plugin-marketplace": minor
---

Move the public line to DSH 0.2.x with a protocol-2 compatibility registry and the DSH 0.2.1-rc.2 source build as the verified baseline. Settings now follow the official `Config` + `SettingsForms`/`ctx.configForms` seam, Conversation follows `ctx.uiConversation`/`ctx.conversation`, and Connection RPC uses peer-based routing. `@deepseek-ai/dsh-client-runtime` and the old DSHX Settings/Conversation bindings are removed. Generated projects declare `engines.dsh`, export their shared Config schema, and fail `check`/`build`/`dev` when they still target the 0.1 line. `create-dshx` and the Marketplace reference plugin use the new APIs; upgrade notes live in `docs/migrations/0.1-to-0.2.md`.
