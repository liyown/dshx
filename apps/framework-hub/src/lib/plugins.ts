export type Badge = "official" | "verified" | "community";

export type Plugin = {
  slug: string;
  name: string;
  scope: string;
  description: string;
  author: string;
  version: string;
  compat: string;
  updated: string;
  category: string;
  stars: number;
  downloads: string;
  badge: Badge;
  glyph: string;
  featured?: boolean;
  trending?: boolean;
  isNew?: boolean;
};

export const categories = [
  "Tools",
  "UI",
  "Agent",
  "Memory",
  "Models",
  "Workflow",
  "Developer Tools",
  "Integrations",
] as const;

export const plugins: Plugin[] = [
  {
    slug: "memory",
    name: "Memory",
    scope: "@dsh/memory",
    description:
      "Persistent long-term recall for sessions, with typed retrieval tools and a sidebar timeline.",
    author: "dsh-core",
    version: "1.4.2",
    compat: "dsh ^0.9",
    updated: "2 days ago",
    category: "Memory",
    stars: 1284,
    downloads: "42.1k",
    badge: "official",
    glyph: "M",
    featured: true,
    trending: true,
  },
  {
    slug: "github",
    name: "GitHub",
    scope: "@dsh/github",
    description:
      "Read issues, review diffs and open pull requests from the conversation surface.",
    author: "dsh-core",
    version: "2.0.0",
    compat: "dsh ^0.9",
    updated: "5 days ago",
    category: "Integrations",
    stars: 967,
    downloads: "31.8k",
    badge: "official",
    glyph: "G",
    featured: true,
    trending: true,
  },
  {
    slug: "browser-tools",
    name: "Browser Tools",
    scope: "@lattice/browser-tools",
    description:
      "Headless navigation, DOM extraction and screenshot tools exposed to the host runtime.",
    author: "lattice",
    version: "0.8.7",
    compat: "dsh ^0.8 — ^0.9",
    updated: "1 week ago",
    category: "Tools",
    stars: 743,
    downloads: "18.2k",
    badge: "verified",
    glyph: "B",
    featured: true,
    trending: true,
  },
  {
    slug: "model-router",
    name: "Model Router",
    scope: "@lattice/model-router",
    description:
      "Route steps across providers with cost ceilings, fallbacks and per-task overrides.",
    author: "nkr",
    version: "0.5.1",
    compat: "dsh ^0.9",
    updated: "3 days ago",
    category: "Models",
    stars: 612,
    downloads: "12.9k",
    badge: "verified",
    glyph: "R",
    trending: true,
  },
  {
    slug: "workspace-explorer",
    name: "Workspace Explorer",
    scope: "@community/workspace-explorer",
    description:
      "A file tree slot with typed previews, fuzzy jump and inline diff rendering.",
    author: "hana.dev",
    version: "0.3.0",
    compat: "dsh ^0.9",
    updated: "yesterday",
    category: "UI",
    stars: 389,
    downloads: "7.4k",
    badge: "community",
    glyph: "W",
    isNew: true,
  },
  {
    slug: "agent-teams",
    name: "Agent Teams",
    scope: "@community/agent-teams",
    description:
      "Compose multiple agents with shared context, handoffs and a live coordination graph.",
    author: "mkrs",
    version: "0.2.4",
    compat: "dsh ^0.9",
    updated: "4 days ago",
    category: "Agent",
    stars: 428,
    downloads: "6.1k",
    badge: "community",
    glyph: "A",
    isNew: true,
    trending: true,
  },
  {
    slug: "trace-inspector",
    name: "Trace Inspector",
    scope: "@lattice/trace-inspector",
    description:
      "Step-level timing, tool call payloads and slot render traces in a dockable panel.",
    author: "lattice",
    version: "1.1.0",
    compat: "dsh ^0.9",
    updated: "6 days ago",
    category: "Developer Tools",
    stars: 521,
    downloads: "9.8k",
    badge: "verified",
    glyph: "T",
  },
  {
    slug: "pipelines",
    name: "Pipelines",
    scope: "@community/pipelines",
    description:
      "Declarative multi-step workflows with retries, checkpoints and typed step contracts.",
    author: "obr",
    version: "0.6.2",
    compat: "dsh ^0.8 — ^0.9",
    updated: "2 weeks ago",
    category: "Workflow",
    stars: 274,
    downloads: "4.3k",
    badge: "community",
    glyph: "P",
    isNew: true,
  },
];

export const getPlugin = (slug: string) => plugins.find((p) => p.slug === slug);
