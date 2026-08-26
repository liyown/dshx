# DSHX Framework Hub

Design a premium official website for “DSHX”, a modern TypeScript + React development framework for building DeepSeek Harness (DSH) plugins.

This is an open-source developer framework today, but the website must be designed from the beginning to evolve into a full DSH plugin ecosystem and community in the future.

The future product will include:

- plugin discovery
- plugin marketplace / registry
- plugin detail pages
- authors and maintainers
- categories
- trending plugins
- curated collections
- search
- version compatibility
- installation instructions
- GitHub metadata
- publishing plugins

## Backend foundation

The Hub targets Cloudflare Workers with Cloudflare D1 and Drizzle ORM. The
source schema lives in `src/lib/db/schema.ts`; generated SQL migrations are
committed under `drizzle/`.

```bash
# Generate SQL after changing the Drizzle schema
pnpm db:generate

# Apply migrations to the local D1 database
pnpm db:migrate:local

# Run Vite with a local Wrangler binding proxy
pnpm dev

# Build and preview the Worker with its local D1 binding
pnpm cf:preview
```

`GET /api/health` performs a real `select 1` through Drizzle and returns `503`
when the `DB` binding is absent or unreachable. Public catalog pages and
`/api/plugins` read D1 directly; synthetic plugin records only exist inside the
integration tests and are never seeded into production.

`GET /api/plugins` is the public discovery/SEO feed and intentionally includes
published verification placeholders. `GET /api/marketplace/plugins` is the
installable subset: every result is verified and has exactly one active primary
target whose package name and version match the current catalog release. Both
list responses include localized `categories`; marketplace detail is available
at `GET /api/marketplace/plugins/:slug` under the same eligibility rule.

Before the first remote deployment, create the D1 database and replace the
all-zero `database_id` in `wrangler.jsonc` with the ID returned by Cloudflare:

```bash
pnpm exec wrangler d1 create dshx-framework-hub
pnpm exec wrangler r2 bucket create dshx-plugin-media
pnpm db:migrate:remote
pnpm deploy
```

Configure the GitHub OAuth callback as
`https://<hub-origin>/api/auth/callback/github`, then set secrets without
committing them:

```bash
pnpm exec wrangler secret put BETTER_AUTH_SECRET
pnpm exec wrangler secret put GITHUB_CLIENT_ID
pnpm exec wrangler secret put GITHUB_CLIENT_SECRET
pnpm exec wrangler secret put GITHUB_TOKEN
pnpm exec wrangler secret put TURNSTILE_SECRET_KEY
pnpm exec wrangler secret put RESEND_API_KEY
```

`GITHUB_TOKEN` is an optional fine-grained read-only token used only by the
server-side, edge-cached repository metadata endpoint. Without it the star
counter still degrades safely to GitHub's anonymous public API and then to a
plain Star action if that upstream quota is unavailable.

Set `SITE_URL`, `TURNSTILE_SITE_KEY`, and the comma-separated GitHub numeric ID
allowlist `HUB_ADMIN_GITHUB_IDS` in the Cloudflare environment. A matching first
sign-in becomes the bootstrap administrator. Hub CLI tokens are distinct from
GitHub API credentials, expire after 180 days, are stored only as hashes in D1,
and can be revoked. The public Wrangler config never contains the Turnstile
secret; `cf:preview` injects Cloudflare's local test pair only.

## Transactional email

Critical approval decisions and registered-effect failures are delivered through
Resend from `DSHX Hub <no-reply@mail.dshx.io>`. Configure `mail.dshx.io` as a
sending-only Resend domain with SPF, DKIM and DMARC, create a domain-restricted
sending key, and store it only in the `RESEND_API_KEY` Worker secret. Disable
open and click tracking for this transactional domain.

Only verified account addresses receive email. Delivery runs under the
Cloudflare request `waitUntil` lifecycle and never changes an approval API
response; the D1-backed in-app notification is the authoritative record. Email
uses the notification ID as its Resend idempotency key, and replies are not
monitored.

Preview the bilingual templates locally with the pinned React Email development
server. Its UI stays in `devDependencies` and is not bundled into the Worker:

```bash
pnpm email:preview
```

Automated tests inject a fake delivery client and never send real email.

## Catalog operations

The workspace package `@becomeopc/dshx-hub-cli` installs the `dshx-hub`
command. It performs topic discovery, deterministic archive validation,
worklist exchange, staged upload, atomic publication and moderation. GitHub
reads use `GITHUB_TOKEN` or `gh auth token`; validation never runs third-party
install or lifecycle scripts.

```bash
pnpm --filter @becomeopc/dshx-hub-cli build
node ../../packages/framework-hub-cli/dist/index.js auth login --hub http://localhost:3000
node ../../packages/framework-hub-cli/dist/index.js sync worklist --hub http://localhost:3000
```

The long-running operations Skill is maintained independently in the personal
Skill Registry and is intentionally not bundled with the CLI package:

```bash
npx skills add liyown/SKILL --skill dshx-hub-ops
```

The current website should primarily introduce the DSHX framework, while the visual language, navigation and design system should already feel capable of supporting that future ecosystem.

BRAND POSITIONING

DSHX is:
“The developer framework for DSH plugins.”

It helps developers build DSH plugins using familiar TypeScript and React development patterns.

Core product ideas:

- TypeScript-first plugin authoring
- React UI contributions
- Host and Client development
- typed Host ↔ Client APIs
- runtime inspection
- plugin scaffolding
- fast development loop
- Client HMR
- Host restart
- production builds
- direct access to native DSH / Cordis APIs when needed

Do not position DSHX as an AI SaaS product.
Do not use generic AI imagery, glowing brains, robots, stars, magic sparkles or abstract AI gradients.

DESIGN DIRECTION

Use a design language that combines:

1. Technical editorial design
2. Developer tooling
3. Runtime / graph visualization
4. Open-source ecosystem
5. Precise micro-interactions

The website should feel:

- technical
- calm
- confident
- modern
- highly engineered
- open
- extensible
- slightly experimental

Avoid making it feel:

- corporate SaaS
- crypto
- cyberpunk
- gamer-oriented
- excessively futuristic
- overly decorative

VISUAL SYSTEM

Use a light editorial base for the main website.

Background:
warm off-white / subtle gray-white

Primary text:
almost black

Secondary text:
neutral gray

Primary accent:
a distinctive indigo / electric violet / blue-violet

Use dark surfaces selectively for:

- code examples
- runtime diagrams
- terminal output
- inspect output
- technical demonstrations

Do not make the entire website dark.

Avoid excessive glassmorphism.
Avoid large blurry gradient blobs.
Avoid generic rounded SaaS cards everywhere.

Use thin borders, subtle surfaces, strong spacing and typography.

TYPOGRAPHY

Use a modern grotesk / neo-grotesk sans-serif for interface and editorial content.

Use a precise monospace font for:

- code
- commands
- runtime state
- version labels
- plugin metadata

Typography should carry a large part of the visual hierarchy.

Use oversized but restrained headlines.

The homepage should feel closer to a modern technical publication or framework documentation site than a marketing-heavy startup website.

INTERNATIONALIZATION

The Hub uses URL-prefixed locales:

- /en
- /zh

The root URL negotiates the initial locale from Accept-Language; an explicit locale
in the URL always wins. Shared UI copy is kept in the typed locale catalog under
`src/lib/i18n`. Plugin localizations are stored independently in D1; missing
locale content may fall back for readers but is marked `noindex` and excluded
from that locale's Sitemap and hreflang declarations.

BRAND MOTIF — THE X

Create a visual identity around the “X” in DSHX.

The X should represent crossing runtime boundaries:

Host ↔ Client
Source ↔ Runtime
Plugin ↔ Composition
Developer ↔ DSH

Use intersecting thin lines as a recurring visual motif.

The X can appear as:

- logo detail
- runtime connection
- section divider
- graph intersection
- loading animation
- hover animation
- plugin relationship visualization

Do not turn it into a loud standalone icon.
It should feel architectural.

HOME PAGE

NAVIGATION

Create a restrained navigation bar.

Left:
DSHX logo

Center/right:
Docs
Plugins
Examples
Release notes

Secondary:
GitHub

Primary CTA:
Get Started

“Plugins” links to the live installable catalog. The first Preview also identifies `@becomeopc/dshx-plugin-marketplace` as the official self-hosting reference bundle.

This makes the product feel like a framework with an ecosystem, not a one-page tool.

HERO SECTION

Large headline:

“The developer framework for DSH plugins.”

Supporting text:

“Build DSH extensions with TypeScript, React, fast development workflows, typed Host–Client communication, and direct access to the native DSH runtime.”

Primary CTA:
Get Started

Secondary CTA:
View on GitHub

Below the CTA, show:

pnpm create dshx@preview my-plugin
cd my-plugin
pnpm dev

The hero visual should NOT be a generic browser mockup.

Create an animated runtime composition diagram.

Example visual structure:

src/host.ts
\
\
DSHX
/ \
Host Client
| |
Tool React Slot
API useApiQuery
\ /
DSH Runtime
● ready

Show subtle runtime events appearing over time:

client rebuilt · 72ms
HMR applied
host restarted
slot mounted
API connected

The animation should be slow, precise and technical.

The runtime diagram should become one of DSHX’s signature visual elements.

SECTION — WHY DSHX

Headline:

“Write the plugin. DSHX handles the machinery.”

Show a large source-to-runtime transformation.

Left:
simple developer code

Example:

export default defineClient({
slots: [
defineSlot('sidebar.footer.action', {
component: Status,
}),
],
})

Center:
DSHX transformation

Right:
the infrastructure handled automatically:

Client bundle
Module loader format
React external
CSS lifecycle
Slot registration
Profile linking
HMR
Source maps

This section should communicate that DSHX removes infrastructure complexity without hiding DSH itself.

SECTION — AUTHORING MODEL

Show Host and Client side-by-side.

Host:

defineHost({
tools: [searchTool],
apis: [statusApi.host(...)]
})

Client:

defineClient({
slots: [sidebarStatus]
})

Connect them visually with a typed contract.

Use thin animated lines rather than arrows everywhere.

Headline:

“One plugin. Two runtimes. One development model.”

SECTION — DEVELOPMENT LOOP

Create an interactive editor → runtime animation.

Left:
editor

Right:
runtime output

When client.tsx changes:

save
↓
client rebuilt · 68ms
↓
HMR applied
↓
UI updated

When host.ts changes:

save
↓
host rebuilt
↓
runtime restarted
↓
ready

Make this section feel extremely fast.

This should visually communicate the product more strongly than marketing copy.

SECTION — RUNTIME INSPECTION

Headline:

“Extend the runtime you actually have.”

Terminal example:

$ dshx inspect slots

sidebar.footer.action
conversation.chat.node
conversation.input.right
conversation.session

Then show:

$ dshx add ui --slot sidebar.footer.action

created src/ui/sidebar-status.tsx

The visual should show discovery flowing back from the runtime into source code.

This is an important differentiator.

SECTION — PROGRESSIVE POWER

Show a simple plugin growing into an advanced plugin.

Start:

defineHost({
tools: [weather]
})

Then progressively reveal:

defineHost({
tools: [weather],

commands: [refresh],

apis: [weatherApi.host(...)],

setup(ctx) {
ctx.on('agent/pre-step', ...)
}
})

Headline:

“Start simple. Drop into DSH whenever you need.”

Explain that DSHX provides ergonomic authoring primitives while preserving direct DSH / Cordis access.

SECTION — REACT UI

Show a visually attractive real plugin UI contribution inside a DSH interface.

Emphasize:

React
TypeScript
CSS Modules
typed Slot props

Use one polished example rather than several generic cards.

SECTION — PLUGIN ECOSYSTEM

This section is critical for future expansion.

Headline:

“Built for an ecosystem.”

Introduce the current installable DSH plugin catalog and its verification boundary.

Render real catalog entries; do not invent fictional plugins, ratings, download counts, or compatibility claims. Include the official marketplace package with its source and explicit Profile installation command.

Examples:

Memory
GitHub
Browser Tools
Model Router
Workspace Explorer
Agent Teams

Each card can contain:

plugin icon
plugin name
short description
author
latest version
DSH compatibility
downloads / stars
category

The design should already feel like a real registry rather than a marketing teaser.

Include:

Explore Plugins →

Even if this page initially contains only curated plugins, its UI should become the foundation of the future community.

PLUGIN CARD DESIGN

Plugin cards should not look like generic SaaS cards.

Make them feel closer to:
npm
VS Code extensions
Raycast extensions
GitHub repositories

But more polished.

Important metadata:

Plugin name
Author
Version
Compatibility
Updated date
Category
GitHub status

Allow small badges:

Verified
Official
Community

Future plugin cards may also display:

Downloads
Stars
Maintainer
Last updated
Supported DSH versions

PLUGIN DISCOVERY PAGE

Prepare the visual language for a future /plugins page.

Desktop layout:

Top:
large search input

“Search DSH plugins…”

Below:
category filters

Tools
UI
Agent
Memory
Models
Workflow
Developer Tools
Integrations

Content:

Featured
Trending
Recently Updated
New

Allow switching between:
grid
compact list

Do not make it visually resemble an ecommerce store.

It should feel like a package ecosystem.

PLUGIN DETAIL PAGE

Design system should support a future plugin detail page with:

Plugin name
Icon
Description
Author
GitHub
Version
DSH compatibility
Install command

Example:

dsh plugin add @example/dsh-memory

Sections:

Overview
README
Versions
Compatibility
Dependencies
Release notes

Sidebar:

Latest version
License
Repository
Updated
Downloads
Compatibility

Potential future actions:

Install
Copy command
Open GitHub

COMMUNITY DIRECTION

The ecosystem should feel open-source first.

Avoid:
pricing
ratings like ecommerce
sales-oriented UI

Prefer:
stars
usage
versions
maintainers
compatibility
GitHub
activity

The website should communicate:

“DSHX is the development framework.
The community builds the ecosystem.”

MOTION

Use motion sparingly.

Primary animations:

1. Runtime graph connections
2. Build → HMR lifecycle
3. Host ↔ Client communication
4. Inspect discovery
5. Plugin ecosystem nodes appearing in the graph

Use 1px lines, small pulses and state transitions.

Avoid:
large WebGL effects
3D globes
particles everywhere
scroll-jacking
excessive parallax

Motion should communicate system behavior.

RESPONSIVE DESIGN

Desktop:
editorial grid and large runtime diagrams.

Tablet:
reduce graph complexity while preserving relationships.

Mobile:
code and runtime views should become vertically stacked.

Plugin marketplace cards should become compact list cards.

DESIGN SYSTEM

Use a consistent 4 / 8px spacing system.

Medium radius:
8–12px

Code surfaces can use slightly stronger radius but avoid very soft 20–30px SaaS cards.

Thin neutral borders.

Buttons should be simple and precise.

Primary button:
solid dark or accent

Secondary:
transparent / border

Use accent color primarily for:
interactive state
runtime state
links
active nodes
small highlights

Do not flood the page with the accent color.

FOOTER

Left:
DSHX

Tagline:
Build the DSH ecosystem.

Links:

Product
Docs
Examples
Plugins

Community
GitHub
Discussions

Resources
Release notes
Compatibility

Keep the footer spacious and editorial.

OVERALL IMPRESSION

The final website should feel like a mature open-source developer framework that could plausibly become the central development and distribution layer of the DSH plugin ecosystem.

Think:

Vite-level clarity
Biome-level technical presentation
Linear-level polish
Raycast extension ecosystem maturity
VS Code extension marketplace information density

But create a unique DSHX identity through:

the X motif
Host / Client duality
runtime composition
plugin graph
thin connection lines

The website should remain visually recognizable even if every word “DSHX” were removed.

Avoid generic AI SaaS visual language at all costs.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/0fd419b1-a38a-4c96-9c6e-9b392a2fe566).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
