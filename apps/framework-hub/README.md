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
Changelog

Secondary:
GitHub

Primary CTA:
Get Started

“Plugins” should already exist in the navigation even if the first release only shows a preview / coming-soon ecosystem page.

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

pnpm create dshx my-plugin
cd my-plugin
pnpm dev

The hero visual should NOT be a generic browser mockup.

Create an animated runtime composition diagram.

Example visual structure:

src/host.ts
      \
       \
        DSHX
       /    \
 Host        Client
  |            |
 Tool         React Slot
 API          useQuery
   \           /
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
  api: statusApi.host(...)
})

Client:

defineClient({
  api: statusApi,
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

  api: weatherApi.host(...),

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

SECTION — PLUGIN ECOSYSTEM PREVIEW

This section is critical for future expansion.

Headline:

“Built for an ecosystem.”

Introduce a preview of the future DSH plugin community.

Show a marketplace-like layout containing 6–8 fictional plugin cards.

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
Changelog

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
Changelog
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
