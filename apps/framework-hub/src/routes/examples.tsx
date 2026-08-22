import { createFileRoute } from "@tanstack/react-router";
import { Container, SectionLabel, Chip } from "@/components/dshx/primitives";
import { CodeSurface, Code } from "@/components/dshx/code";

export const Route = createFileRoute("/examples")({
  head: () => ({
    meta: [
      { title: "Examples — DSHX plugin patterns" },
      {
        name: "description",
        content:
          "Reference DSHX plugins: host tools, React slot contributions, typed Host–Client APIs and runtime hooks.",
      },
      { property: "og:title", content: "Examples — DSHX plugin patterns" },
      {
        property: "og:description",
        content: "Small, complete DSHX plugins you can read end to end.",
      },
    ],
  }),
  component: Examples,
});

const examples = [
  {
    name: "hello-slot",
    tag: "UI",
    desc: "A single React slot contribution with typed props and CSS Modules.",
    code: `defineClient({
  slots: [
    defineSlot('sidebar.footer.action', { component: Hello }),
  ],
})`,
  },
  {
    name: "search-tool",
    tag: "Tools",
    desc: "A host-side tool with a zod input schema and streamed results.",
    code: `defineHost({
  tools: [
    tool('search', { input: z.object({ q: z.string() }) }, run),
  ],
})`,
  },
  {
    name: "typed-api",
    tag: "Host ↔ Client",
    desc: "A shared API contract imported by both runtimes.",
    code: `export const statusApi = defineApi({
  get: contract<{ id: string }, Status>(),
})`,
  },
  {
    name: "runtime-hooks",
    tag: "Agent",
    desc: "Direct Cordis context access for lifecycle events.",
    code: `setup(ctx) {
  ctx.on('agent/pre-step', step => audit(step))
}`,
  },
];

function Examples() {
  return (
    <main>
      <Container className="py-16 md:py-24">
        <SectionLabel index="/examples">Reference plugins</SectionLabel>
        <h1 className="text-balance-tight mt-6 text-[clamp(2rem,4.5vw,3.25rem)] leading-[1.05] font-medium">
          Small plugins, read end to end.
        </h1>

        <div className="mt-12 grid gap-6 lg:grid-cols-2">
          {examples.map((e) => (
            <div key={e.name} className="rounded-xl border border-border bg-surface p-5">
              <div className="flex items-center gap-2.5">
                <span className="font-mono text-[13.5px]">{e.name}</span>
                <Chip tone="accent">{e.tag}</Chip>
              </div>
              <p className="mt-2 text-[13.5px] leading-relaxed text-muted-foreground">{e.desc}</p>
              <CodeSurface className="mt-4" dots={false} title={`${e.name}/src`}>
                <Code code={e.code} />
              </CodeSurface>
            </div>
          ))}
        </div>
      </Container>
    </main>
  );
}
