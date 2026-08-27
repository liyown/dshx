# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- DSH developers discovering, evaluating, installing, publishing, and maintaining plugins.
- Community members collecting plugins, following publishers, reviewing releases, replying, reporting abuse, and appealing moderation.
- Operators and local Agents maintaining catalog facts through the `dshx-hub` CLI.
- Administrators making the small number of high-risk decisions automation cannot make safely.

## Product Purpose

DSHX Hub is the bilingual catalog and community market for DSH plugin bundles. It turns GitHub and npm observations into traceable plugin pages, keeps source facts separate from curated content, and gives operators small, auditable mutations instead of a hidden automation pipeline.

## Positioning

Catalog admission is Agent-owned: an upsert means the Agent has judged the source to be a plugin. The Hub validates structure, identity, exact installation targets, provenance, and publication completeness without duplicating evidence classification. Third-party scripts are never executed, and uncertainty stays visible instead of becoming a certification gate.

## Operating Context

The public site runs on Cloudflare Workers with D1 and R2. A local Agent uses `dshx-hub` and the independent `dshx-hub-ops` Skill to inspect current state, combine stateless domain commands, and retry individual operations. The CLI collects and normalizes public facts; the Operations API owns identity, merge precedence, revisions, permissions, transactions, visibility, and audit history. Administrators use a separate surface for infrequent community and role decisions.

## Capabilities and Constraints

- Stable ASCII plugin slugs, English and Chinese catalog content, locale-specific SEO, cursor search, real installation targets, releases, dependencies, metrics, media, provenance, and immutable bilingual operations reports.
- GitHub OAuth accounts, public profiles, public bookmarks, public or private collections, plugin/publisher follows, in-app notifications, critical approval email, submissions, claims, reviews, first-level replies, reports, blocks, and appeals.
- No direct third-party installation, arbitrary approval scripts, arbitrary webhooks, marketing or bulk email, direct messages, user follows, or production fixture data.
- CLI commands are thin, JSON-first operations. They do not save catalog progress, impose an operation order, or make the Agent reproduce database rules.
- Source observations, curated content, visibility, and media have distinct write boundaries. Resource revisions protect concurrent editorial changes.
- The web administration surface cannot become a parallel catalog editor.

## Brand Commitments

The product name is DSHX Hub. Existing DSHX terminology, X motif, concise technical voice, bilingual experience, and current editorial/technical interface are binding.

## Evidence on Hand

Verified catalog and community data comes from D1, GitHub and npm provenance, and R2 media metadata. Local preview may use the explicitly labeled development fixture in `drizzle/dev-seed.sql`; no customer claims, testimonials, benchmarks, or production plugin data may be fabricated.

## Product Principles

1. Source signals remain explicit context; they do not become a second server-side plugin admission decision.
2. Agent operations stay stateless, composable, independently retryable, and observable through stable JSON.
3. The server, not the Agent, owns field precedence, concurrency, transactions, permissions, and data integrity.
4. Source facts, curated content, visibility, community context, and audit history remain understandable as separate concerns.
5. Batch failures are isolated per item without discarding successful siblings.

## Accessibility & Inclusion

English and Chinese are equal product languages. Operative surfaces must support keyboard navigation, visible focus, semantic status text, screen-reader labels, reduced motion, and responsive layouts without hiding decision evidence.
