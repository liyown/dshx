import {
  Blocks,
  Bug,
  Check,
  ChevronDown,
  ChevronRight,
  FileCode2,
  FileJson2,
  Files,
  FolderOpen,
  GitBranch,
  Radio,
  Search,
  Settings,
  TerminalSquare,
  X,
} from "lucide-react";
import { useState } from "react";

import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Code } from "./code";

type Target = "client" | "host" | "api";
type Pane = "source" | "dist";

type WorkbenchFile = {
  sourceFile: string;
  sourcePath: string;
  sourceCode: string;
  sourceHighlights: number[];
  distFile: string;
  distPath: string;
  distCode: string;
  language: string;
  buildLine: string;
};

const files: Record<Target, WorkbenchFile> = {
  client: {
    sourceFile: "client.tsx",
    sourcePath: "src  ›  client.tsx",
    sourceCode: `import type {} from '@provider/plugin/client'
import { defineClient, defineSlot } from '@becomeopc/dshx/client'
import { Status } from './ui/status'

const sidebarStatus = defineSlot('sidebar.footer.action', {
  component: Status,
})

export default defineClient({
  slots: [sidebarStatus],
})`,
    sourceHighlights: [5, 6, 9, 10, 11],
    distFile: "client.js",
    distPath: "dist  ›  client.js",
    distCode: `module.exports = (require) => ({
  name: 'my-plugin/client',
  inject: ['connection', 'slots'],
  apply(ctx) {
    ctx.slots.register(
      'sidebar.footer.action',
      Status,
    )
  },
})`,
    language: "TypeScript React",
    buildLine: "client rebuilt · native HMR applied · 68ms",
  },
  host: {
    sourceFile: "host.ts",
    sourcePath: "src  ›  host.ts",
    sourceCode: `import { defineHost } from '@becomeopc/dshx/host'
import { searchTool } from './tools/search'
import { statusApi } from './shared/status-api'

export default defineHost({
  tools: [searchTool],
  apis: [statusApi.host({
    get: async ({ input }) => ({
      online: Boolean(input.id),
    }),
  })],
})`,
    sourceHighlights: [5, 6, 7, 8, 9, 10, 11],
    distFile: "index.js",
    distPath: "dist  ›  index.js",
    distCode: `export const name = 'my-plugin'
export const inject = ['tools', 'connection']

export async function apply(ctx) {
  ctx.tools.register(searchTool)
  registerStatusApi(ctx)
}`,
    language: "TypeScript",
    buildLine: "host rebuilt · restart required · 142ms",
  },
  api: {
    sourceFile: "status-api.ts",
    sourcePath: "src  ›  shared  ›  status-api.ts",
    sourceCode: `import { defineApi, method } from '@becomeopc/dshx/api'

export const statusApi = defineApi({
  id: 'status',
  version: 1,
  methods: {
    get: method<
      { id: string },
      { online: boolean }
    >(),
  },
})`,
    sourceHighlights: [3, 4, 5, 6, 7, 8, 9, 10],
    distFile: "index.js + client.js",
    distPath: "dist  ›  generated API wiring",
    distCode: `// dist/index.js
ctx.connection.register('status@1', {
  authority: 'loopback',
  methods: ['get'],
})

// dist/client.js
const statusApi = {
  get(input, options) {
    return connection.call('status@1/get', input, options)
  },
}`,
    language: "TypeScript",
    buildLine: "status@1 types synchronized across host and client",
  },
};

const text = {
  en: {
    explorer: "EXPLORER",
    source: "DSHX API · SOURCE",
    generated: "GENERATED · READ ONLY",
    command: "Search files or run a command",
    session: "DEV SESSION",
    problems: "PROBLEMS 0",
    terminal: "TERMINAL",
    sourceMap: "source maps enabled",
  },
  zh: {
    explorer: "资源管理器",
    source: "DSHX API · 源码",
    generated: "编译产物 · 只读",
    command: "搜索文件或运行命令",
    session: "开发会话",
    problems: "问题 0",
    terminal: "终端",
    sourceMap: "Source Map 已启用",
  },
} as const;

function ActivityRail() {
  const items = [
    { label: "Explorer", icon: Files, active: true },
    { label: "Search", icon: Search },
    { label: "Source control", icon: GitBranch },
    { label: "Run and debug", icon: Bug },
    { label: "Extensions", icon: Blocks },
  ];
  return (
    <div className="observatory-activity" aria-label="Editor activity">
      <div className="flex flex-col items-center">
        {items.map(({ label, icon: Icon, active }) => (
          <span
            key={label}
            aria-label={label}
            className={cn(
              "observatory-activity-icon",
              active && "observatory-activity-icon-active",
            )}
          >
            <Icon className="size-4" strokeWidth={1.65} />
          </span>
        ))}
      </div>
      <span className="observatory-activity-icon mt-auto" aria-label="Settings">
        <Settings className="size-4" strokeWidth={1.65} />
      </span>
    </div>
  );
}

function TreeFile({
  target,
  pane,
  currentTarget,
  currentPane,
  onSelect,
}: {
  target: Target;
  pane: Pane;
  currentTarget: Target;
  currentPane: Pane;
  onSelect: (target: Target, pane: Pane) => void;
}) {
  const selected = target === currentTarget && pane === currentPane;
  const file = files[target];
  const label = pane === "source" ? file.sourceFile : file.distFile;
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={() => onSelect(target, pane)}
      className={cn("observatory-file", selected && "observatory-file-active")}
    >
      <FileCode2
        className={cn(
          "size-3.5 shrink-0",
          pane === "dist"
            ? "text-ok"
            : target === "client"
              ? "text-[oklch(0.74_0.14_204)]"
              : "text-ink-accent",
        )}
      />
      <span className="truncate">{label}</span>
      {target === currentTarget ? <span className="ml-auto size-1 rounded-full bg-ok" /> : null}
    </button>
  );
}

function Explorer({
  target,
  pane,
  onSelect,
  label,
}: {
  target: Target;
  pane: Pane;
  onSelect: (target: Target, pane: Pane) => void;
  label: string;
}) {
  return (
    <aside className="observatory-explorer">
      <div className="observatory-pane-label">{label}</div>
      <div className="observatory-mobile-files">
        {(["host", "client", "api"] as const).map((item) => (
          <TreeFile
            key={item}
            target={item}
            pane="source"
            currentTarget={target}
            currentPane={pane}
            onSelect={onSelect}
          />
        ))}
      </div>
      <div className="observatory-tree">
        <div className="observatory-folder font-medium text-ink-foreground">
          <ChevronDown className="size-3" />
          <FolderOpen className="size-3.5 text-ink-accent" />
          MY-PLUGIN
        </div>
        <div className="observatory-folder pl-4 text-ink-foreground">
          <ChevronDown className="size-3" />
          <FolderOpen className="size-3.5 text-ink-accent" />
          src
        </div>
        {(["host", "client"] as const).map((item) => (
          <TreeFile
            key={item}
            target={item}
            pane="source"
            currentTarget={target}
            currentPane={pane}
            onSelect={onSelect}
          />
        ))}
        <div className="observatory-folder pl-7 text-ink-foreground">
          <ChevronDown className="size-3" />
          <FolderOpen className="size-3.5 text-ink-accent" />
          shared
        </div>
        <TreeFile
          target="api"
          pane="source"
          currentTarget={target}
          currentPane={pane}
          onSelect={onSelect}
        />

        <div className="observatory-folder mt-1 pl-4 text-ink-foreground">
          <ChevronDown className="size-3" />
          <FolderOpen className="size-3.5 text-ok" />
          dist
        </div>
        <TreeFile
          target="host"
          pane="dist"
          currentTarget={target}
          currentPane={pane}
          onSelect={onSelect}
        />
        <TreeFile
          target="client"
          pane="dist"
          currentTarget={target}
          currentPane={pane}
          onSelect={onSelect}
        />
        <div className="observatory-static-file pl-8">
          <FileCode2 className="size-3.5 text-ok" />
          client.css
        </div>
        <div className="observatory-static-file">
          <FileCode2 className="size-3.5 text-ink-muted" />
          dshx.config.ts
        </div>
        <div className="observatory-static-file">
          <FileJson2 className="size-3.5 text-[oklch(0.8_0.12_88)]" />
          package.json
        </div>
        <div className="mt-3 border-t border-ink-border pt-2">
          {["OUTLINE", "TIMELINE"].map((item) => (
            <div key={item} className="observatory-collapsed">
              <ChevronRight className="size-3" />
              {item}
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}

function EditorPane({
  file,
  path,
  label,
  code,
  highlights,
  readOnly,
}: {
  file: string;
  path: string;
  label: string;
  code: string;
  highlights?: number[];
  readOnly?: boolean;
}) {
  return (
    <section className="observatory-editor-pane" aria-label={label}>
      <div className="observatory-tabs">
        <div className="observatory-tab observatory-tab-active">
          <FileCode2 className={cn("size-3.5", readOnly ? "text-ok" : "text-ink-accent")} />
          {file}
          <X className="ml-1 size-3 text-ink-muted" />
        </div>
      </div>
      <div className="observatory-breadcrumb">
        <span>{path}</span>
        <span className={cn("ml-auto", readOnly ? "text-ok" : "text-ink-accent")}>{label}</span>
      </div>
      <div className="observatory-split-code">
        <Code
          code={code}
          lineNumbers
          highlightLines={highlights}
          className="min-w-[28rem] text-[10.5px] leading-[1.82]"
        />
      </div>
    </section>
  );
}

function Workspace({
  target,
  labels,
}: {
  target: Target;
  labels: (typeof text)["en"] | (typeof text)["zh"];
}) {
  const file = files[target];
  return (
    <div className="observatory-workspace">
      <div className="observatory-split">
        <EditorPane
          file={file.sourceFile}
          path={file.sourcePath}
          label={labels.source}
          code={file.sourceCode}
          highlights={file.sourceHighlights}
        />
        <EditorPane
          file={file.distFile}
          path={file.distPath}
          label={labels.generated}
          code={file.distCode}
          readOnly
        />
      </div>
      <div className="observatory-statusbar">
        <span className="flex items-center gap-1.5">
          <GitBranch className="size-3" /> main*
        </span>
        <span className="hidden sm:inline">0 errors · 0 warnings</span>
        <span className="ml-auto">{file.language} · UTF-8 · Ln 1, Col 1</span>
      </div>
    </div>
  );
}

function TerminalPanel({
  target,
  labels,
}: {
  target: Target;
  labels: (typeof text)["en"] | (typeof text)["zh"];
}) {
  const file = files[target];
  return (
    <div className="observatory-terminal">
      <div className="observatory-terminal-tabs">
        <span>{labels.problems}</span>
        <span>OUTPUT</span>
        <span className="observatory-terminal-tab-active">{labels.terminal}</span>
        <TerminalSquare className="ml-auto size-3.5 text-ink-muted" />
      </div>
      <div className="observatory-terminal-log">
        <span className="text-ink-accent">$</span>
        <span className="text-ink-foreground">pnpm dev</span>
        <span className="text-ok">✓</span>
        <span className="text-ink-foreground">{file.buildLine}</span>
        <span className="hidden text-ink-muted sm:inline">
          · {file.distPath} · {labels.sourceMap}
        </span>
      </div>
    </div>
  );
}

export function DevLoop() {
  const { locale } = useI18n();
  const labels = text[locale];
  const [target, setTarget] = useState<Target>("client");
  const [pane, setPane] = useState<Pane>("source");

  const select = (nextTarget: Target, nextPane: Pane) => {
    setTarget(nextTarget);
    setPane(nextPane);
  };

  return (
    <div className="compiler-observatory compiler-observatory-static" data-scroll-surface>
      <div className="observatory-titlebar">
        <div className="flex items-center gap-3">
          <span className="flex gap-1.5" aria-hidden>
            <span className="size-[7px] rounded-full bg-ink-border" />
            <span className="size-[7px] rounded-full bg-ink-border" />
            <span className="size-[7px] rounded-full bg-ink-border" />
          </span>
          <span className="hidden font-mono text-[9.5px] text-ink-muted sm:block">
            my-plugin — DSHX Workbench
          </span>
        </div>
        <div className="observatory-command">
          <Search className="size-3.5" />
          <span>{labels.command}</span>
          <kbd>⌘ K</kbd>
        </div>
        <span className="observatory-session">
          <Radio className="size-3" />
          {labels.session}
        </span>
      </div>
      <div className="observatory-main">
        <ActivityRail />
        <Explorer target={target} pane={pane} onSelect={select} label={labels.explorer} />
        <Workspace target={target} labels={labels} />
      </div>
      <TerminalPanel target={target} labels={labels} />
    </div>
  );
}
