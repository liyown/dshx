import { createFileRoute, Link, notFound, redirect } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight } from "lucide-react";

import { MarkdownReport } from "@/components/dshx/markdown-report";
import { PluginCard } from "@/components/dshx/plugin-card";
import { Container } from "@/components/dshx/primitives";
import {
  loadOperationReportDayForRun,
  loadPublicOperationReportDay,
} from "@/lib/catalog/operation-report-functions";
import { buildOperationReportHead } from "@/lib/catalog/operation-report-seo";
import {
  formatOperationReportDate,
  formatOperationReportDayKey,
} from "@/lib/catalog/operation-report-view";
import {
  operationReportDaySchema,
  operationReportRunIdSchema,
} from "@/lib/catalog/operations-v1.contracts";
import { createTranslator, parseLocale, type MessageKey } from "@/lib/i18n";
import { useI18n } from "@/lib/i18n/use-i18n";
import { buildSeoHead } from "@/lib/seo";

export const Route = createFileRoute("/$locale/operations/$reportKey")({
  loader: async ({ params }) => {
    const locale = parseLocale(params.locale);
    if (operationReportRunIdSchema.safeParse(params.reportKey).success) {
      const day = await loadOperationReportDayForRun({ data: { runId: params.reportKey } });
      if (!day) throw notFound();
      throw redirect({
        to: "/$locale/operations/$reportKey",
        params: { locale: params.locale, reportKey: day },
        statusCode: 301,
      });
    }
    if (!operationReportDaySchema.safeParse(params.reportKey).success) throw notFound();
    const report = await loadPublicOperationReportDay({
      data: { day: params.reportKey, locale },
    });
    if (!report) throw notFound();
    return report;
  },
  head: ({ params, loaderData }) => {
    const locale = parseLocale(params.locale);
    if (loaderData) return buildOperationReportHead(locale, loaderData);
    return buildSeoHead({
      locale,
      path: `/${locale}/operations/${encodeURIComponent(params.reportKey)}`,
      title: `${createTranslator(locale)("operations.notFound")} · DSHX`,
      description: createTranslator(locale)("operations.notFoundDescription"),
      robots: "noindex,follow",
      image: false,
    });
  },
  component: OperationReportPage,
  notFoundComponent: OperationReportNotFound,
});

const actionKeys: Record<string, MessageKey> = {
  "observation.created": "operations.action.metadataAdded",
  "observation.updated": "operations.action.metadataUpdated",
  "plugin.curate": "operations.action.curated",
  "plugin.hide": "operations.action.hidden",
  "plugin.restore": "operations.action.restored",
  "submission.accepted": "operations.action.submissionAccepted",
  "submission.duplicate": "operations.action.submissionProcessed",
  "submission.ignored": "operations.action.submissionProcessed",
  "media.upload": "operations.action.mediaUpdated",
  "media.update": "operations.action.mediaUpdated",
};

function actionLabelKeys(actions: readonly string[]): MessageKey[] {
  return [...new Set(actions.map((action) => actionKeys[action] ?? "operations.action.other"))];
}

function OperationReportNotFound() {
  const { locale, t } = useI18n();
  return (
    <main>
      <Container className="py-24 md:py-32">
        <p className="font-mono text-sm text-accent">404</p>
        <h1 className="mt-4 text-3xl font-medium tracking-tight">{t("operations.notFound")}</h1>
        <p className="mt-4 max-w-xl text-[15px] leading-7 text-muted-foreground">
          {t("operations.notFoundDescription")}
        </p>
        <Link
          to="/$locale/operations"
          params={{ locale }}
          search={{ cursor: "" }}
          className="mt-6 inline-flex min-h-10 items-center gap-2 rounded-sm text-sm text-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          {t("operations.back")}
        </Link>
      </Container>
    </main>
  );
}

function OperationReportPage() {
  const locale = parseLocale(Route.useParams().locale);
  const report = Route.useLoaderData();
  const { t } = useI18n();
  const date = formatOperationReportDayKey(report.day, locale);

  return (
    <main>
      <Container className="py-10 md:py-16">
        <nav aria-label={t("operations.metaTitle")}>
          <Link
            to="/$locale/operations"
            params={{ locale }}
            search={{ cursor: "" }}
            className="inline-flex min-h-10 items-center gap-2 rounded-sm text-[13px] text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            {t("operations.back")}
          </Link>
        </nav>

        <article className="mt-8 md:mt-12">
          <header className="border-b border-border pb-10 md:pb-12">
            <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-accent">
              {t("operations.label")}
            </p>
            <h1 className="mt-5 max-w-4xl text-balance text-[clamp(2rem,4.5vw,3.5rem)] font-medium leading-[1.15] tracking-[-0.04em]">
              {t("operations.reportTitle", { date })}
            </h1>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <time
                dateTime={report.completedAt}
                className="font-mono text-[11.5px] text-muted-foreground"
              >
                {formatOperationReportDate(report.completedAt, locale)}
              </time>
              <span
                className={
                  report.outcome === "completed"
                    ? "font-mono text-[11px] uppercase tracking-[0.1em] text-foreground"
                    : "font-mono text-[11px] uppercase tracking-[0.1em] text-warn"
                }
              >
                {t(report.outcome === "completed" ? "operations.completed" : "operations.partial")}
              </span>
              <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-muted-foreground">
                {t("operations.runCount", { count: report.runCount })}
              </span>
            </div>
            <dl className="mt-8 grid gap-x-10 gap-y-4 text-[12px] sm:grid-cols-2">
              <div>
                <dt className="text-muted-foreground">{t("operations.started")}</dt>
                <dd className="mt-1.5">
                  <time dateTime={report.startedAt}>
                    {formatOperationReportDate(report.startedAt, locale)}
                  </time>
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">{t("operations.completedAt")}</dt>
                <dd className="mt-1.5">
                  <time dateTime={report.completedAt}>
                    {formatOperationReportDate(report.completedAt, locale)}
                  </time>
                </dd>
              </div>
            </dl>
          </header>

          <div className="pt-10 md:pt-14">
            <MarkdownReport>{report.body}</MarkdownReport>
          </div>

          {report.earlier.length > 0 ? (
            <details className="mt-10 rounded-lg border border-border bg-surface px-5 py-4 md:px-6">
              <summary className="cursor-pointer text-[13px] font-medium text-foreground">
                {t("operations.earlierRuns", { count: report.earlierTotal })}
              </summary>
              <div className="mt-6 space-y-10">
                {report.earlier.map((run) => (
                  <section key={run.runId}>
                    <p className="font-mono text-[11px] text-muted-foreground">
                      {formatOperationReportDate(run.completedAt, locale)} ·{" "}
                      {t(
                        run.outcome === "completed" ? "operations.completed" : "operations.partial",
                      )}
                    </p>
                    <MarkdownReport className="mt-3">{run.body}</MarkdownReport>
                  </section>
                ))}
              </div>
              {report.earlierTotal > report.earlier.length ? (
                <p className="mt-6 font-mono text-[11px] text-muted-foreground">
                  {t("operations.earlierRunsShown", { count: report.earlier.length })}
                </p>
              ) : null}
            </details>
          ) : null}
        </article>

        {report.related.length > 0 ? (
          <section className="mt-16 border-t border-border pt-10" aria-labelledby="run-plugins">
            <div className="mb-6">
              <h2 id="run-plugins" className="text-[18px] font-medium">
                {t("operations.relatedPlugins")}
              </h2>
              <p className="mt-2 max-w-2xl text-[13px] leading-6 text-muted-foreground">
                {t("operations.relatedPluginsDescription")}
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {report.related.map(({ plugin, actions }) => (
                <div key={plugin.slug}>
                  <p className="mb-2 font-mono text-[10.5px] uppercase tracking-[0.1em] text-muted-foreground">
                    {actionLabelKeys(actions)
                      .map((key) => t(key))
                      .join(" · ")}
                  </p>
                  <PluginCard plugin={plugin} />
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {report.newerDay || report.olderDay ? (
          <nav
            aria-label={t("operations.reportNavigation")}
            className="mt-16 grid gap-8 border-t border-border pt-8 sm:grid-cols-2"
          >
            {report.newerDay ? (
              <Link
                to="/$locale/operations/$reportKey"
                params={{ locale, reportKey: report.newerDay }}
                className="group rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
              >
                <span className="flex items-center gap-2 text-[12px] text-muted-foreground">
                  <ArrowLeft className="size-3.5" aria-hidden="true" />
                  {t("operations.newerReport")}
                </span>
                <span className="mt-2 block text-[15px] font-medium group-hover:text-accent">
                  {formatOperationReportDayKey(report.newerDay, locale)}
                </span>
              </Link>
            ) : (
              <span />
            )}
            {report.olderDay ? (
              <Link
                to="/$locale/operations/$reportKey"
                params={{ locale, reportKey: report.olderDay }}
                className="group rounded-sm text-right focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
              >
                <span className="flex items-center justify-end gap-2 text-[12px] text-muted-foreground">
                  {t("operations.olderReport")}
                  <ArrowRight className="size-3.5" aria-hidden="true" />
                </span>
                <span className="mt-2 block text-[15px] font-medium group-hover:text-accent">
                  {formatOperationReportDayKey(report.olderDay, locale)}
                </span>
              </Link>
            ) : null}
          </nav>
        ) : null}
      </Container>
    </main>
  );
}
