import { createFileRoute, Link, notFound, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Container, Chip, ButtonLink, SectionLabel } from "@/components/dshx/primitives";
import { PluginCommunityActions } from "@/components/community/plugin-actions";
import { ReplyDialog, ReportDialog } from "@/components/community/community-dialogs";
import { PluginGlyph, PublisherIdentity } from "@/components/dshx/plugin-card";
import { loadCatalogDetail } from "@/lib/catalog/functions";
import { cn } from "@/lib/utils";
import { createTranslator, localizedPath, parseLocale, useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/$locale/plugins/$slug")({
  loader: async ({ params }) => {
    const detail = await loadCatalogDetail({
      data: { slug: params.slug, locale: parseLocale(params.locale) },
    });
    if (!detail) throw notFound();
    if (detail.redirectSlug)
      throw redirect({
        to: "/$locale/plugins/$slug",
        params: { locale: params.locale, slug: detail.redirectSlug },
        statusCode: 308,
      });
    return detail;
  },
  head: ({ loaderData, params }) => {
    const t = createTranslator(parseLocale(params.locale));
    if (!loaderData) {
      return {
        meta: [
          { title: t("errors.pageNotFound") + " — DSHX" },
          { name: "robots", content: "noindex" },
        ],
      };
    }
    const p = loaderData.plugin;
    const canonical = `${loaderData.siteUrl}/${params.locale}/plugins/${p.slug}`;
    const socialImage = loaderData.media[0]
      ? `${loaderData.siteUrl}/api/media/${loaderData.media[0].id}`
      : null;
    const software = {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: p.name,
      description: loaderData.seoDescription,
      applicationCategory: "DeveloperApplication",
      softwareVersion: p.version,
      operatingSystem: "Cross-platform",
      downloadUrl: loaderData.installTargets[0]?.spec,
      author: { "@type": "Person", name: p.author },
      ...(loaderData.rating && loaderData.rating.count >= 2
        ? {
            aggregateRating: {
              "@type": "AggregateRating",
              ratingValue: loaderData.rating.average,
              ratingCount: loaderData.rating.count,
            },
          }
        : {}),
    };
    const breadcrumbs = {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "DSHX", item: loaderData.siteUrl },
        {
          "@type": "ListItem",
          position: 2,
          name: "Plugins",
          item: `${loaderData.siteUrl}/${params.locale}/plugins`,
        },
        { "@type": "ListItem", position: 3, name: p.name, item: canonical },
      ],
    };
    return {
      meta: [
        { title: loaderData.seoTitle },
        { name: "description", content: loaderData.seoDescription },
        { name: "robots", content: loaderData.indexable ? "index,follow" : "noindex,follow" },
        { property: "og:title", content: loaderData.seoTitle },
        { property: "og:description", content: loaderData.seoDescription },
        { property: "og:type", content: "website" },
        { property: "og:url", content: canonical },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: loaderData.seoTitle },
        { name: "twitter:description", content: loaderData.seoDescription },
        ...(socialImage
          ? [
              { property: "og:image", content: socialImage },
              { property: "og:image:alt", content: loaderData.media[0]?.alt_text ?? p.name },
              { name: "twitter:image", content: socialImage },
            ]
          : []),
      ],
      links: [
        { rel: "canonical", href: canonical },
        ...(loaderData.readyLocales.length === 2
          ? [
              {
                rel: "alternate",
                hrefLang: "en",
                href: `${loaderData.siteUrl}/en/plugins/${p.slug}`,
              },
              {
                rel: "alternate",
                hrefLang: "zh",
                href: `${loaderData.siteUrl}/zh/plugins/${p.slug}`,
              },
              {
                rel: "alternate",
                hrefLang: "x-default",
                href: `${loaderData.siteUrl}/en/plugins/${p.slug}`,
              },
            ]
          : []),
      ],
      scripts: [
        { type: "application/ld+json", children: JSON.stringify(software) },
        { type: "application/ld+json", children: JSON.stringify(breadcrumbs) },
      ],
    };
  },
  component: PluginDetail,
});

const sections = ["overview", "releases", "dependencies", "media", "reviews"] as const;
type DetailSection = (typeof sections)[number];

function PluginDetail() {
  const detail = Route.useLoaderData();
  const { plugin } = detail;
  const { locale, t } = useI18n();
  const [copied, setCopied] = useState(false);
  const [active, setActive] = useState<DetailSection>("overview");
  const primaryTarget =
    detail.installTargets.find((target) => target.is_primary === 1) ?? detail.installTargets[0];
  const install = `dsh plugin add ${String(primaryTarget?.spec ?? plugin.scope)}`;

  const related = detail.related;

  return (
    <main>
      <Container className="py-12 md:py-16">
        <Link
          to={localizedPath(locale, "/plugins")}
          className="font-mono text-[11.5px] text-muted-foreground transition-colors hover:text-foreground"
        >
          {t("plugin.back")}
        </Link>

        <div className="mt-8 flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
          <div className="flex gap-5">
            <PluginGlyph plugin={plugin} size={64} priority />
            <div>
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="text-[28px] leading-tight font-medium tracking-[-0.03em]">
                  {plugin.name}
                </h1>
                <Chip
                  tone={
                    plugin.badge === "official"
                      ? "accent"
                      : plugin.badge === "verified"
                        ? "ok"
                        : "neutral"
                  }
                >
                  {plugin.badge}
                </Chip>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 font-mono text-[12.5px] text-muted-foreground">
                <span>{plugin.scope}</span>
                <span aria-hidden="true">·</span>
                <span>v{plugin.version}</span>
                <span aria-hidden="true">·</span>
                <PublisherIdentity plugin={plugin} priority className="text-[12.5px]" />
              </div>
              <p className="mt-3 max-w-xl text-[14.5px] leading-relaxed text-muted-foreground">
                {plugin.description}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => {
                void navigator.clipboard?.writeText(install);
                setCopied(true);
                setTimeout(() => setCopied(false), 1600);
              }}
              className="inline-flex h-10 items-center gap-3 rounded-[10px] border border-ink-border bg-ink px-3.5 font-mono text-[12.5px] text-ink-foreground transition-colors hover:border-ink-accent/60"
            >
              <span className="text-ink-accent">$</span>
              {install}
              <span className={cn("text-[11px]", copied ? "text-ok" : "text-ink-muted")}>
                {copied ? t("plugin.copied") : t("plugin.copy")}
              </span>
            </button>
            <ButtonLink href={detail.repositoryUrl ?? "#"} variant="outline">
              {t("plugin.openGithub")}
            </ButtonLink>
          </div>
        </div>

        <div className="mt-12 grid gap-12 lg:grid-cols-[1fr_260px]">
          <div>
            <div className="flex flex-wrap gap-5 border-b border-border pb-3">
              {sections.map((s) => (
                <button
                  key={s}
                  onClick={() => setActive(s)}
                  className={cn(
                    "relative pb-3 text-[13.5px] transition-colors",
                    active === s
                      ? "text-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {sectionLabel(s, locale)}
                  {active === s && (
                    <span className="absolute -bottom-px left-0 h-px w-full bg-accent" />
                  )}
                </button>
              ))}
            </div>

            <div className="mt-8 space-y-6">
              {active === "overview" ? <OverviewPanel detail={detail} locale={locale} /> : null}
              {active === "releases" ? <ReleasesPanel releases={detail.releases} /> : null}
              {active === "dependencies" ? (
                <DependenciesPanel dependencies={detail.dependencies} />
              ) : null}
              {active === "media" ? <MediaPanel media={detail.media} name={plugin.name} /> : null}
              {active === "reviews" ? <ReviewsPanel slug={plugin.slug} locale={locale} /> : null}
            </div>
          </div>

          <aside>
            <div className="space-y-px overflow-hidden rounded-xl border border-border bg-border">
              {[
                ["Latest version", `v${plugin.version}`],
                ["Compatibility", plugin.compat],
                ["License", detail.license ?? "Unknown"],
                [
                  "Repository",
                  detail.repositoryUrl ? new URL(detail.repositoryUrl).hostname : "Unknown",
                ],
                ["Updated", plugin.updated],
                ["Downloads", plugin.downloads],
                ["Stars", String(plugin.stars)],
                ["Category", plugin.category],
              ].map(([k, v]) => (
                <div key={k} className="flex items-center justify-between bg-surface px-4 py-3">
                  <span className="text-[12.5px] text-muted-foreground">{k}</span>
                  <span className="font-mono text-[12px]">{v}</span>
                </div>
              ))}
            </div>
            <PluginCommunityActions pluginId={detail.id} slug={plugin.slug} locale={locale} />
          </aside>
        </div>

        <div className="mt-20">
          <SectionLabel index="→">{t("plugin.related")}</SectionLabel>
          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            {related.map((p) => (
              <Link
                key={p.slug}
                to={localizedPath(locale, "/plugins/" + p.slug)}
                className="rounded-xl border border-border bg-surface p-4 transition-colors hover:border-border-strong"
              >
                <div className="text-[14px] font-medium">{p.name}</div>
                <div className="mt-1 font-mono text-[11.5px] text-muted-foreground">{p.scope}</div>
              </Link>
            ))}
          </div>
        </div>
      </Container>
    </main>
  );
}

function sectionLabel(section: DetailSection, locale: "en" | "zh") {
  const labels = {
    overview: ["Overview", "概览"],
    releases: ["Releases", "版本"],
    dependencies: ["Dependencies", "依赖"],
    media: ["Media", "媒体"],
    reviews: ["Reviews", "评价"],
  } as const;
  return labels[section][locale === "zh" ? 1 : 0];
}

function OverviewPanel({
  detail,
  locale,
}: {
  detail: ReturnType<typeof Route.useLoaderData>;
  locale: "en" | "zh";
}) {
  return (
    <div className="space-y-8">
      <div className="whitespace-pre-wrap text-[15px] leading-7 text-muted-foreground">
        {detail.overviewMarkdown ?? detail.plugin.description}
      </div>
      <section>
        <h2 className="text-base font-medium">
          {locale === "zh" ? "安装目标" : "Install targets"}
        </h2>
        <div className="mt-3 divide-y divide-ink-border overflow-hidden rounded-xl border border-ink-border bg-ink">
          {detail.installTargets.map(
            (target: { kind: string; spec: string; status: string; is_primary: number }) => (
              <div
                key={`${target.kind}:${target.spec}`}
                className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <code className="font-mono text-xs text-ink-foreground">
                  dsh plugin add {target.spec}
                </code>
                <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink-muted">
                  {target.kind} · {target.status}
                  {target.is_primary === 1 ? " · primary" : ""}
                </span>
              </div>
            ),
          )}
        </div>
      </section>
      {detail.installNotesMarkdown ? (
        <section>
          <h2 className="text-base font-medium">
            {locale === "zh" ? "安装说明" : "Install notes"}
          </h2>
          <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
            {detail.installNotesMarkdown}
          </p>
        </section>
      ) : null}
      {detail.capabilities.length ? (
        <section>
          <h2 className="text-base font-medium">{locale === "zh" ? "能力" : "Capabilities"}</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {detail.capabilities.map((capability: { kind: string; identifier: string }) => (
              <Chip key={`${capability.kind}:${capability.identifier}`}>
                {capability.kind}:{capability.identifier}
              </Chip>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function ReleasesPanel({
  releases,
}: {
  releases: ReturnType<typeof Route.useLoaderData>["releases"];
}) {
  if (!releases.length) return <EmptyPanel>No release records are available.</EmptyPanel>;
  return (
    <div className="divide-y divide-border border-y border-border">
      {releases.map(
        (release: {
          version: string;
          channel: string;
          compatibility_range: string | null;
          git_tag: string | null;
          release_notes_url: string | null;
        }) => (
          <article
            key={release.version}
            className="grid gap-3 py-5 sm:grid-cols-[130px_1fr_auto] sm:items-center"
          >
            <div>
              <div className="font-mono text-sm">v{release.version}</div>
              <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                {release.channel}
              </div>
            </div>
            <div className="text-sm text-muted-foreground">
              {release.compatibility_range
                ? `DSH ${release.compatibility_range}`
                : "Compatibility not declared"}
              {release.git_tag ? ` · ${release.git_tag}` : ""}
            </div>
            {release.release_notes_url ? (
              <a
                href={release.release_notes_url}
                target="_blank"
                rel="noreferrer"
                className="text-sm text-accent hover:underline"
              >
                Release notes
              </a>
            ) : (
              <span className="text-xs text-muted-foreground">No notes</span>
            )}
          </article>
        ),
      )}
    </div>
  );
}

function DependenciesPanel({
  dependencies,
}: {
  dependencies: ReturnType<typeof Route.useLoaderData>["dependencies"];
}) {
  if (!dependencies.length)
    return (
      <EmptyPanel>
        No runtime, peer, or optional dependencies were declared for the latest release.
      </EmptyPanel>
    );
  return (
    <div className="divide-y divide-border border-y border-border">
      {dependencies.map(
        (dependency: { kind: string; package_name: string; version_range: string }) => (
          <div
            key={`${dependency.kind}:${dependency.package_name}`}
            className="grid grid-cols-[1fr_auto] gap-4 py-4"
          >
            <code className="font-mono text-sm">{dependency.package_name}</code>
            <div className="text-right">
              <div className="font-mono text-xs">{dependency.version_range}</div>
              <div className="mt-1 text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                {dependency.kind}
              </div>
            </div>
          </div>
        ),
      )}
    </div>
  );
}

function MediaPanel({
  media,
  name,
}: {
  media: ReturnType<typeof Route.useLoaderData>["media"];
  name: string;
}) {
  if (!media.length)
    return <EmptyPanel>No verified screenshots or artwork have been published.</EmptyPanel>;
  return (
    <div className="grid gap-5 sm:grid-cols-2">
      {media.map(
        (item: {
          id: string;
          alt_text: string | null;
          caption: string | null;
          width: number | null;
          height: number | null;
        }) => (
          <figure
            key={item.id}
            className="overflow-hidden rounded-xl border border-border bg-surface"
          >
            <img
              src={`/api/media/${item.id}`}
              alt={item.alt_text ?? name}
              width={item.width ?? undefined}
              height={item.height ?? undefined}
              className="aspect-video w-full object-cover"
              loading="lazy"
            />
            {item.caption ? (
              <figcaption className="px-4 py-3 text-xs text-muted-foreground">
                {item.caption}
              </figcaption>
            ) : null}
          </figure>
        ),
      )}
    </div>
  );
}

type ReviewItem = {
  id: string;
  rating: number;
  locale: string;
  body: string | null;
  created_at: number;
  user_name: string;
  user_image: string | null;
  replies: string | Array<{ id: string; body: string; userName: string; createdAt: number }>;
};

function reviewReplies(value: ReviewItem["replies"]) {
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value || "[]") as unknown;
    return Array.isArray(parsed)
      ? (parsed as Array<{ id: string; body: string; userName: string; createdAt: number }>)
      : [];
  } catch {
    return [];
  }
}

function ReviewsPanel({ slug, locale }: { slug: string; locale: "en" | "zh" }) {
  const [items, setItems] = useState<ReviewItem[] | null>(null);
  useEffect(() => {
    let live = true;
    const load = () =>
      void fetch(`/api/plugins/${encodeURIComponent(slug)}/reviews?limit=50`)
        .then((response) => response.json() as Promise<{ items: ReviewItem[] }>)
        .then((page) => {
          if (live) setItems(page.items);
        })
        .catch(() => {
          if (live) setItems([]);
        });
    const changed = (event: Event) => {
      if ((event as CustomEvent<{ slug?: string }>).detail?.slug === slug) load();
    };
    load();
    window.addEventListener("dshx:reviews-changed", changed);
    return () => {
      live = false;
      window.removeEventListener("dshx:reviews-changed", changed);
    };
  }, [slug]);
  if (!items)
    return <EmptyPanel>{locale === "zh" ? "正在读取评价…" : "Loading reviews…"}</EmptyPanel>;
  if (!items.length)
    return (
      <EmptyPanel>{locale === "zh" ? "还没有公开评价。" : "No public reviews yet."}</EmptyPanel>
    );
  return (
    <div className="divide-y divide-border border-y border-border">
      {items.map((review) => {
        const replies = reviewReplies(review.replies);
        return (
          <article key={review.id} className="py-5">
            <div className="flex items-center justify-between gap-4">
              <div className="font-medium">{review.user_name}</div>
              <div
                className="font-mono text-xs text-accent"
                aria-label={`${review.rating} of 5 stars`}
              >
                {"★".repeat(review.rating)}
                {"☆".repeat(5 - review.rating)}
              </div>
            </div>
            {review.body ? (
              <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
                {review.body}
              </p>
            ) : null}
            <div className="mt-3 flex flex-wrap gap-1">
              <ReplyDialog
                reviewId={review.id}
                locale={locale}
                onComplete={() =>
                  window.dispatchEvent(
                    new CustomEvent("dshx:reviews-changed", { detail: { slug } }),
                  )
                }
              />
              <ReportDialog targetType="review" targetId={review.id} />
            </div>
            {replies.length ? (
              <div className="mt-4 space-y-3 border-l border-border pl-4">
                {replies.map((reply) => (
                  <div key={reply.id} className="text-sm">
                    <div className="flex items-center justify-between gap-4">
                      <span className="font-medium">{reply.userName}</span>
                      <ReportDialog targetType="reply" targetId={reply.id} />
                    </div>
                    <p className="mt-1 text-muted-foreground">{reply.body}</p>
                  </div>
                ))}
              </div>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}

function EmptyPanel({ children }: { children: React.ReactNode }) {
  return (
    <p className="border-y border-border py-12 text-center text-sm text-muted-foreground">
      {children}
    </p>
  );
}
