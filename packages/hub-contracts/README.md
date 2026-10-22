# @becomeopc/dshx-hub-contracts

The DSHX Hub operations wire contract, in one place.

Two processes speak this contract: the Hub (`apps/framework-hub`), which
validates and stores observations, and the Hub CLI
(`@becomeopc/dshx-hub-cli`), which produces them. They run on different
runtimes, ship on different schedules, and used to carry hand-written copies of
the same schemas. The copies drifted — npm package casing, GitHub `fullName`
shapes, a `subdirectory` default, and how many primary install targets an
observation may declare — and every drift surfaced as a 422 from the server
after a successful local run.

This package removes the possibility: one schema, one canonical serializer, one
definition of what an observation id is the hash of.

## What belongs here

- `contracts` — every payload and query the operations API accepts or returns.
- `install-target` — the rule deciding whether an install spec is safe to hand
  to a shell, and which target is the one to render. The ingest gate, the
  publication gate, the public selector and the readiness projection are all
  adapters over it.
- `canonical-json` — the serialization every content hash in the Hub is
  computed over.
- `observation-id` — the exact text an observation id is the sha-256 of.

## What does not belong here

- Database row shapes. The Hub owns its storage.
- Local input encodings. The CLI turns a file path into a `sourceSha256` and
  flags into a query string; those are adapter concerns.
- The public catalog response. The marketplace reads a rendered projection, not
  the observation payload.

## Hashing

`observationIdInput` returns the bytes; each side hashes them with its own
primitive — WebCrypto on the Worker, `node:crypto` in the CLI. A change to the
serializer would make the two disagree, so the shared id vector in
`test/observation-id.test.ts` is what both sides are checked against.

## Versioning

The contract is versioned independently of the DSH compatibility line, and
`pluginObservationPayloadSchema` carries `schemaVersion: 1`. A breaking change
to a payload gets a new schema version rather than a new shape under the old
version, because producers in the wild cannot be upgraded in lockstep.
