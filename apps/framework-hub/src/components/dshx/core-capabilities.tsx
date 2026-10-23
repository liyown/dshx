import {
  Blocks,
  Braces,
  Check,
  Component,
  Paintbrush,
  RefreshCw,
  ScanSearch,
  WandSparkles,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { createTranslator, type Translate } from "@/lib/i18n";
import { useI18n } from "@/lib/i18n/use-i18n";
import { cn } from "@/lib/utils";
import { Code } from "./code";
import { Lede, SectionHeading } from "./primitives";

type CapabilityId = "contributions" | "hmr" | "react" | "tailwind" | "inspect" | "add" | "api";

type DemoLine = {
  text: string;
  kind?: "cmd" | "dim" | "ok" | "accent";
};

type Demo =
  | {
      kind: "code";
      title: string;
      language: string;
      code: string;
      highlightLines?: number[];
    }
  | {
      kind: "terminal";
      title: string;
      language: string;
      lines: DemoLine[];
    };

type CapabilityCopy = {
  title: string;
  body: string;
  bullets: readonly [string, string, string];
  status: string;
};

type Capability = CapabilityCopy & {
  id: CapabilityId;
  icon: LucideIcon;
  demo: Demo;
};

const order: CapabilityId[] = [
  "contributions",
  "hmr",
  "react",
  "tailwind",
  "inspect",
  "add",
  "api",
];

const icons: Record<CapabilityId, LucideIcon> = {
  contributions: Blocks,
  hmr: RefreshCw,
  react: Component,
  tailwind: Paintbrush,
  inspect: ScanSearch,
  add: WandSparkles,
  api: Braces,
};

const demos: Record<CapabilityId, Demo> = {
  contributions: {
    kind: "code",
    title: "src/host.ts",
    language: "TypeScript",
    code: `import { defineHost } from '@becomeopc/dshx/host'

export default defineHost({
  tools: [statusTool],
  commands: [refreshCommand],
  prompts: [guidance, runtimeContext],
  settings: [runtimeSettings],
  apis: [statusApi.host(handlers)],
})`,
    highlightLines: [3, 4, 5, 6, 7, 8],
  },
  hmr: {
    kind: "terminal",
    title: "dshx dev",
    language: "build-watch",
    lines: [
      { text: "pnpm dev", kind: "cmd" },
      { text: "client rebuilt · native HMR applied", kind: "accent" },
      { text: "host process unchanged", kind: "ok" },
      { text: "", kind: "dim" },
      { text: "host rebuilt · runtime restarted", kind: "accent" },
      { text: "tools · prompts · settings restored", kind: "ok" },
      { text: "", kind: "dim" },
      { text: "config invalid · last-good session kept", kind: "dim" },
    ],
  },
  react: {
    kind: "code",
    title: "src/ui/runtime-status.tsx",
    language: "TypeScript React",
    code: `const statusSlot = defineSlot('sidebar.footer.action', {
  component: RuntimeStatus,
})

function RuntimeStatus({ session }: PropsRuntime<'sidebar.footer.action'>) {
  const settings = useSettings(runtimeSettings)
  const status = useApiQuery(statusApi, 'get', {
    input: { id: session.id },
  })
  const showActivity = settings.value?.showActivity ?? true

  return <StatusBadge state={status.data?.state} compact={!showActivity} />
}`,
    highlightLines: [1, 2, 5, 6, 7, 8, 10, 12],
  },
  tailwind: {
    kind: "code",
    title: "dshx.config.ts",
    language: "Vite · Tailwind v4",
    code: `import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from '@becomeopc/dshx'

export default defineConfig({
  client: {
    vite: {
      plugins: [tailwindcss()],
    },
  },
})

// src/styles.css
// @import "tailwindcss/utilities.css" prefix(dshx);`,
    highlightLines: [1, 4, 5, 6, 7, 8, 9, 13],
  },
  inspect: {
    kind: "terminal",
    title: "runtime composition",
    language: "read-only",
    lines: [
      { text: "dshx check --runtime", kind: "cmd" },
      { text: "runtime ready · protocol-2", kind: "ok" },
      { text: "", kind: "dim" },
      { text: "dshx inspect slots --root sidebar", kind: "cmd" },
      { text: "sidebar.footer.action", kind: "accent" },
      { text: "", kind: "dim" },
      { text: "dshx inspect services --json", kind: "cmd" },
      { text: "dshx inspect events --json", kind: "cmd" },
    ],
  },
  add: {
    kind: "terminal",
    title: "source generation",
    language: "transactional",
    lines: [
      { text: "dshx add ui --slot sidebar.footer.action --dry-run", kind: "cmd" },
      { text: "Planned UI Slot sidebar.footer.action", kind: "accent" },
      { text: "validation passed · no files written", kind: "ok" },
      { text: "", kind: "dim" },
      { text: "dshx add ui --slot sidebar.footer.action", kind: "cmd" },
      { text: "Generated UI Slot sidebar.footer.action", kind: "ok" },
      { text: "src/slots/sidebar-footer-action.tsx", kind: "dim" },
      { text: "src/client.tsx", kind: "dim" },
    ],
  },
  api: {
    kind: "code",
    title: "src/shared/status-api.ts",
    language: "Standard Schema",
    code: `export const statusApi = defineApi({
  id: 'status',
  version: 1,
  methods: {
    get: method<
      { id: string },
      { state: 'idle' | 'running' }
    >(),
  },
})

// Host: exact handlers
statusApi.host({ get: async ({ input }) => readStatus(input.id) })

// Client: inferred input and output
useApiQuery(statusApi, 'get', { input: { id } })`,
    highlightLines: [1, 4, 5, 6, 7, 8, 13, 16],
  },
};

function capabilityCopy(t: Translate, id: CapabilityId): CapabilityCopy {
  return {
    title: t(`home.capabilities.${id}.title`),
    body: t(`home.capabilities.${id}.body`),
    bullets: [
      t(`home.capabilities.${id}.bullet1`),
      t(`home.capabilities.${id}.bullet2`),
      t(`home.capabilities.${id}.bullet3`),
    ],
    status: t(`home.capabilities.${id}.status`),
  };
}

function CapabilityStage({ capability, index }: { capability: Capability; index: number }) {
  const demo = capability.demo;
  return (
    <div
      data-capability-stage
      className="flex min-h-[27rem] flex-col overflow-hidden rounded-xl border border-ink-border bg-ink text-ink-foreground lg:min-h-[30rem]"
    >
      <div className="flex items-center gap-3 border-b border-ink-border px-4 py-3">
        <span className="flex gap-1.5" aria-hidden>
          <span className="size-[7px] rounded-full bg-ink-border" />
          <span className="size-[7px] rounded-full bg-ink-border" />
          <span className="size-[7px] rounded-full bg-ink-border" />
        </span>
        <span
          key={`${capability.id}-title`}
          className="animate-in slide-in-from-bottom-2 min-w-0 truncate font-mono text-[11px] text-ink-muted duration-300 ease-out motion-reduce:animate-none"
        >
          {demo.title}
        </span>
        <span
          key={`${capability.id}-count`}
          className="animate-in slide-in-from-bottom-2 ml-auto shrink-0 font-mono text-[10px] text-ink-muted duration-300 ease-out motion-reduce:animate-none"
        >
          {String(index + 1).padStart(2, "0")} / {String(order.length).padStart(2, "0")}
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-x-auto p-5 sm:p-6">
        <div
          key={`${capability.id}-content`}
          className="animate-in slide-in-from-bottom-2 duration-300 ease-out motion-reduce:animate-none"
        >
          {demo.kind === "code" ? (
            <Code
              code={demo.code}
              highlightLines={demo.highlightLines ?? []}
              lineNumbers
              className="min-w-max text-[11.5px] sm:text-[12.5px]"
            />
          ) : (
            <div className="font-mono text-[11.5px] leading-[2] sm:text-[12.5px]">
              {demo.lines.map((line, lineIndex) => (
                <div
                  key={`${line.text}-${lineIndex}`}
                  className={cn(
                    line.kind === "ok" && "text-ok",
                    line.kind === "accent" && "text-ink-accent",
                    (line.kind === "dim" || line.kind === undefined) && "text-ink-muted",
                    line.kind === "cmd" && "text-ink-foreground",
                  )}
                >
                  {line.kind === "cmd" ? <span className="mr-2 text-ink-accent">$</span> : null}
                  {line.text || "\u00a0"}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 border-t border-ink-border px-4 py-3 font-mono text-[10.5px] text-ink-muted sm:px-6">
        <Check className="size-3.5 shrink-0 text-ok" strokeWidth={1.8} />
        <span
          key={`${capability.id}-status`}
          className="animate-in slide-in-from-bottom-2 truncate duration-300 ease-out motion-reduce:animate-none"
        >
          {capability.status}
        </span>
        <span
          key={`${capability.id}-language`}
          className="animate-in slide-in-from-bottom-2 ml-auto hidden shrink-0 text-ink-accent duration-300 ease-out motion-reduce:animate-none sm:inline"
        >
          {demo.language}
        </span>
      </div>
    </div>
  );
}

function FeatureCopy({ capability }: { capability: Capability }) {
  const Icon = capability.icon;
  return (
    <>
      <div className="flex items-center gap-3">
        <Icon className="size-6 text-accent" strokeWidth={1.5} aria-hidden />
        <h3 className="text-[clamp(1.45rem,2.7vw,2rem)] leading-tight font-medium">
          {capability.title}
        </h3>
      </div>
      <p className="mt-5 max-w-[36rem] text-[15px] leading-relaxed text-muted-foreground">
        {capability.body}
      </p>
      <ul className="mt-6 space-y-3">
        {capability.bullets.map((bullet) => (
          <li
            key={bullet}
            className="flex gap-3 text-[13.5px] leading-relaxed text-muted-foreground"
          >
            <Check className="mt-0.5 size-4 shrink-0 text-accent" strokeWidth={1.7} aria-hidden />
            <span>{bullet}</span>
          </li>
        ))}
      </ul>
    </>
  );
}

export function CoreCapabilities() {
  const { locale } = useI18n();
  const t = createTranslator(locale);
  const [activeIndex, setActiveIndex] = useState(0);
  const itemRefs = useRef<Array<HTMLElement | null>>([]);
  const capabilities: Capability[] = order.map((id) => ({
    id,
    icon: icons[id],
    demo: demos[id],
    ...capabilityCopy(t, id),
  }));
  const active = capabilities[activeIndex] ?? capabilities[0]!;
  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 1024px)");
    let frame = 0;

    const update = () => {
      frame = 0;
      if (!desktop.matches) return;

      const viewportCenter = window.innerHeight / 2;
      let closestIndex = 0;
      let closestDistance = Number.POSITIVE_INFINITY;

      itemRefs.current.forEach((item, index) => {
        if (!item) return;
        const rect = item.getBoundingClientRect();
        const distance = Math.abs(rect.top + rect.height / 2 - viewportCenter);
        if (distance < closestDistance) {
          closestDistance = distance;
          closestIndex = index;
        }
      });

      setActiveIndex((current) => (current === closestIndex ? current : closestIndex));
    };

    const scheduleUpdate = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(update);
    };

    scheduleUpdate();
    window.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("resize", scheduleUpdate);
    desktop.addEventListener("change", scheduleUpdate);

    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("resize", scheduleUpdate);
      desktop.removeEventListener("change", scheduleUpdate);
    };
  }, []);

  return (
    <>
      <SectionHeading>{t("home.capabilities.title")}</SectionHeading>
      <Lede className="mt-5">{t("home.capabilities.body")}</Lede>

      <div className="mt-14 space-y-20 lg:hidden">
        {capabilities.map((capability, index) => (
          <article key={capability.id} className="space-y-9">
            <div>
              <FeatureCopy capability={capability} />
            </div>
            <CapabilityStage capability={capability} index={index} />
          </article>
        ))}
      </div>

      <div className="mt-4 hidden w-[calc(100%+140px)] max-w-[calc(100vw-3rem)] lg:grid lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.3fr)] lg:gap-16 xl:gap-20">
        <div>
          {capabilities.map((capability, index) => (
            <article
              key={capability.id}
              ref={(node) => {
                itemRefs.current[index] = node;
              }}
              data-capability-index={index}
              aria-current={activeIndex === index ? "step" : undefined}
              className={cn(
                "flex min-h-[50vh] flex-col py-12 transition-opacity duration-300 motion-reduce:transition-none",
                activeIndex === index ? "opacity-100" : "opacity-25",
              )}
            >
              <FeatureCopy capability={capability} />
            </article>
          ))}
        </div>

        <div className="min-w-0">
          <div className="sticky top-[25vh] py-12" aria-live="polite">
            <CapabilityStage capability={active} index={activeIndex} />
          </div>
        </div>
      </div>
    </>
  );
}
