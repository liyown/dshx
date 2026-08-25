---
"@becomeopc/dshx": patch
"create-dshx": patch
---

Add experimental component-shaped Conversation contributions over the official Client assembler and keyed chat renderer, plus hook-driven Client API binding so `useApi()` and `useQuery()` no longer require a duplicate `defineClient({ api })` declaration. Keep custom durable Session events explicitly unavailable until DSH exposes an out-of-tree event-vocabulary registry, and update the starter to demonstrate direct Hook usage.
