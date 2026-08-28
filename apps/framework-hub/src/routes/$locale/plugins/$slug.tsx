import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, notFound, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { Container, Chip, ButtonLink, SectionLabel } from "@/components/dshx/primitives";
import { PluginCommunityActions } from "@/components/community/plugin-actions";
import { ReplyDialog, ReportDialog } from "@/components/community/community-dialogs";
import { PluginGlyph, PublisherIdentity } from "@/components/dshx/plugin-card";
import { loadCatalogDetail } from "@/lib/catalog/functions";
import { buildPluginInstallCommand, selectInstallTarget } from "@/lib/catalog/install-target";
import { cn } from "@/lib/utils";
import { createTranslator, localizedPath, parseLocale } from "@/lib/i18n";
import { useI18n } from "@/lib/i18n/use-i18n";
import { breadcrumbList, buildSeoHead, localizedAlternatesForLocales } from "@/lib/seo";
import { apiKeys, apiRequest } from "@/lib/api-client";

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
    const primaryTarget = selectInstallTarget(
      loaderData.installTargets,
      p.scope,
      p.version,
      loaderData.repositoryUrl,
    );
    const locale = parseLocale(params.locale);
    const path = `/${locale}/plugins/${p.slug}`;
    const canonical = `https://dshx.io${path}`;
    const socialImage = loaderData.media[0]
      ? `${loaderData.siteUrl}/api/media/${loaderData.media[0].id}`
      : null;
    const sameAs = [loaderData.repositoryUrl];
    if (primaryTarget?.kind === "npm")
      sameAs.push(`https://www.npmjs.com/package/${primaryTarget.package_name}`);
    const title = loaderData.seoTitle;
    const software = {
      "@id": `${canonical}#software`,
      "@type": "SoftwareApplication",
      name: p.name,
      description: loaderData.seoDescription,
      url: canonical,
      applicationCategory: "DeveloperApplication",
      softwareVersion: p.version,
      softwareRequirements: `DeepSeek Harness ${p.compat}`,
      operatingSystem: "Cross-platform",
      author: { "@type": "Person", name: p.author },
      isPartOf: { "@id": `https://dshx.io/${locale}/plugins#directory` },
      sameAs: sameAs.filter((value): value is string => Boolean(value)),
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
    return buildSeoHead({
      locale,
      path,
      title,
      description: loaderData.seoDescription,
      robots: loaderData.indexable ? "index,follow" : "noindex,follow",
      alternates: localizedAlternatesForLocales(`/plugins/${p.slug}`, loaderData.readyLocales),
      ...(socialImage
        ? {
            image: {
              url: socialImage,
              alt: loaderData.media[0]?.alt_text ?? p.name,
              ...(loaderData.media[0]?.width == null ? {} : { width: loaderData.media[0].width }),
              ...(loaderData.media[0]?.height == null
                ? {}
                : { height: loaderData.media[0].height }),
            },
          }
        : {}),
      structuredData: [
        software,
        breadcrumbList([
          { name: "DSHX", path: `/${locale}` },
          { name: "Plugins", path: `/${locale}/plugins` },
          { name: p.name, path },
        ]),
      ],
    });
  },
  component: PluginDetail,
});

const sections = ["overview", "readme", "releases", "dependencies", "media", "reviews"] as const;
type DetailSection = (typeof sections)[number];

function parseHttpUrl(value: string | null): URL | null {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed : null;
  } catch {
    return null;
  }
}

function formatCatalogDate(value: string | number | null, locale: "en" | "zh"): string | null {
  if (value === null) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function PluginDetail() {
  const detail = Route.useLoaderData();
  const { plugin } = detail;
  const { locale, t } = useI18n();
  const [copied, setCopied] = useState(false);
  const [active, setActive] = useState<DetailSection>("overview");
  const primaryTarget = selectInstallTarget(
    detail.installTargets,
    plugin.scope,
    plugin.version,
    detail.repositoryUrl,
  );
  const install = primaryTarget ? buildPluginInstallCommand(primaryTarget.spec) : null;
  const repositoryUrl = parseHttpUrl(detail.repositoryUrl);
  const unavailable = t("plugin.unavailable");
  const facts = [
    [t("plugin.latestVersion"), `v${plugin.version}`],
    [t("plugin.compatibility"), plugin.compat],
    [t("plugin.license"), detail.license ?? unavailable],
    [t("plugin.repository"), repositoryUrl?.hostname ?? unavailable],
    [t("plugin.published"), formatCatalogDate(plugin.publishedAt, locale) ?? unavailable],
    [t("plugin.updated"), formatCatalogDate(plugin.updated, locale) ?? unavailable],
    [t("plugin.downloads"), plugin.downloads],
    [t("plugin.stars"), plugin.stars === null ? "—" : String(plugin.stars)],
    [t("plugin.category"), plugin.category],
  ] as const;

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
                <Chip tone={plugin.badge === "official" ? "accent" : "neutral"}>
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
            {install ? (
              <button
                type="button"
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
            ) : (
              <span className="inline-flex h-10 items-center rounded-[10px] border border-border px-3.5 font-mono text-[12px] text-muted-foreground">
                {t("plugin.installUnavailable")}
              </span>
            )}
            {repositoryUrl ? (
              <ButtonLink href={repositoryUrl.href} variant="outline">
                {t("plugin.openGithub")}
              </ButtonLink>
            ) : null}
          </div>
        </div>

        <div className="mt-12 grid gap-12 lg:grid-cols-[1fr_260px]">
          <div>
            <div className="flex flex-wrap gap-5 border-b border-border pb-3" role="tablist">
              {sections.map((s) => (
                <button
                  type="button"
                  key={s}
                  id={`plugin-tab-${s}`}
                  role="tab"
                  aria-selected={active === s}
                  aria-controls={`plugin-panel-${s}`}
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
              {sections.map((section) => (
                <div
                  key={section}
                  id={`plugin-panel-${section}`}
                  role="tabpanel"
                  aria-labelledby={`plugin-tab-${section}`}
                  hidden={active !== section}
                >
                  {section === "overview" ? (
                    <OverviewPanel detail={detail} locale={locale} />
                  ) : section === "readme" ? (
                    <ReadmePanel detail={detail} locale={locale} />
                  ) : section === "releases" ? (
                    <ReleasesPanel releases={detail.releases} />
                  ) : section === "dependencies" ? (
                    <DependenciesPanel dependencies={detail.dependencies} />
                  ) : section === "media" ? (
                    <MediaPanel media={detail.media} name={plugin.name} />
                  ) : (
                    <ReviewsPanel slug={plugin.slug} locale={locale} />
                  )}
                </div>
              ))}
            </div>
          </div>

          <aside>
            <div className="space-y-px overflow-hidden rounded-xl border border-border bg-border">
              {facts.map(([k, v]) => (
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
    readme: ["README", "README"],
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
  const { t } = useI18n();
  return (
    <div className="space-y-8">
      <section>
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border pb-4">
          <div>
            <h2 className="text-lg font-medium tracking-[-0.02em]">
              {t("plugin.curatedOverview")}
            </h2>
            <p className="mt-1 max-w-2xl text-[13px] leading-5 text-muted-foreground">
              {t("plugin.curatedOverviewDescription")}
            </p>
          </div>
          <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
            {locale}
          </span>
        </div>
        <div
          dir="auto"
          className="mt-5 max-w-[75ch] whitespace-pre-wrap text-[15px] leading-7 text-muted-foreground"
        >
          {detail.overviewMarkdown ?? detail.plugin.description}
        </div>
      </section>
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
                  {buildPluginInstallCommand(target.spec)}
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

function ReadmePanel({
  detail,
  locale,
}: {
  detail: ReturnType<typeof Route.useLoaderData>;
  locale: "en" | "zh";
}) {
  const { t } = useI18n();
  const readme = detail.sourceReadme;
  if (!readme) return <EmptyPanel>{t("plugin.readmeNotCollected")}</EmptyPanel>;
  const sourceUrl = parseHttpUrl(readme.sourceUrl);
  if (readme.availability !== "available" || !readme.content)
    return (
      <div className="space-y-4">
        <EmptyPanel>{t("plugin.readmeUnavailable")}</EmptyPanel>
        {sourceUrl ? (
          <a
            href={sourceUrl.href}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-10 items-center text-[13px] text-muted-foreground underline decoration-border-strong underline-offset-4 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {t("plugin.openReadme")}
          </a>
        ) : null}
      </div>
    );
  const content = readme.content.slice(0, 65_536);
  const truncated = content.length < readme.content.length;
  return (
    <section>
      <div className="flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-lg font-medium tracking-[-0.02em]">{t("plugin.originalReadme")}</h2>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 font-mono text-[10.5px] text-muted-foreground">
            <span>{readme.sourcePath ?? "README.md"}</span>
            {readme.sourceRef ? <span>ref {readme.sourceRef}</span> : null}
            <span>{formatCatalogDate(readme.observedAt, locale)}</span>
            {readme.contentHash ? <span>sha256 {readme.contentHash.slice(0, 12)}</span> : null}
          </div>
        </div>
        {sourceUrl ? (
          <a
            href={sourceUrl.href}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-10 items-center text-[13px] text-muted-foreground underline decoration-border-strong underline-offset-4 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {t("plugin.openReadme")}
          </a>
        ) : null}
      </div>
      <pre
        dir="auto"
        className="mt-6 max-w-[75ch] whitespace-pre-wrap break-words font-mono text-[12.5px] leading-6 text-muted-foreground"
      >
        {content}
      </pre>
      {truncated ? (
        <p className="mt-4 text-[12.5px] leading-6 text-muted-foreground">
          {locale === "zh"
            ? "为控制页面体积，这里展示 README 的前 64 KiB；完整原文请使用上方来源链接。"
            : "To keep the page bounded, this view shows the first 64 KiB of the README. Use the source link above for the complete document."}
        </p>
      ) : null}
    </section>
  );
}

function ReleasesPanel({
  releases,
}: {
  releases: ReturnType<typeof Route.useLoaderData>["releases"];
}) {
  const { locale, t } = useI18n();
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
          published_at: number | null;
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
              <div className="mt-2 text-[11px] text-muted-foreground">
                {t("plugin.releasePublished", {
                  value: formatCatalogDate(release.published_at, locale) ?? t("plugin.unavailable"),
                })}
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
  if (!media.length) return <EmptyPanel>No screenshots or artwork have been published.</EmptyPanel>;
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

const reviewPageSchema = z.object({
  items: z.array(
    z
      .object({
        id: z.string(),
        rating: z.number(),
        locale: z.string(),
        body: z.string().nullable(),
        created_at: z.number(),
        user_name: z.string(),
        user_image: z.string().nullable(),
        replies: z.union([
          z.string(),
          z.array(
            z.object({
              id: z.string(),
              body: z.string(),
              userName: z.string(),
              createdAt: z.number(),
            }),
          ),
        ]),
      })
      .passthrough(),
  ),
});

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
  const queryClient = useQueryClient();
  const path = `/api/plugins/${encodeURIComponent(slug)}/reviews?limit=50`;
  const query = useQuery({
    queryKey: apiKeys.endpoint(path),
    queryFn: ({ signal }) => apiRequest(path, reviewPageSchema, { signal }),
  });
  useEffect(() => {
    const changed = (event: Event) => {
      if ((event as CustomEvent<{ slug?: string }>).detail?.slug === slug)
        void queryClient.invalidateQueries({ queryKey: apiKeys.endpoint(path) });
    };
    window.addEventListener("dshx:reviews-changed", changed);
    return () => window.removeEventListener("dshx:reviews-changed", changed);
  }, [path, queryClient, slug]);
  const items = query.data?.items ?? (query.isError ? [] : null);
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
