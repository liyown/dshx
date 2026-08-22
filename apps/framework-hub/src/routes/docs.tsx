import { createFileRoute } from "@tanstack/react-router";
import { Container, SectionLabel, ButtonLink } from "@/components/dshx/primitives";
import { Terminal, CodeSurface, Code } from "@/components/dshx/code";

export const Route = createFileRoute("/docs")({
  head: () => ({
    meta: [
      { title: "Get Started — DSHX docs" },
      {
        name: "description",
        content:
          "Scaffold a DSH plugin with DSHX: install, run the dev loop, define host tools and React slots, and ship a production build.",
      },
      { property: "og:title", content: "Get Started — DSHX docs" },
      {
        property: "og:description",
        content: "Install DSHX, scaffold a plugin and understand the Host–Client model.",
      },
    ],
  }),
  component: Docs,
});

const steps = [
  {
    n: "01",
    title: "Scaffold",
    body: "Create a plugin workspace with host, client and a typed API contract already wired.",
  },
  {
    n: "02",
    title: "Develop",
    body: "dshx dev watches both runtimes. Client edits hot-reload, host edits restart the runtime.",
  },
  {
    n: "03",
    title: "Inspect",
    body: "Read the live runtime with dshx inspect, then generate source against real slots.",
  },
  {
    n: "04",
    title: "Build",
    body: "dshx build emits the production plugin bundle with source maps and loader metadata.",
  },
];

function Docs() {
  return (
    <main>
      <Container className="py-16 md:py-24">
        <SectionLabel index="/docs">Get started</SectionLabel>
        <h1 className="text-balance-tight mt-6 text-[clamp(2rem,4.5vw,3.25rem)] leading-[1.05] font-medium">
          From zero to a running DSH plugin.
        </h1>

        <div className="mt-10 max-w-lg">
          <Terminal
            title="terminal"
            lines={[
              { text: "pnpm create dshx my-plugin", kind: "cmd" },
              { text: "cd my-plugin", kind: "cmd" },
              { text: "pnpm dev", kind: "cmd" },
              { text: "host ready · client watching · 1 slot", kind: "ok" },
            ]}
          />
        </div>

        <div className="mt-14 grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-2">
          {steps.map((s) => (
            <div key={s.n} className="bg-surface p-6">
              <span className="font-mono text-[11px] text-accent">{s.n}</span>
              <h2 className="mt-3 text-[16px] font-medium">{s.title}</h2>
              <p className="mt-2 text-[13.5px] leading-relaxed text-muted-foreground">{s.body}</p>
            </div>
          ))}
        </div>

        <div className="mt-14 grid gap-6 lg:grid-cols-2">
          <CodeSurface title="src/host.ts">
            <Code
              code={`import { defineHost } from 'dshx/host'
import { searchTool } from './tools/search'
import { statusApi } from './shared/api'

export default defineHost({
  tools: [searchTool],
  api: statusApi.host(ctx => ({
    get: async ({ id }) => ctx.sessions.state(id),
  })),
})`}
            />
          </CodeSurface>
          <CodeSurface title="src/client.tsx">
            <Code
              code={`import { defineClient, defineSlot } from 'dshx/client'
import { statusApi } from './shared/api'
import { Status } from './ui/sidebar-status'

export default defineClient({
  api: statusApi,
  slots: [
    defineSlot('sidebar.footer.action', { component: Status }),
  ],
})`}
            />
          </CodeSurface>
        </div>

        <div className="mt-14 flex flex-wrap gap-2.5">
          <ButtonLink href="https://github.com">View on GitHub</ButtonLink>
          <ButtonLink to="/examples" variant="outline">
            Browse examples
          </ButtonLink>
        </div>
      </Container>
    </main>
  );
}
