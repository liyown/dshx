import { Link } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";

import { Container } from "@/components/dshx/primitives";
import { getDocsChapter, getDocsNavigation, type DocsSlug } from "@/lib/docs";
import { useI18n } from "@/lib/i18n/use-i18n";
import { cn } from "@/lib/utils";

const shellCopy = {
  en: {
    home: "Documentation home",
    mobile: "Documentation navigation",
    version: "DSHX 0.1",
    experimental: "experimental",
    onPage: "On this chapter",
  },
  zh: {
    home: "文档首页",
    mobile: "文档导航",
    version: "DSHX 0.1",
    experimental: "实验性",
    onPage: "本章目录",
  },
} as const;

function DocsNavigation({
  activeSlug,
  close,
}: {
  activeSlug: DocsSlug | undefined;
  close?: () => void;
}) {
  const { locale } = useI18n();
  const groups = getDocsNavigation(locale);
  const copy = shellCopy[locale];
  const activeChapter =
    activeSlug === undefined ? undefined : getDocsChapter(activeSlug).copy[locale];

  return (
    <nav aria-label={copy.mobile} className="space-y-7">
      <div>
        <Link
          to="/$locale/docs"
          params={{ locale }}
          onClick={close}
          className={cn(
            "-ml-px block border-l px-3 py-1.5 text-[13px] transition-colors",
            activeSlug === undefined
              ? "border-accent font-medium text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          {copy.home}
        </Link>
      </div>

      {groups.map((group) => (
        <div key={group.id}>
          <div className="mb-2.5 font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
            {group.label}
          </div>
          <div className="space-y-0.5 border-l border-border">
            {group.items.map((item) => (
              <div key={item.slug}>
                <Link
                  to="/$locale/docs/$slug"
                  params={{ locale, slug: item.slug }}
                  aria-current={activeSlug === item.slug ? "page" : undefined}
                  onClick={close}
                  className={cn(
                    "-ml-px flex items-center justify-between gap-2 border-l px-3 py-1.5 text-[13px] transition-colors",
                    activeSlug === item.slug
                      ? "border-accent font-medium text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground",
                  )}
                >
                  <span>{item.label}</span>
                  {item.experimental ? (
                    <span className="font-mono text-[8.5px] tracking-tight text-accent">
                      {copy.experimental}
                    </span>
                  ) : null}
                </Link>

                {activeSlug === item.slug && activeChapter !== undefined ? (
                  <div className="ml-3 space-y-0.5 border-l border-border/70 py-1.5">
                    <div className="px-3 pb-1 font-mono text-[8.5px] tracking-[0.1em] text-muted-foreground uppercase">
                      {copy.onPage}
                    </div>
                    {activeChapter.sections.map((section) => (
                      <a
                        key={section.id}
                        href={`#${section.id}`}
                        onClick={close}
                        className="block px-3 py-1 text-[11.5px] leading-4 text-muted-foreground transition-colors hover:text-foreground"
                      >
                        {section.title}
                      </a>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ))}
    </nav>
  );
}

export function DocsLayout({
  activeSlug,
  children,
}: {
  activeSlug?: DocsSlug;
  children: ReactNode;
}) {
  const { locale } = useI18n();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const copy = shellCopy[locale];

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
              {copy.mobile}
              <span aria-hidden className="font-mono text-muted-foreground">
                {mobileNavOpen ? "−" : "+"}
              </span>
            </span>
          </summary>
          <div className="mt-5 border-t border-border pt-5">
            <DocsNavigation activeSlug={activeSlug} close={() => setMobileNavOpen(false)} />
          </div>
        </details>

        <div className="grid items-start gap-10 lg:grid-cols-[14.5rem_minmax(0,1fr)] lg:gap-14 xl:gap-20">
          <aside className="sticky top-20 hidden max-h-[calc(100vh-6rem)] overflow-y-auto pr-7 lg:block">
            <div className="mb-8 flex items-center justify-between border-b border-border pb-4">
              <Link to="/$locale/docs" params={{ locale }} className="text-[14px] font-semibold">
                DSHX Docs
              </Link>
              <span className="rounded border border-border px-1.5 py-0.5 font-mono text-[9.5px] text-muted-foreground">
                {copy.version}
              </span>
            </div>
            <DocsNavigation activeSlug={activeSlug} />
          </aside>

          <div className="min-w-0 max-w-[52rem]">{children}</div>
        </div>
      </Container>
    </main>
  );
}
