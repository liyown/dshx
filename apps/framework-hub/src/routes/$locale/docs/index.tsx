import { createFileRoute } from "@tanstack/react-router";

import { DocsOverview } from "@/components/dshx/docs-content";
import { parseLocale } from "@/lib/i18n";

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
    return {
      meta: [
        { title: copy.title },
        { name: "description", content: copy.description },
        { property: "og:title", content: copy.title },
        { property: "og:description", content: copy.description },
        { name: "robots", content: "index,follow" },
      ],
      links: [{ rel: "canonical", href: `https://dshx.io/${locale}/docs` }],
    };
  },
  component: DocsOverview,
});
