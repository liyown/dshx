---
"@becomeopc/dshx": patch
"create-dshx": patch
---

Stabilize the Host, Client, API, Settings, Slot, Prompt, and config surfaces as API Candidates, and add the Vite build-extension kernel, standard CSS pipeline, optional Tailwind support, declarations, offline checks, and the Starter/Showcase template matrix.

This development release intentionally removes the legacy Host `api`, Client `api`/`apis`, `useQuery`, split Conversation Node/Slot, string face config, and old compiler/compatibility entry points. Run `dshx check` and follow the 0.1.1 to 0.1.2 migration guide for exact replacements.
