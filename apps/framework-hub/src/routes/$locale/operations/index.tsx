import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";

import { Container, SectionLabel } from "@/components/dshx/primitives";
import { loadPublicOperationReports } from "@/lib/catalog/operation-report-functions";
import { formatOperationReportDate } from "@/lib/catalog/operation-report-view";
import { createTranslator, parseLocale, useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/$locale/operations/")({
  validateSearch: (search: Record<string, unknown>) => ({
    cursor: typeof search["cursor"] === "string" ? search["cursor"].slice(0, 1_000) : "",
  }),
  loaderDeps: ({ search }) => search,
  loader: ({ params, deps }) =>
    loadPublicOperationReports({
      data: {
        locale: parseLocale(params.locale),
        limit: 20,
        ...(deps.cursor ? { cursor: deps.cursor } : {}),
      },
    }),
  head: ({ params }) => {
    const locale = parseLocale(params.locale);
    const t = createTranslator(locale);
    return {
      meta: [
        { title: t("operations.metaTitle") },
        { name: "description", content: t("operations.intro") },
        { property: "og:title", content: t("operations.metaTitle") },
        { property: "og:description", content: t("operations.intro") },
        { name: "robots", content: "index,follow" },
      ],
      links: [
        { rel: "canonical", href: `https://dshx.io/${locale}/operations` },
        { rel: "alternate", hrefLang: "en", href: "https://dshx.io/en/operations" },
        { rel: "alternate", hrefLang: "zh", href: "https://dshx.io/zh/operations" },
        { rel: "alternate", hrefLang: "x-default", href: "https://dshx.io/en/operations" },
      ],
    };
  },
  component: OperationsPage,
});

function ReportEntry({
  report,
  latest = false,
}: {
  report: ReturnType<typeof Route.useLoaderData>["items"][number];
  latest?: boolean;
}) {
  const { locale, t } = useI18n();
  return (
    <article
      className={
        latest
          ? "rounded-xl border border-border-strong bg-surface px-5 py-6 md:px-7"
          : "border-t border-border py-7"
      }
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          {latest ? <span className="mono-label text-accent">{t("operations.latest")}</span> : null}
          <time className="font-mono text-[11.5px] text-muted-foreground">
            {formatOperationReportDate(report.completedAt, locale)}
          </time>
        </div>
        <span
          className={
            report.outcome === "completed"
              ? "font-mono text-[11px] uppercase tracking-[0.1em] text-foreground"
              : "font-mono text-[11px] uppercase tracking-[0.1em] text-warn"
          }
        >
          {t(report.outcome === "completed" ? "operations.completed" : "operations.partial")}
        </span>
      </div>
      <p className="mt-5 whitespace-pre-wrap break-words text-[14px] leading-7 text-foreground [overflow-wrap:anywhere]">
        {report.body}
      </p>
      <p className="mt-5 break-all font-mono text-[10.5px] text-muted-foreground">{report.runId}</p>
    </article>
  );
}

function OperationsPage() {
  const reports = Route.useLoaderData();
  const search = Route.useSearch();
  const params = Route.useParams();
  const { t } = useI18n();
  const latest = search.cursor ? null : (reports.items[0] ?? null);
  const history = latest ? reports.items.slice(1) : reports.items;

  return (
    <main>
      <Container className="py-16 md:py-24">
        <SectionLabel index="/operations">{t("operations.label")}</SectionLabel>
        <h1 className="text-balance-tight mt-6 max-w-3xl text-[clamp(2rem,4.5vw,3.25rem)] leading-[1.05] font-medium">
          {t("operations.title")}
        </h1>
        <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-muted-foreground">
          {t("operations.intro")}
        </p>

        <div className="mt-12">{latest ? <ReportEntry report={latest} latest /> : null}</div>
        {history.length ? (
          <section className={latest ? "mt-12" : "mt-4"} aria-label={t("operations.history")}>
            <div className="mb-3 flex items-center justify-between">
              <span className="mono-label">{t("operations.history")}</span>
              <span className="font-mono text-[11px] text-muted-foreground">
                {t("operations.textOnly")}
              </span>
            </div>
            {history.map((report) => (
              <ReportEntry key={report.runId} report={report} />
            ))}
          </section>
        ) : null}
        {!reports.items.length ? (
          <p className="mt-12 border-t border-border py-8 font-mono text-[12.5px] text-muted-foreground">
            {t("operations.empty")}
          </p>
        ) : null}

        {reports.nextCursor ? (
          <div className="mt-10 flex justify-center">
            <Link
              to="/$locale/operations"
              params={{ locale: params.locale }}
              search={{ cursor: reports.nextCursor }}
              className="inline-flex h-10 items-center gap-2 rounded-md border border-border-strong bg-surface px-4 text-sm transition-colors hover:bg-surface-2"
            >
              {t("operations.next")} <ArrowRight className="size-4" data-icon="inline-end" />
            </Link>
          </div>
        ) : null}
      </Container>
    </main>
  );
}
