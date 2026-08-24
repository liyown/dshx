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

DSHX Hub is the bilingual catalog and community market for verified DSH plugin bundles. It turns GitHub and npm facts into traceable plugin pages, provides community context around those plugins, and keeps routine operations automatable without hiding high-risk decisions from people.

## Positioning

Publication is evidence-driven: discovery never equals publication, third-party scripts are never executed, bilingual catalog content stays linked to source hashes, and every human-required operation becomes an auditable approval with a registered effect.

## Operating Context

The public site runs on Cloudflare Workers with D1 and R2. A local Agent uses `dshx-hub` and the independent `dshx-hub-ops` Skill for daily, weekly, monthly, and recovery workflows. Administrators use the approval center only when a deterministic workflow reaches a fixed high-risk boundary.

## Capabilities and Constraints

- Stable ASCII plugin slugs, English and Chinese catalog content, locale-specific SEO, cursor search, real installation targets, releases, dependencies, metrics, media, and provenance.
- GitHub OAuth accounts, public profiles, public bookmarks, public or private collections, plugin/publisher follows, in-app notifications, critical approval email, submissions, claims, reviews, first-level replies, reports, blocks, and appeals.
- No direct third-party installation, arbitrary approval scripts, arbitrary webhooks, marketing or bulk email, direct messages, user follows, or production fixture data.
- CLI and Skill own deterministic operations; the web administration surface is approval-only and cannot become a parallel catalog editor.
- High-risk effects are allowlisted, schema-validated, idempotent, stale-aware, and executed by the server or resumed by the requesting Agent.

## Brand Commitments

The product name is DSHX Hub. Existing DSHX terminology, X motif, concise technical voice, bilingual experience, and current editorial/technical interface are binding.

## Evidence on Hand

Verified catalog and community data comes from D1, GitHub and npm provenance, and R2 media metadata. Local preview may use the explicitly labeled development fixture in `drizzle/dev-seed.sql`; no customer claims, testimonials, benchmarks, or production plugin data may be fabricated.

## Product Principles

1. Discovery is a candidate signal, never publication authority.
2. Deterministic work stays composable and recoverable through the CLI.
3. If a decision needs a person, it becomes a first-class approval with evidence and an explicit effect.
4. Public identity and community context remain understandable without weakening safety or auditability.
5. Partial failures are isolated; global failures stop safely without exposing half-written catalog state.

## Accessibility & Inclusion

English and Chinese are equal product languages. Operative surfaces must support keyboard navigation, visible focus, semantic status text, screen-reader labels, reduced motion, and responsive layouts without hiding decision evidence.
