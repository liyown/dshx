import type { Locale } from "@/lib/i18n";
import { createTranslator } from "@/lib/i18n";
import { breadcrumbList, buildSeoHead, localizedAlternates, publicUrl } from "@/lib/seo";

import type { PublicOperationReportDay } from "./operation-report-detail.server";
import {
  formatOperationReportDayKey,
  isOperationReportIndexable,
  operationReportDescription,
} from "./operation-report-view";

const organization = {
  "@id": publicUrl("/") + "#organization",
  "@type": "Organization",
  name: "DSHX",
  url: publicUrl("/"),
};

function fullDayBody(report: PublicOperationReportDay) {
  return [report.body, ...report.earlier.map((run) => run.body)].join("\n\n");
}

export function buildOperationReportHead(locale: Locale, report: PublicOperationReportDay) {
  const t = createTranslator(locale);
  const path = `/${locale}/operations/${report.day}`;
  const date = formatOperationReportDayKey(report.day, locale);
  const title = `${t("operations.reportTitle", { date })} · DSHX`;
  const description = operationReportDescription(fullDayBody(report));
  return buildSeoHead({
    locale,
    path,
    title,
    description,
    type: "article",
    robots: isOperationReportIndexable(fullDayBody(report)) ? "index,follow" : "noindex,follow",
    alternates: localizedAlternates(`/operations/${report.day}`),
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
