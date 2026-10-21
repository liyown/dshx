import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";

import { PublicPageHeader } from "@/components/community/public-list";
import { PluginCard } from "@/components/dshx/plugin-card";
import { ButtonLink, Container } from "@/components/dshx/primitives";
import { featuredCopy } from "@/lib/featured";
import { loadFeatured } from "@/lib/featured.functions";
import { buildFeaturedHead } from "@/lib/featured-seo";
import { parseLocale } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/$locale/featured")({
  loader: ({ params }) => loadFeatured({ data: { locale: parseLocale(params.locale) } }),
  head: ({ params, loaderData }) => buildFeaturedHead(parseLocale(params.locale), loaderData ?? []),
  component: FeaturedPage,
});

function FeaturedPage() {
  const locale = parseLocale(Route.useParams().locale);
  const copy = featuredCopy[locale];
  const sections = Route.useLoaderData();
  const [activeSlug, setActiveSlug] = useState(sections[0]?.slug ?? "");
  const [atFooter, setAtFooter] = useState(false);
  const railRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    const footer = document.querySelector("footer");
    if (!footer || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) =>
      setAtFooter(Boolean(entry?.isIntersecting)),
    );
    observer.observe(footer);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (sections.length === 0) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      let current = sections[0]?.slug ?? "";
      for (const section of sections) {
        const heading = document.getElementById(`featured-${section.slug}`);
        if (!heading) continue;
        // Sections are stacked in document order, so the first heading past
        // the active line ends the search.
        if (heading.getBoundingClientRect().top > 140) break;
        current = section.slug;
      }
      setActiveSlug(current);
    };
    const onScroll = () => {
      if (frame === 0) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [sections]);

  useEffect(() => {
    const rail = railRef.current;
    const active = rail?.querySelector<HTMLElement>('[aria-current="location"]');
    if (!rail || !active) return;
    const offset = active.getBoundingClientRect().top - rail.getBoundingClientRect().top;
    const top = rail.scrollTop + offset - (rail.clientHeight - active.offsetHeight) / 2;
    rail.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
  }, [activeSlug]);

  return (
    <main>
      <Container className="py-16 md:py-24 min-[1440px]:mr-[calc(50%-590px-6rem)] min-[1440px]:ml-[calc(50%-590px+6rem)]">
        <PublicPageHeader
          eyebrow={copy.eyebrow}
          title={copy.title}
          description={copy.description}
        />
        <p className="mt-5 max-w-3xl border-l border-border pl-3 text-[12px] leading-6 text-muted-foreground">
          {copy.editorialNote}
        </p>

        {sections.length === 0 ? (
          <div className="border-b border-border py-16">
            <p className="max-w-2xl text-[15px] leading-7 text-muted-foreground">{copy.empty}</p>
            <ButtonLink to="/plugins" variant="outline" className="mt-6">
              {copy.browseAll}
            </ButtonLink>
          </div>
        ) : (
          <>
            <nav
              aria-label={copy.jumpTo}
              className="mt-8 flex gap-5 overflow-x-auto [scrollbar-width:none] min-[1440px]:hidden [&::-webkit-scrollbar]:hidden"
            >
              {sections.map((section) => (
                <a
                  key={section.slug}
                  href={`#featured-${section.slug}`}
                  onClick={() => setActiveSlug(section.slug)}
                  className={cn(
                    "inline-flex shrink-0 items-baseline gap-1.5 border-b-2 py-2 text-[13px] transition-colors",
                    activeSlug === section.slug
                      ? "border-accent text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground",
                  )}
                >
                  {section.name}
                  <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
                    {section.plugins.length}
                  </span>
                </a>
              ))}
            </nav>

            <aside
              className={cn(
                "pointer-events-none fixed inset-y-0 left-0 z-40 hidden w-[calc(50%-590px+8.5rem)] items-center justify-center transition-[opacity,visibility] duration-200 min-[1440px]:flex",
                atFooter && "invisible opacity-0",
              )}
            >
              <nav
                aria-labelledby="featured-categories"
                className="pointer-events-auto flex max-h-[72vh] w-[clamp(8.25rem,calc((100vw-1180px)/2),13rem)] flex-col"
              >
                <p
                  id="featured-categories"
                  className="shrink-0 pb-3 font-mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground"
                >
                  {copy.categories}
                </p>
                <ul
                  ref={railRef}
                  className="min-h-0 overflow-y-auto border-l border-border [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                >
                  {sections.map((section) => {
                    const active = activeSlug === section.slug;
                    return (
                      <li key={section.slug}>
                        <a
                          href={`#featured-${section.slug}`}
                          onClick={() => setActiveSlug(section.slug)}
                          aria-current={active ? "location" : undefined}
                          title={section.name}
                          className={cn(
                            "-ml-px flex items-baseline justify-between gap-3 border-l-2 py-1.5 pl-3.5 text-[12px] leading-5 transition-colors",
                            active
                              ? "border-accent text-foreground"
                              : "border-transparent text-muted-foreground hover:text-foreground",
                          )}
                        >
                          <span className="min-w-0 truncate">{section.name}</span>
                          <span className="shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground">
                            {section.plugins.length}
                          </span>
                        </a>
                      </li>
                    );
                  })}
                </ul>
              </nav>
            </aside>

            <div>
              {sections.map((section, index) => (
                <section
                  key={section.slug}
                  data-featured-section={section.slug}
                  aria-labelledby={`featured-${section.slug}`}
                  className="border-b border-border py-12 last:border-b-0 md:py-14"
                >
                  <div className="mb-8 grid gap-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
                    <div>
                      <div className="flex items-baseline gap-3">
                        <span className="font-mono text-[11px] tracking-[0.12em] text-accent">
                          {String(index + 1).padStart(2, "0")}
                        </span>
                        <h2
                          id={`featured-${section.slug}`}
                          className="scroll-mt-28 text-[clamp(1.4rem,2.6vw,1.9rem)] font-medium tracking-[-0.03em]"
                        >
                          {section.name}
                        </h2>
                      </div>
                      {section.description ? (
                        <p className="mt-3 max-w-2xl text-[14px] leading-6 text-muted-foreground">
                          {section.description}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-5 text-[12px] text-muted-foreground">
                      <span className="font-mono">{copy.pluginCount(section.plugins.length)}</span>
                      <Link
                        to="/$locale/categories/$slug"
                        params={{ locale, slug: section.slug }}
                        className="min-h-10 inline-flex items-center rounded-sm text-accent transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
                      >
                        {copy.browseCategory}
                      </Link>
                    </div>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {section.plugins.map((plugin) => (
                      <PluginCard key={plugin.slug} plugin={plugin} />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </>
        )}
      </Container>
    </main>
  );
}
