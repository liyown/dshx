---
"@becomeopc/dshx-hub-cli": patch
---

The CLI validates observations, curation documents and media metadata against `@becomeopc/dshx-hub-contracts` — the same schemas the Hub validates against — instead of a hand-written copy. Four drifts go away: npm package casing, the GitHub full name shape, the `subdirectory` default, and how many primary install targets an observation may declare. A document the Hub would reject now fails locally, before the round trip.
