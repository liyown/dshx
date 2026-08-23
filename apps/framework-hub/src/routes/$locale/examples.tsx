import { createFileRoute } from "@tanstack/react-router";
import { Container, SectionLabel, Chip } from "@/components/dshx/primitives";
import { CodeSurface, Code } from "@/components/dshx/code";
import { createTranslator, parseLocale, useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/$locale/examples")({
  head: ({ params }) => {
    const t = createTranslator(parseLocale(params.locale));
    return {
    meta: [
      { title: t("examples.title") + " — DSHX" },
      {
        name: "description",
        content: t("examples.title"),
      },
      { property: "og:title", content: t("examples.title") + " — DSHX" },
      {
        property: "og:description",
        content: t("examples.title"),
      },
    ],
    };
  },
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

const exampleCopy = {
  "hello-slot": {
    title: "examples.hello.title",
    tag: "examples.hello.tag",
    description: "examples.hello.description",
  },
  "search-tool": {
    title: "examples.search.title",
    tag: "examples.search.tag",
    description: "examples.search.description",
  },
  "typed-api": {
    title: "examples.api.title",
    tag: "examples.api.tag",
    description: "examples.api.description",
  },
  "runtime-hooks": {
    title: "examples.hooks.title",
    tag: "examples.hooks.tag",
    description: "examples.hooks.description",
  },
} as const;

function Examples() {
  const { t } = useI18n();
  return (
    <main>
      <Container className="py-16 md:py-24">
        <SectionLabel index="/examples">{t("examples.label")}</SectionLabel>
        <h1 className="text-balance-tight mt-6 text-[clamp(2rem,4.5vw,3.25rem)] leading-[1.05] font-medium">
          {t("examples.title")}
        </h1>

        <div className="mt-12 grid gap-6 lg:grid-cols-2">
          {examples.map((e) => (
            <div key={e.name} className="rounded-xl border border-border bg-surface p-5">
              <div className="flex items-center gap-2.5">
                <span className="font-mono text-[13.5px]">
                  {t(exampleCopy[e.name as keyof typeof exampleCopy].title)}
                </span>
                <Chip tone="accent">
                  {t(exampleCopy[e.name as keyof typeof exampleCopy].tag)}
                </Chip>
              </div>
              <p className="mt-2 text-[13.5px] leading-relaxed text-muted-foreground">
                {t(exampleCopy[e.name as keyof typeof exampleCopy].description)}
              </p>
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
