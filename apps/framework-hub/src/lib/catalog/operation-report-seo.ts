import type { Locale } from "@/lib/i18n";
import { createTranslator } from "@/lib/i18n";
import { breadcrumbList, buildSeoHead, localizedAlternates, publicUrl } from "@/lib/seo";

import type { PublicOperationReportDetail } from "./operation-report-detail.server";
import {
  formatOperationReportDay,
  isOperationReportIndexable,
  operationReportDescription,
} from "./operation-report-view";

const organization = {
  "@id": publicUrl("/") + "#organization",
  "@type": "Organization",
  name: "DSHX",
  url: publicUrl("/"),
};

export function buildOperationReportHead(locale: Locale, report: PublicOperationReportDetail) {
  const t = createTranslator(locale);
  const path = `/${locale}/operations/${report.runId}`;
  const date = formatOperationReportDay(report.completedAt, locale);
  const title = `${t("operations.reportTitle", { date })} · DSHX`;
  const description = operationReportDescription(report.body);
  return buildSeoHead({
    locale,
    path,
    title,
    description,
    type: "article",
    robots: isOperationReportIndexable(report.body) ? "index,follow" : "noindex,follow",
    alternates: localizedAlternates(`/operations/${report.runId}`),
    structuredData: [
      organization,
      {
        "@id": publicUrl(path) + "#article",
        "@type": "Article",
        headline: title,
        description,
        url: publicUrl(path),
        mainEntityOfPage: publicUrl(path),
        inLanguage: locale === "zh" ? "zh-CN" : "en",
        datePublished: report.startedAt,
        dateModified: report.completedAt,
        author: organization,
        publisher: organization,
        isPartOf: { "@id": publicUrl(`/${locale}/operations`) + "#collection" },
      },
      breadcrumbList([
        { name: "DSHX", path: `/${locale}` },
        { name: t("operations.title"), path: `/${locale}/operations` },
        { name: t("operations.reportTitle", { date }), path },
      ]),
    ],
  });
}
