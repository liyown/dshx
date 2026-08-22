import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import {
  ButtonLink,
  Chip,
  Container,
  Lede,
  SectionHeading,
  SectionLabel,
  XMark,
} from "@/components/dshx/primitives";
import { Code, CodeSurface, Terminal } from "@/components/dshx/code";
import { RuntimeDiagram } from "@/components/dshx/runtime-diagram";
import { DevLoop } from "@/components/dshx/dev-loop";
import { PluginCard } from "@/components/dshx/plugin-card";
import { plugins } from "@/lib/plugins";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "DSHX — The developer framework for DSH plugins" },
      {
        name: "description",
        content:
          "Build DeepSeek Harness extensions with TypeScript, React, typed Host–Client APIs, HMR and direct access to the native DSH runtime.",
      },
      { property: "og:title", content: "DSHX — The developer framework for DSH plugins" },
      {
        property: "og:description",
        content:
          "TypeScript-first plugin authoring, React UI contributions, runtime inspection and a fast development loop for DSH.",
      },
    ],
  }),
  component: Home,
});

function Home() {
  return (
    <main>
      <Hero />
      <WhyDshx />
      <AuthoringModel />
      <DevelopmentLoop />
      <Inspection />
      <ProgressivePower />
      <ReactUi />
      <Ecosystem />
    </main>
  );
}

/* ---------------- hero ---------------- */

function Hero() {
  return (
    <section className="relative overflow-hidden border-b border-border">
      <div className="grid-lines pointer-events-none absolute inset-0 opacity-60" />
      <Container className="relative grid gap-14 py-20 md:py-28 lg:grid-cols-[1.05fr_1fr] lg:items-center">
        <div>
          <div className="flex items-center gap-2">
            <Chip tone="accent">v0.4.0</Chip>
            <span className="font-mono text-[11.5px] text-muted-foreground">
              compatible with dsh ^0.9
            </span>
          </div>
          <h1 className="text-balance-tight mt-6 text-[clamp(2.4rem,5.6vw,4.2rem)] leading-[1.02] font-medium">
            The developer framework for DSH plugins.
          </h1>
          <p className="mt-6 max-w-xl text-[16px] leading-relaxed text-muted-foreground">
            Build DSH extensions with TypeScript, React, fast development workflows, typed
            Host–Client communication, and direct access to the native DSH runtime.
          </p>
          <div className="mt-8 flex flex-wrap gap-2.5">
            <ButtonLink to="/docs">Get Started</ButtonLink>
            <ButtonLink href="https://github.com" variant="outline">
              View on GitHub
            </ButtonLink>
          </div>

          <div className="mt-10 max-w-md">
            <Terminal
              title="terminal"
              lines={[
                { text: "pnpm create dshx my-plugin", kind: "cmd" },
                { text: "cd my-plugin", kind: "cmd" },
                { text: "pnpm dev", kind: "cmd" },
                { text: "dshx dev · host + client watching", kind: "accent" },
              ]}
            />
          </div>
        </div>

        <RuntimeDiagram />
      </Container>
    </section>
  );
}

/* ---------------- why ---------------- */

const handled = [
  "Client bundle",
  "Module loader format",
  "React external",
  "CSS lifecycle",
  "Slot registration",
  "Profile linking",
  "HMR",
  "Source maps",
];

function WhyDshx() {
  return (
    <Section index="01" label="Why DSHX">
      <SectionHeading>Write the plugin. DSHX handles the machinery.</SectionHeading>
      <Lede className="mt-5">
        You describe contributions. DSHX resolves everything between your source files and the
        running DSH runtime — without hiding DSH itself.
      </Lede>

      <div className="mt-12 grid items-center gap-6 lg:grid-cols-[1fr_auto_1fr]">
        <CodeSurface title="src/client.tsx">
          <Code
            code={`export default defineClient({
  slots: [
    defineSlot('sidebar.footer.action', {
      component: Status,
    }),
  ],
})`}
          />
        </CodeSurface>

        <div className="flex items-center justify-center gap-3 lg:flex-col">
          <span className="h-px w-10 bg-border lg:h-10 lg:w-px" />
          <XMark className="size-6 text-accent" />
          <span className="h-px w-10 bg-border lg:h-10 lg:w-px" />
        </div>

        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border">
          {handled.map((h, i) => (
            <div
              key={h}
              className="animate-rise flex items-center gap-2 bg-surface px-3.5 py-3 font-mono text-[11.5px]"
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <span className="size-1 rounded-full bg-accent/70" />
              {h}
            </div>
          ))}
        </div>
      </div>
    </Section>
  );
}

/* ---------------- authoring ---------------- */

function AuthoringModel() {
  return (
    <Section index="02" label="Authoring model">
      <SectionHeading>One plugin. Two runtimes. One development model.</SectionHeading>
      <Lede className="mt-5">
        Host and Client are written side by side and linked by a typed contract that both sides
        import.
      </Lede>

      <div className="relative mt-12 grid gap-6 md:grid-cols-[1fr_140px_1fr] md:items-center">
        <CodeSurface title="src/host.ts">
          <Code
            code={`defineHost({
  tools: [searchTool],
  api: statusApi.host(...)
})`}
          />
        </CodeSurface>

        <div className="relative flex h-24 items-center justify-center md:h-40">
          <svg viewBox="0 0 140 160" className="h-full w-full" aria-hidden>
            <line
              x1="0"
              y1="60"
              x2="140"
              y2="100"
              stroke="currentColor"
              strokeWidth="1"
              className="text-border-strong"
            />
            <line
              x1="0"
              y1="100"
              x2="140"
              y2="60"
              stroke="currentColor"
              strokeWidth="1"
              className="text-border-strong"
            />
            <line
              x1="0"
              y1="60"
              x2="140"
              y2="100"
              stroke="currentColor"
              strokeWidth="1.25"
              className="animate-flow text-accent"
            />
            <line
              x1="140"
              y1="60"
              x2="0"
              y2="100"
              stroke="currentColor"
              strokeWidth="1.25"
              className="animate-flow text-accent"
            />
            <circle cx="70" cy="80" r="3" className="fill-accent" />
          </svg>
          <span className="absolute bottom-0 left-1/2 -translate-x-1/2 font-mono text-[10.5px] whitespace-nowrap text-muted-foreground">
            statusApi · typed contract
          </span>
        </div>

        <CodeSurface title="src/client.tsx">
          <Code
            code={`defineClient({
  api: statusApi,
  slots: [sidebarStatus]
})`}
          />
        </CodeSurface>
      </div>
    </Section>
  );
}

/* ---------------- dev loop ---------------- */

function DevelopmentLoop() {
  return (
    <Section index="03" label="Development loop">
      <SectionHeading>Save. See it. Keep going.</SectionHeading>
      <Lede className="mt-5">
        Client edits hot-reload into the running interface. Host edits rebuild and restart the
        runtime, then reconnect.
      </Lede>
      <div className="mt-12">
        <DevLoop />
      </div>
    </Section>
  );
}

/* ---------------- inspection ---------------- */

function Inspection() {
  return (
    <Section index="04" label="Runtime inspection">
      <SectionHeading>Extend the runtime you actually have.</SectionHeading>
      <Lede className="mt-5">
        Discovery flows backwards: read the live runtime, then generate source that targets exactly
        what exists.
      </Lede>

      <div className="mt-12 grid gap-6 lg:grid-cols-2">
        <Terminal
          title="dshx inspect"
          lines={[
            { text: "dshx inspect slots", kind: "cmd" },
            { text: "", kind: "dim" },
            { text: "sidebar.footer.action", kind: "accent" },
            { text: "conversation.chat.node", kind: "dim" },
            { text: "conversation.input.right", kind: "dim" },
            { text: "conversation.session", kind: "dim" },
          ]}
        />
        <Terminal
          title="dshx add"
          lines={[
            { text: "dshx add ui --slot sidebar.footer.action", kind: "cmd" },
            { text: "", kind: "dim" },
            { text: "created src/ui/sidebar-status.tsx", kind: "ok" },
            { text: "registered slot in src/client.tsx", kind: "dim" },
            { text: "typed props resolved from runtime", kind: "dim" },
          ]}
        />
      </div>
    </Section>
  );
}

/* ---------------- progressive power ---------------- */

const stages = [
  `defineHost({
  tools: [weather]
})`,
  `defineHost({
  tools: [weather],

  commands: [refresh],
})`,
  `defineHost({
  tools: [weather],

  commands: [refresh],

  api: weatherApi.host(...),

  setup(ctx) {
    ctx.on('agent/pre-step', ...)
  }
})`,
];

function ProgressivePower() {
  const [stage, setStage] = useState(0);
  return (
    <Section index="05" label="Progressive power">
      <SectionHeading>Start simple. Drop into DSH whenever you need.</SectionHeading>
      <Lede className="mt-5">
        DSHX gives you ergonomic authoring primitives, then gets out of the way: the Cordis context
        and native DSH APIs stay directly reachable.
      </Lede>

      <div className="mt-12 grid gap-6 lg:grid-cols-[220px_1fr] lg:items-start">
        <div className="flex gap-2 lg:flex-col">
          {["Minimal", "Commands", "Full runtime"].map((s, i) => (
            <button
              key={s}
              onMouseEnter={() => setStage(i)}
              onFocus={() => setStage(i)}
              onClick={() => setStage(i)}
              className={cn(
                "flex flex-1 items-center gap-3 rounded-lg border px-3 py-2.5 text-left font-mono text-[11.5px] transition-colors",
                stage === i
                  ? "border-accent/40 bg-accent-soft text-accent"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              <span>0{i + 1}</span>
              {s}
            </button>
          ))}
        </div>
        <CodeSurface title="src/host.ts">
          <Code code={stages[stage]!} />
        </CodeSurface>
      </div>
    </Section>
  );
}

/* ---------------- react ui ---------------- */

function ReactUi() {
  return (
    <Section index="06" label="React UI contributions">
      <SectionHeading>Real React inside the DSH interface.</SectionHeading>
      <Lede className="mt-5">
        Components, CSS Modules and typed slot props — rendered by DSH, authored like any modern
        React app.
      </Lede>

      <div className="mt-12 grid gap-6 lg:grid-cols-[1.1fr_1fr]">
        <CodeSurface title="src/ui/sidebar-status.tsx">
          <Code
            code={`import styles from './status.module.css'

export function Status({ session }: SlotProps<'sidebar.footer.action'>) {
  const { data } = useQuery(statusApi.get, { id: session.id })

  return (
    <div className={styles.root}>
      <span className={styles.dot} data-state={data?.state} />
      <span className={styles.label}>{data?.label ?? 'idle'}</span>
    </div>
  )
}`}
          />
        </CodeSurface>

        {/* mock DSH interface */}
        <div className="overflow-hidden rounded-xl border border-ink-border bg-ink">
          <div className="flex items-center justify-between border-b border-ink-border px-4 py-2.5 font-mono text-[11px] text-ink-muted">
            <span>DSH · workspace</span>
            <span>slot preview</span>
          </div>
          <div className="grid grid-cols-[150px_1fr] gap-px bg-ink-border">
            <div className="flex min-h-[280px] flex-col bg-ink p-3">
              <div className="space-y-2">
                {["Sessions", "Agents", "Tools", "Memory"].map((s) => (
                  <div key={s} className="rounded-md px-2 py-1.5 font-mono text-[11px] text-ink-muted">
                    {s}
                  </div>
                ))}
              </div>
              <div className="mt-auto rounded-lg border border-ink-accent/40 bg-ink-accent/10 px-2.5 py-2">
                <div className="flex items-center gap-2 font-mono text-[11px] text-ink-foreground">
                  <span className="animate-node-pulse size-1.5 rounded-full bg-ok" />
                  running · 3 tools
                </div>
                <div className="mt-1 font-mono text-[9.5px] text-ink-muted">
                  sidebar.footer.action
                </div>
              </div>
            </div>
            <div className="space-y-3 bg-ink p-4">
              {[72, 88, 46, 64].map((w, i) => (
                <div key={i} className="space-y-1.5">
                  <div className="h-1.5 rounded-full bg-ink-border" style={{ width: `${w}%` }} />
                  <div className="h-1.5 rounded-full bg-ink-border/60" style={{ width: `${w - 22}%` }} />
                </div>
              ))}
              <div className="mt-6 rounded-lg border border-ink-border p-3 font-mono text-[10.5px] text-ink-muted">
                typed slot props · SlotProps&lt;&#39;sidebar.footer.action&#39;&gt;
              </div>
            </div>
          </div>
        </div>
      </div>
    </Section>
  );
}

/* ---------------- ecosystem ---------------- */

function Ecosystem() {
  return (
    <Section index="07" label="Ecosystem">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <SectionHeading>Built for an ecosystem.</SectionHeading>
          <Lede className="mt-5">
            DSHX is the development framework. The community builds the ecosystem — open,
            versioned, compatibility-aware.
          </Lede>
        </div>
        <Link
          to="/plugins"
          className="group inline-flex items-center gap-2 text-[13.5px] text-accent"
        >
          Explore Plugins
          <span className="transition-transform group-hover:translate-x-0.5">→</span>
        </Link>
      </div>

      <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {plugins.slice(0, 6).map((p) => (
          <PluginCard key={p.slug} plugin={p} />
        ))}
      </div>
    </Section>
  );
}

/* ---------------- shared ---------------- */

function Section({
  index,
  label,
  children,
}: {
  index: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-b border-border py-20 md:py-28">
      <Container>
        <SectionLabel index={index}>{label}</SectionLabel>
        <div className="mt-8">{children}</div>
      </Container>
    </section>
  );
}
