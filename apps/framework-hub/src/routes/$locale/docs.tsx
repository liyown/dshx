import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";

import { Code, CodeSurface, Terminal } from "@/components/dshx/code";
import { Container } from "@/components/dshx/primitives";
import { createTranslator, parseLocale, useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/$locale/docs")({
  head: ({ params }) => {
    const t = createTranslator(parseLocale(params.locale));
    return {
      meta: [
        { title: `${t("docs.title")} — DSHX docs` },
        { name: "description", content: t("docs.step.scaffold.body") },
        { property: "og:title", content: `${t("docs.title")} — DSHX docs` },
        { property: "og:description", content: t("docs.step.develop.body") },
      ],
    };
  },
  component: Docs,
});

type DocLink = { id: string; label: string };
type DocRow = { name: string; type: string; body: string };

type DocsCopy = {
  eyebrow: string;
  title: string;
  intro: string;
  version: string;
  navLabel: string;
  mobileNav: string;
  groups: { label: string; links: DocLink[] }[];
  quickstart: string;
  quickstartBody: string;
  ready: string;
  installation: string;
  installationBody: string;
  newProject: string;
  existingProject: string;
  installNote: string;
  projectStructure: string;
  projectStructureBody: string;
  workflow: string;
  workflowBody: string;
  workflowSteps: { title: string; body: string }[];
  inspection: string;
  inspectionBody: string;
  hostApi: string;
  hostApiBody: string;
  hostRows: DocRow[];
  clientApi: string;
  clientApiBody: string;
  clientRows: DocRow[];
  typedApi: string;
  typedApiBody: string;
  cli: string;
  cliBody: string;
  cliRows: { command: string; body: string }[];
  next: string;
  nextBody: string;
  plugins: string;
  github: string;
};

const copy: Record<"en" | "zh", DocsCopy> = {
  en: {
    eyebrow: "Documentation",
    title: "Build a DSH plugin with DSHX",
    intro:
      "Learn the project model, development loop, runtime inspection, and the APIs used to contribute Host tools and Client UI.",
    version: "DSHX 0.1",
    navLabel: "Documentation navigation",
    mobileNav: "On this page",
    groups: [
      {
        label: "Getting started",
        links: [
          { id: "overview", label: "Overview" },
          { id: "installation", label: "Installation" },
          { id: "project-structure", label: "Project structure" },
        ],
      },
      {
        label: "Guides",
        links: [
          { id: "development-workflow", label: "Development workflow" },
          { id: "runtime-inspection", label: "Runtime inspection" },
        ],
      },
      {
        label: "API reference",
        links: [
          { id: "host-api", label: "Host API" },
          { id: "client-api", label: "Client & Slot API" },
          { id: "typed-api", label: "Typed Host–Client API" },
          { id: "cli-reference", label: "CLI reference" },
        ],
      },
    ],
    quickstart: "Quick start",
    quickstartBody:
      "The initializer creates a complete plugin with conventional Host and Client entries, installs dependencies, and adds a development script.",
    ready: "host ready · client watching · DSH opened",
    installation: "Installation",
    installationBody:
      "Start with the project initializer for a new plugin. Add the packages directly only when integrating DSHX into an existing package.",
    newProject: "New project",
    existingProject: "Existing project",
    installNote:
      "The generated project pins the matching DSHX release and declares the compatible DSH 0.1 protocol range. The initializer never overwrites an existing directory.",
    projectStructure: "Project structure",
    projectStructureBody:
      "Host and Client run in different environments but ship as one plugin package. Shared contracts live in ordinary TypeScript modules.",
    workflow: "Development workflow",
    workflowBody:
      "DSHX coordinates both build targets and links the project through the official DSH CLI. Client and Host changes intentionally follow different refresh paths.",
    workflowSteps: [
      {
        title: "Run the development session",
        body: "pnpm dev starts both watchers, links the current project, and opens DSH after every enabled entry builds successfully.",
      },
      {
        title: "Edit the Client",
        body: "Changes to src/client.tsx and React UI use DSH native Client HMR, so the interface updates without restarting the Host.",
      },
      {
        title: "Edit the Host",
        body: "Host changes rebuild the Node entry. Press r in the interactive session when a restart is required; press q to close it.",
      },
      {
        title: "Validate before publishing",
        body: "Run dshx check to validate package metadata and compatibility, then dshx build to create production artifacts.",
      },
    ],
    inspection: "Runtime inspection",
    inspectionBody:
      "Inspect reads the live DSH composition instead of inventing an offline catalog. Discover a Slot first, then scaffold against its exact runtime contract.",
    hostApi: "Host API",
    hostApiBody:
      "The Host runs in Node and has direct access to the official Cordis Context. DSHX keeps this layer thin: defineHost describes setup and contributions, while defineTool is the official DSH helper.",
    hostRows: [
      { name: "inject", type: "string[]", body: "Declares ordered Cordis service dependencies." },
      {
        name: "tools",
        type: "ToolDefinition[]",
        body: "Registers official DSH tools during Host setup.",
      },
      { name: "setup", type: "(ctx) => void", body: "Runs with the native Host Cordis Context." },
    ],
    clientApi: "Client and Slot API",
    clientApiBody:
      "The Client runs in the DSH browser runtime. defineClient declares Client dependencies and Slot contributions; defineSlot keeps the provider's SlotMap types intact.",
    clientRows: [
      {
        name: "defineClient",
        type: "ClientDefinition",
        body: "Defines Client setup, service injection, and ordered Slots.",
      },
      {
        name: "defineSlot",
        type: "SlotContribution",
        body: "Binds a React component to an official typed Slot.",
      },
      {
        name: "setup",
        type: "(ctx) => void",
        body: "Receives the native Client Cordis Context outside React.",
      },
    ],
    typedApi: "Typed Host–Client API",
    typedApiBody:
      "Define a transport contract once, register handlers in the Host, and consume the inferred client from React. Method input and output types stay synchronized.",
    cli: "CLI reference",
    cliBody:
      "All commands operate on the nearest plugin project. Add --json for automation where supported and --dry-run before scaffold or repair writes.",
    cliRows: [
      { command: "dshx dev", body: "Build, link, watch, and run the plugin in DSH." },
      {
        command: "dshx build",
        body: "Validate the manifest and emit enabled Host and Client artifacts.",
      },
      {
        command: "dshx check",
        body: "Check manifest, compatibility, Profile link, and runtime bridge status.",
      },
      {
        command: "dshx inspect slots",
        body: "Read live Slots, Tools, Services, or Events from the running composition.",
      },
      {
        command: "dshx add ui --slot <name>",
        body: "Generate and register a typed React Slot contribution.",
      },
      {
        command: "dshx add tool --name <name>",
        body: "Generate an official Host Tool and attach it to defineHost.",
      },
      { command: "dshx add hook --event <name>", body: "Generate a native Cordis event listener." },
    ],
    next: "Build on the runtime",
    nextBody:
      "Browse the plugin registry for real integrations, or open the repository for compatibility details and lower-level implementation notes.",
    plugins: "Explore plugins",
    github: "Open GitHub",
  },
  zh: {
    eyebrow: "开发文档",
    title: "使用 DSHX 构建 DSH 插件",
    intro: "了解项目模型、开发循环、Runtime 检查，以及如何通过 API 贡献 Host 工具和 Client UI。",
    version: "DSHX 0.1",
    navLabel: "文档导航",
    mobileNav: "本页目录",
    groups: [
      {
        label: "开始使用",
        links: [
          { id: "overview", label: "概览" },
          { id: "installation", label: "安装" },
          { id: "project-structure", label: "项目结构" },
        ],
      },
      {
        label: "开发指南",
        links: [
          { id: "development-workflow", label: "开发流程" },
          { id: "runtime-inspection", label: "Runtime 检查" },
        ],
      },
      {
        label: "API 参考",
        links: [
          { id: "host-api", label: "Host API" },
          { id: "client-api", label: "Client 与 Slot API" },
          { id: "typed-api", label: "Host–Client 类型化 API" },
          { id: "cli-reference", label: "CLI 参考" },
        ],
      },
    ],
    quickstart: "快速开始",
    quickstartBody:
      "初始化器会创建带有标准 Host、Client 入口的完整插件，安装依赖，并写入开发脚本。",
    ready: "Host 就绪 · Client 监听中 · DSH 已打开",
    installation: "安装",
    installationBody: "新插件优先使用项目初始化器。只有把 DSHX 接入已有包时，才需要直接安装依赖。",
    newProject: "新建项目",
    existingProject: "已有项目",
    installNote:
      "生成的项目会固定匹配的 DSHX 版本，并声明兼容的 DSH 0.1 协议范围。初始化器不会覆盖已有目录。",
    projectStructure: "项目结构",
    projectStructureBody:
      "Host 与 Client 运行在不同环境中，但最终作为同一个插件包发布；共享契约使用普通 TypeScript 模块。",
    workflow: "开发流程",
    workflowBody:
      "DSHX 协调两个构建目标，并通过官方 DSH CLI 关联当前项目。Client 与 Host 的刷新路径有意保持不同。",
    workflowSteps: [
      {
        title: "启动开发会话",
        body: "pnpm dev 启动两个 watcher、关联当前项目，并在所有入口首次构建成功后打开 DSH。",
      },
      {
        title: "修改 Client",
        body: "src/client.tsx 与 React UI 的修改复用 DSH 原生 Client HMR，不会重启 Host。",
      },
      {
        title: "修改 Host",
        body: "Host 修改会重新构建 Node 入口。需要重启时在交互会话中按 r，按 q 关闭会话。",
      },
      {
        title: "发布前验证",
        body: "先运行 dshx check 检查元数据与兼容性，再使用 dshx build 生成生产产物。",
      },
    ],
    inspection: "Runtime 检查",
    inspectionBody:
      "Inspect 读取正在运行的 DSH Composition，而不是虚构离线目录。先发现 Slot，再针对精确的 Runtime 契约生成代码。",
    hostApi: "Host API",
    hostApiBody:
      "Host 运行在 Node 中，可以直接访问官方 Cordis Context。DSHX 只提供薄封装：defineHost 描述初始化和贡献，defineTool 仍是 DSH 官方实现。",
    hostRows: [
      { name: "inject", type: "string[]", body: "声明有顺序的 Cordis Service 依赖。" },
      { name: "tools", type: "ToolDefinition[]", body: "在 Host 初始化阶段注册官方 DSH Tool。" },
      { name: "setup", type: "(ctx) => void", body: "使用原生 Host Cordis Context 执行逻辑。" },
    ],
    clientApi: "Client 与 Slot API",
    clientApiBody:
      "Client 运行在 DSH 浏览器 Runtime。defineClient 声明 Client 依赖与 Slot 贡献；defineSlot 保留 Provider 的 SlotMap 类型。",
    clientRows: [
      {
        name: "defineClient",
        type: "ClientDefinition",
        body: "定义 Client 初始化、Service 注入与有序 Slot。",
      },
      {
        name: "defineSlot",
        type: "SlotContribution",
        body: "把 React 组件绑定到官方类型化 Slot。",
      },
      {
        name: "setup",
        type: "(ctx) => void",
        body: "在 React 之外接收原生 Client Cordis Context。",
      },
    ],
    typedApi: "Host–Client 类型化 API",
    typedApiBody:
      "只定义一次传输契约，在 Host 注册处理器，再从 React 使用推导后的 Client；方法输入与输出类型保持同步。",
    cli: "CLI 参考",
    cliBody:
      "所有命令都会作用于最近的插件项目。支持时可用 --json 接入自动化，并在脚手架或修复写入前使用 --dry-run。",
    cliRows: [
      { command: "dshx dev", body: "构建、关联、监听，并在 DSH 中运行插件。" },
      { command: "dshx build", body: "验证 Manifest，输出已启用的 Host 与 Client 产物。" },
      {
        command: "dshx check",
        body: "检查 Manifest、兼容性、Profile 关联和 Runtime Bridge 状态。",
      },
      {
        command: "dshx inspect slots",
        body: "从运行中的 Composition 读取 Slot、Tool、Service 或 Event。",
      },
      { command: "dshx add ui --slot <name>", body: "生成并注册类型化 React Slot 贡献。" },
      { command: "dshx add tool --name <name>", body: "生成官方 Host Tool，并挂到 defineHost。" },
      { command: "dshx add hook --event <name>", body: "生成原生 Cordis Event Listener。" },
    ],
    next: "继续扩展 Runtime",
    nextBody: "浏览插件注册表查看真实集成，或者打开仓库阅读兼容性说明与更底层的实现细节。",
    plugins: "浏览插件",
    github: "打开 GitHub",
  },
};

const projectTree = `my-plugin/
├── src/
│   ├── host.ts       # Node · Tools · Services
│   ├── client.tsx    # Browser · React · Slots
│   └── shared/       # Shared API contracts
├── dshx.config.ts    # Optional project config
└── package.json`;

const hostExample = `import { defineHost, defineTool } from '@becomeopc/dshx/host'

const searchTool = defineTool({
  name: 'search',
  description: 'Search the workspace',
  parameters: {},
  output: {
    schema: { type: 'string' },
    render: (_args, value) => [{ type: 'text', text: value }],
  },
  async execute() {
    return 'Ready'
  },
})

export default defineHost({
  tools: [searchTool],
  setup(ctx) {
    ctx.on('dispose', () => console.info('closed'))
  },
})`;

const clientExample = `import type {} from '@provider/plugin/client'
import { defineClient, defineSlot } from '@becomeopc/dshx/client'
import { Status } from './ui/status'

const statusSlot = defineSlot('sidebar.footer.action', {
  component: Status,
})

export default defineClient({
  slots: [statusSlot],
})`;

const typedApiExample = `// src/shared/status-api.ts
import { defineApi, method } from '@becomeopc/dshx'

export const statusApi = defineApi({
  id: 'status',
  version: 1,
  methods: {
    get: method<{ id: string }, { online: boolean }>(),
  },
})

// src/host.ts
export default defineHost({
  api: statusApi.host({
    get: async ({ input }) => ({ online: !!input.id }),
  }),
})

// src/client.tsx
export default defineClient({ api: statusApi })
const status = useQuery(statusApi, 'get', { id: 'primary' })`;

function DocNavigation({
  content,
  activeId,
  onNavigate,
}: {
  content: DocsCopy;
  activeId: string;
  onNavigate?: () => void;
}) {
  return (
    <nav aria-label={content.navLabel} className="space-y-7">
      {content.groups.map((group) => (
        <div key={group.label}>
          <div className="mb-2.5 font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
            {group.label}
          </div>
          <div className="space-y-0.5 border-l border-border">
            {group.links.map((link) => (
              <a
                key={link.id}
                href={`#${link.id}`}
                aria-current={activeId === link.id ? "location" : undefined}
                onClick={onNavigate}
                className={cn(
                  "-ml-px block border-l px-3 py-1.5 text-[13px] transition-colors",
                  activeId === link.id
                    ? "border-accent font-medium text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {link.label}
              </a>
            ))}
          </div>
        </div>
      ))}
    </nav>
  );
}

function ApiRows({ rows }: { rows: DocRow[] }) {
  return (
    <div className="mt-6 divide-y divide-border border-y border-border">
      {rows.map((row) => (
        <div key={row.name} className="grid gap-1.5 py-4 sm:grid-cols-[10rem_1fr] sm:gap-6">
          <div>
            <code className="font-mono text-[12px] font-medium text-accent">{row.name}</code>
            <div className="mt-1 font-mono text-[10.5px] text-muted-foreground">{row.type}</div>
          </div>
          <p className="text-[14px] leading-6 text-muted-foreground">{row.body}</p>
        </div>
      ))}
    </div>
  );
}

function Docs() {
  const { locale } = useI18n();
  const content = copy[locale];
  const allLinks = useMemo(() => content.groups.flatMap((group) => group.links), [content.groups]);
  const [activeId, setActiveId] = useState("overview");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    const sections = allLinks
      .map((link) => document.getElementById(link.id))
      .filter((section): section is HTMLElement => section !== null);
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]?.target.id) setActiveId(visible[0].target.id);
      },
      { rootMargin: "-18% 0px -68%", threshold: [0, 1] },
    );
    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, [allLinks]);

  return (
    <main className="docs-page">
      <Container className="py-7 md:py-10">
        <details
          open={mobileNavOpen}
          onToggle={(event) => setMobileNavOpen(event.currentTarget.open)}
          className="mb-8 rounded-lg border border-border bg-surface/90 p-4 backdrop-blur-sm lg:hidden"
        >
          <summary className="cursor-pointer list-none text-[13px] font-medium">
            <span className="flex items-center justify-between">
              {content.mobileNav}
              <span aria-hidden className="font-mono text-muted-foreground">
                {mobileNavOpen ? "−" : "+"}
              </span>
            </span>
          </summary>
          <div className="mt-5 border-t border-border pt-5">
            <DocNavigation
              content={content}
              activeId={activeId}
              onNavigate={() => setMobileNavOpen(false)}
            />
          </div>
        </details>

        <div className="grid items-start gap-10 lg:grid-cols-[14.5rem_minmax(0,1fr)] lg:gap-14 xl:gap-20">
          <aside className="sticky top-20 hidden max-h-[calc(100vh-6rem)] overflow-y-auto pr-7 lg:block">
            <div className="mb-8 flex items-center justify-between border-b border-border pb-4">
              <span className="text-[14px] font-semibold">DSHX Docs</span>
              <span className="rounded border border-border px-1.5 py-0.5 font-mono text-[9.5px] text-muted-foreground">
                {content.version}
              </span>
            </div>
            <DocNavigation content={content} activeId={activeId} />
          </aside>

          <article className="min-w-0 max-w-[52rem]">
            <header id="overview" className="scroll-mt-24 border-b border-border pb-10 md:pb-12">
              <div className="font-mono text-[10.5px] tracking-[0.14em] text-accent uppercase">
                {content.eyebrow}
              </div>
              <h1 className="text-balance-tight mt-4 max-w-[13ch] text-[clamp(2.5rem,6vw,4.5rem)] leading-[0.98] font-medium">
                {content.title}
              </h1>
              <p className="mt-6 max-w-[44rem] text-[16px] leading-7 text-muted-foreground md:text-[17px]">
                {content.intro}
              </p>
            </header>

            <section className="docs-section pt-10 md:pt-12">
              <h2>{content.quickstart}</h2>
              <p>{content.quickstartBody}</p>
              <Terminal
                className="mt-6"
                title="terminal"
                lines={[
                  { text: "pnpm create dshx my-plugin", kind: "cmd" },
                  { text: "cd my-plugin", kind: "cmd" },
                  { text: "pnpm dev", kind: "cmd" },
                  { text: content.ready, kind: "ok" },
                ]}
              />
            </section>

            <section id="installation" className="docs-section scroll-mt-24">
              <h2>{content.installation}</h2>
              <p>{content.installationBody}</p>
              <div className="mt-7 grid gap-5 md:grid-cols-2">
                <div>
                  <h3>{content.newProject}</h3>
                  <CodeSurface title="terminal" className="mt-3">
                    <Code code="pnpm create dshx my-plugin" />
                  </CodeSurface>
                </div>
                <div>
                  <h3>{content.existingProject}</h3>
                  <CodeSurface title="terminal" className="mt-3">
                    <Code code={`pnpm add -D @becomeopc/dshx \\\n+  @deepseek-ai/dsh`} />
                  </CodeSurface>
                </div>
              </div>
              <div className="docs-note mt-6">{content.installNote}</div>
            </section>

            <section id="project-structure" className="docs-section scroll-mt-24">
              <h2>{content.projectStructure}</h2>
              <p>{content.projectStructureBody}</p>
              <CodeSurface title="project" className="mt-6">
                <Code code={projectTree} />
              </CodeSurface>
            </section>

            <section id="development-workflow" className="docs-section scroll-mt-24">
              <h2>{content.workflow}</h2>
              <p>{content.workflowBody}</p>
              <ol className="mt-8 border-l border-border">
                {content.workflowSteps.map((step, index) => (
                  <li key={step.title} className="relative pb-8 pl-7 last:pb-0">
                    <span className="absolute top-0 -left-[13px] flex size-6 items-center justify-center rounded-full border border-border bg-background font-mono text-[9px] text-accent">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <h3>{step.title}</h3>
                    <p className="mt-1.5 text-[14px] leading-6 text-muted-foreground">
                      {step.body}
                    </p>
                  </li>
                ))}
              </ol>
            </section>

            <section id="runtime-inspection" className="docs-section scroll-mt-24">
              <h2>{content.inspection}</h2>
              <p>{content.inspectionBody}</p>
              <Terminal
                className="mt-6"
                title="terminal"
                lines={[
                  { text: "dshx inspect slots", kind: "cmd" },
                  { text: "sidebar.footer.action · list · @provider/plugin", kind: "accent" },
                  { text: "dshx add ui --slot sidebar.footer.action", kind: "cmd" },
                  { text: "created src/ui/sidebar-footer-action.tsx", kind: "ok" },
                ]}
              />
            </section>

            <section id="host-api" className="docs-section scroll-mt-24">
              <div className="docs-api-label">@becomeopc/dshx/host</div>
              <h2>{content.hostApi}</h2>
              <p>{content.hostApiBody}</p>
              <CodeSurface title="src/host.ts" className="mt-6">
                <Code code={hostExample} />
              </CodeSurface>
              <ApiRows rows={content.hostRows} />
            </section>

            <section id="client-api" className="docs-section scroll-mt-24">
              <div className="docs-api-label">@becomeopc/dshx/client</div>
              <h2>{content.clientApi}</h2>
              <p>{content.clientApiBody}</p>
              <CodeSurface title="src/client.tsx" className="mt-6">
                <Code code={clientExample} />
              </CodeSurface>
              <ApiRows rows={content.clientRows} />
            </section>

            <section id="typed-api" className="docs-section scroll-mt-24">
              <div className="docs-api-label">@becomeopc/dshx</div>
              <h2>{content.typedApi}</h2>
              <p>{content.typedApiBody}</p>
              <CodeSurface title="typed API contract" className="mt-6">
                <Code code={typedApiExample} />
              </CodeSurface>
            </section>

            <section id="cli-reference" className="docs-section scroll-mt-24">
              <h2>{content.cli}</h2>
              <p>{content.cliBody}</p>
              <div className="mt-7 overflow-hidden rounded-xl border border-border bg-surface/85 backdrop-blur-sm">
                {content.cliRows.map((row) => (
                  <div
                    key={row.command}
                    className="grid gap-2 border-b border-border px-4 py-4 last:border-b-0 md:grid-cols-[17rem_1fr] md:px-5"
                  >
                    <code className="font-mono text-[11.5px] text-foreground">{row.command}</code>
                    <span className="text-[13.5px] leading-5 text-muted-foreground">
                      {row.body}
                    </span>
                  </div>
                ))}
              </div>
            </section>

            <section className="mt-16 rounded-xl border border-border bg-surface/90 p-6 backdrop-blur-sm md:p-8">
              <h2 className="text-[22px] font-medium tracking-tight">{content.next}</h2>
              <p className="mt-3 max-w-2xl text-[14px] leading-6 text-muted-foreground">
                {content.nextBody}
              </p>
              <div className="mt-6 flex flex-wrap gap-5 text-[13.5px] font-medium">
                <a href={`/${locale}/plugins`} className="text-accent hover:underline">
                  {content.plugins} →
                </a>
                <a
                  href="https://github.com"
                  target="_blank"
                  rel="noreferrer"
                  className="text-foreground hover:underline"
                >
                  {content.github} ↗
                </a>
              </div>
            </section>
          </article>
        </div>
      </Container>
    </main>
  );
}
