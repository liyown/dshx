import { Link } from "@tanstack/react-router";
import { useEffect } from "react";

import { Code, CodeSurface, Terminal } from "@/components/dshx/code";
import { CopyAgentPrompt } from "@/components/dshx/copy-agent-prompt";
import {
  DOC_CHAPTERS,
  DOC_SLUGS,
  LEGACY_DOC_HASH_TARGETS,
  getDocsChapter,
  getDocsNavigation,
  type DocsBlock,
  type DocsSlug,
} from "@/lib/docs";
import { useI18n } from "@/lib/i18n/use-i18n";

import { DocsLayout } from "./docs-layout";

const overviewCopy = {
  en: {
    eyebrow: "API documentation",
    title: "DSHX API reference",
    intro:
      "Choose a public module to see its exported functions, signatures, parameters, return values, examples, automatic wiring, and errors.",
    quickstart: "Quick start",
    quickstartBody:
      "The initializer creates the conventional Host and Client entries, installs dependencies, and prepares the official DSH development loop.",
    ready: "host ready · client watching · DSH opened",
    chapters: "API modules and guides",
    chaptersBody:
      "Host, Client, Settings, Typed API, Conversation, compiler, CLI, and compatibility are documented separately.",
    open: "Open reference",
    experimental: "Experimental",
    next: "New project",
    nextBody:
      "Create the starter project, then use the reference for the modules imported by your plugin.",
  },
  zh: {
    eyebrow: "API 文档",
    title: "DSHX API 参考",
    intro: "按公开模块查看导出函数、签名、参数、返回值、完整示例、自动接线与错误。",
    quickstart: "快速开始",
    quickstartBody: "初始化器会创建标准 Host 与 Client 入口、安装依赖，并准备官方 DSH 开发循环。",
    ready: "Host 就绪 · Client 监听中 · DSH 已打开",
    chapters: "API 模块与指南",
    chaptersBody:
      "Host、Client、Settings、类型化 API、Conversation、Compiler、CLI 与兼容性分别说明。",
    open: "打开参考",
    experimental: "实验性",
    next: "新建项目",
    nextBody: "先创建 starter project，再按插件实际 import 的模块查阅 API。",
  },
} as const;

const pagerCopy = {
  en: { previous: "Previous", next: "Next", index: "All chapters" },
  zh: { previous: "上一章", next: "下一章", index: "全部章节" },
} as const;

function ApiRows({ rows }: { rows: Extract<DocsBlock, { kind: "api" }>["rows"] }) {
  return (
    <div className="mt-6 divide-y divide-border border-y border-border">
      {rows.map((row) => (
        <div key={row.name} className="grid gap-1.5 py-4 sm:grid-cols-[11rem_1fr] sm:gap-6">
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

function DocsBlockView({ block }: { block: DocsBlock }) {
  if (block.kind === "paragraph") return <p>{block.text}</p>;
  if (block.kind === "code") {
    return (
      <CodeSurface title={block.title} className="mt-6">
        <Code code={block.code} />
      </CodeSurface>
    );
  }
  if (block.kind === "terminal") {
    return <Terminal title={block.title} lines={[...block.lines]} className="mt-6" />;
  }
  if (block.kind === "note") return <div className="docs-note mt-6">{block.text}</div>;
  if (block.kind === "api") return <ApiRows rows={block.rows} />;
  if (block.kind === "list") {
    return (
      <ul className="mt-6 max-w-[46rem] space-y-3 text-[14px] leading-6 text-muted-foreground">
        {block.items.map((item) => (
          <li key={item} className="flex gap-3">
            <span aria-hidden className="mt-[0.68rem] size-1 shrink-0 rounded-full bg-accent" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    );
  }
  return (
    <ol className="mt-8 border-l border-border">
      {block.items.map((step, index) => (
        <li key={step.title} className="relative pb-8 pl-7 last:pb-0">
          <span className="absolute top-0 -left-[13px] flex size-6 items-center justify-center rounded-full border border-border bg-background font-mono text-[9px] text-accent">
            {String(index + 1).padStart(2, "0")}
          </span>
          <h3>{step.title}</h3>
          <p className="mt-1.5 text-[14px] leading-6 text-muted-foreground">{step.body}</p>
        </li>
      ))}
    </ol>
  );
}

function ChapterPager({ slug }: { slug: DocsSlug }) {
  const { locale } = useI18n();
  const index = DOC_SLUGS.indexOf(slug);
  const previous = index > 0 ? DOC_SLUGS[index - 1] : undefined;
  const next = index < DOC_SLUGS.length - 1 ? DOC_SLUGS[index + 1] : undefined;
  const copy = pagerCopy[locale];

  return (
    <nav
      aria-label={copy.index}
      className="mt-16 grid gap-3 border-t border-border pt-8 sm:grid-cols-2"
    >
      {previous === undefined ? (
        <Link
          to="/$locale/docs"
          params={{ locale }}
          className="rounded-xl border border-border p-4 text-[13px] text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground"
        >
          ← {copy.index}
        </Link>
      ) : (
        <Link
          to="/$locale/docs/$slug"
          params={{ locale, slug: previous }}
          className="rounded-xl border border-border p-4 transition-colors hover:border-border-strong"
        >
          <span className="block font-mono text-[9px] tracking-[0.12em] text-muted-foreground uppercase">
            {copy.previous}
          </span>
          <span className="mt-1 block text-[13.5px] font-medium">
            ← {getDocsChapter(previous).copy[locale].navigation}
          </span>
        </Link>
      )}
      {next === undefined ? (
        <Link
          to="/$locale/docs"
          params={{ locale }}
          className="rounded-xl border border-border p-4 text-right text-[13px] text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground"
        >
          {copy.index} →
        </Link>
      ) : (
        <Link
          to="/$locale/docs/$slug"
          params={{ locale, slug: next }}
          className="rounded-xl border border-border p-4 text-right transition-colors hover:border-border-strong"
        >
          <span className="block font-mono text-[9px] tracking-[0.12em] text-muted-foreground uppercase">
            {copy.next}
          </span>
          <span className="mt-1 block text-[13.5px] font-medium">
            {getDocsChapter(next).copy[locale].navigation} →
          </span>
        </Link>
      )}
    </nav>
  );
}

export function DocsChapter({ slug }: { slug: DocsSlug }) {
  const { locale } = useI18n();
  const definition = getDocsChapter(slug);
  const chapter = definition.copy[locale];
  const showVerification = ["architecture", "publishing", "troubleshooting"].includes(slug);

  return (
    <DocsLayout activeSlug={slug}>
      <article>
        <header className="border-b border-border pb-10 md:pb-12">
          <div className="font-mono text-[10.5px] tracking-[0.14em] text-accent uppercase">
            {chapter.eyebrow}
          </div>
          <h1 className="text-balance-tight mt-4 max-w-[15ch] text-[clamp(2.5rem,6vw,4.5rem)] leading-[0.98] font-medium">
            {chapter.title}
          </h1>
          <p className="mt-6 max-w-[44rem] text-[16px] leading-7 text-muted-foreground md:text-[17px]">
            {chapter.intro}
          </p>
        </header>

        {chapter.sections.map((section) => (
          <section key={section.id} id={section.id} className="docs-section scroll-mt-24">
            {section.label === undefined ? null : (
              <div className="docs-api-label">{section.label}</div>
            )}
            <h2>{section.title}</h2>
            {section.blocks.map((block, index) => (
              <DocsBlockView key={`${section.id}-${index}`} block={block} />
            ))}
          </section>
        ))}

        {showVerification ? (
          <section id="verification" className="docs-section scroll-mt-24">
            <div className="docs-api-label">{locale === "zh" ? "验证" : "verification"}</div>
            <h2>{locale === "zh" ? "来源与最后验证" : "Sources and last verification"}</h2>
            <p>
              {locale === "zh" ? "最后验证日期：" : "Last verified: "}
              <time dateTime={definition.lastVerified}>{definition.lastVerified}</time>
            </p>
            <ul className="mt-6 max-w-[46rem] space-y-3 text-[14px] leading-6 text-muted-foreground">
              {definition.references.map((reference) => (
                <li key={reference.url}>
                  <a
                    href={reference.url}
                    rel="noreferrer"
                    className="text-accent underline-offset-4 hover:underline"
                  >
                    {reference.label}
                  </a>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <ChapterPager slug={slug} />
      </article>
    </DocsLayout>
  );
}

export function DocsOverview() {
  const { locale } = useI18n();
  const copy = overviewCopy[locale];
  const groups = getDocsNavigation(locale);

  useEffect(() => {
    const legacyHash = window.location.hash.slice(1);
    const target = LEGACY_DOC_HASH_TARGETS[legacyHash as keyof typeof LEGACY_DOC_HASH_TARGETS];
    if (target === undefined) return;
    const next = new URL(window.location.href);
    next.pathname = `/${locale}/docs/${target.slug}`;
    next.hash = target.section;
    window.location.replace(next);
  }, [locale]);

  return (
    <DocsLayout>
      <article>
        <header id="overview" className="scroll-mt-24 border-b border-border pb-10 md:pb-12">
          <div className="font-mono text-[10.5px] tracking-[0.14em] text-accent uppercase">
            {copy.eyebrow}
          </div>
          <h1 className="text-balance-tight mt-4 max-w-[13ch] text-[clamp(2.5rem,6vw,4.5rem)] leading-[0.98] font-medium">
            {copy.title}
          </h1>
          <p className="mt-6 max-w-[44rem] text-[16px] leading-7 text-muted-foreground md:text-[17px]">
            {copy.intro}
          </p>
          <CopyAgentPrompt className="mt-7" />
        </header>

        <section className="docs-section pt-10 md:pt-12">
          <h2>{copy.quickstart}</h2>
          <p>{copy.quickstartBody}</p>
          <Terminal
            className="mt-6"
            title="terminal"
            lines={[
              { text: "pnpm create dshx my-plugin", kind: "cmd" },
              { text: "cd my-plugin", kind: "cmd" },
              { text: "pnpm dev", kind: "cmd" },
              { text: copy.ready, kind: "ok" },
            ]}
          />
        </section>

        <section className="docs-section">
          <h2>{copy.chapters}</h2>
          <p>{copy.chaptersBody}</p>
          <div className="mt-8 space-y-9">
            {groups.map((group) => (
              <div key={group.id}>
                <div className="mb-3 font-mono text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
                  {group.label}
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {group.items.map((item) => {
                    const chapter = getDocsChapter(item.slug).copy[locale];
                    const position =
                      DOC_CHAPTERS.findIndex((entry) => entry.slug === item.slug) + 1;
                    return (
                      <Link
                        key={item.slug}
                        to="/$locale/docs/$slug"
                        params={{ locale, slug: item.slug }}
                        className="group rounded-xl border border-border bg-surface/75 p-5 transition-colors hover:border-border-strong"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <span className="font-mono text-[9.5px] tracking-[0.12em] text-accent">
                            {String(position).padStart(2, "0")}
                          </span>
                          {item.experimental ? (
                            <span className="rounded border border-accent/30 px-1.5 py-0.5 font-mono text-[8.5px] text-accent">
                              {copy.experimental}
                            </span>
                          ) : null}
                        </div>
                        <h3 className="mt-5 text-[16px] font-medium tracking-tight">
                          {chapter.navigation}
                        </h3>
                        <p className="mt-2 text-[13px] leading-5 text-muted-foreground">
                          {chapter.description}
                        </p>
                        <span className="mt-5 block text-[12px] font-medium text-foreground">
                          {copy.open} <span className="text-accent transition-transform">→</span>
                        </span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-16 rounded-xl border border-border bg-surface/90 p-6 backdrop-blur-sm md:p-8">
          <h2 className="text-[22px] font-medium tracking-tight">{copy.next}</h2>
          <p className="mt-3 max-w-2xl text-[14px] leading-6 text-muted-foreground">
            {copy.nextBody}
          </p>
          <Link
            to="/$locale/docs/$slug"
            params={{ locale, slug: "getting-started" }}
            className="mt-6 inline-block text-[13.5px] font-medium text-accent hover:underline"
          >
            {getDocsChapter("getting-started").copy[locale].navigation} →
          </Link>
        </section>
      </article>
    </DocsLayout>
  );
}
