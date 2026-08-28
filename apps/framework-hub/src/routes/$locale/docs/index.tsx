import { createFileRoute } from "@tanstack/react-router";

import { DocsOverview } from "@/components/dshx/docs-content";
import { parseLocale } from "@/lib/i18n";
import { buildSeoHead, localizedAlternates } from "@/lib/seo";

const headCopy = {
  en: {
    title: "DSHX API reference · Public modules and examples",
    description:
      "Reference for DSHX Host, Client, Settings, typed API, Conversation, config, compiler, CLI, and compatibility APIs.",
  },
  zh: {
    title: "DSHX API 参考 · 公开模块与示例",
    description:
      "DSHX Host、Client、Settings、类型化 API、Conversation、配置、Compiler、CLI 与兼容性 API 参考。",
  },
} as const;

export const Route = createFileRoute("/$locale/docs/")({
  head: ({ params }) => {
    const locale = parseLocale(params.locale);
    const copy = headCopy[locale];
    return buildSeoHead({
      locale,
      path: `/${locale}/docs`,
      title: copy.title,
      description: copy.description,
      alternates: localizedAlternates("/docs"),
      structuredData: [
        {
          "@id": `https://dshx.io/${locale}/docs#collection`,
          "@type": "CollectionPage",
          name: copy.title,
          description: copy.description,
          url: `https://dshx.io/${locale}/docs`,
          inLanguage: locale === "zh" ? "zh-CN" : "en",
        },
      ],
    });
  },
  component: DocsOverview,
});
