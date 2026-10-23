import type { Locale } from "@/lib/i18n";

export const blogCopy = {
  en: {
    title: "Blog",
    eyebrow: "Field notes",
    latest: "Latest article",
    description:
      "Practical guides, plugin walkthroughs, and notes from building on the DSHX toolchain and the DeepSeek Harness runtime.",
    read: "Read article",
    back: "All articles",
    published: "Published",
    updated: "Updated",
    onThisPage: "In this article",
    relatedPlugins: "Plugins in this article",
    relatedPluginsDescription: "Verified bundles mentioned in this piece.",
    newer: "Newer article",
    older: "Older article",
    navigation: "More articles",
    notFound: "Article not found",
    notFoundDescription:
      "This article does not exist or is no longer published. Browse the blog for recent writing.",
    empty: "No articles have been published yet. Check back soon.",
  },
  zh: {
    title: "博客",
    eyebrow: "实践笔记",
    latest: "最新文章",
    description: "记录 DSHX 工具链与 DeepSeek Harness Runtime 上的实践指南、插件教程与开发笔记。",
    read: "阅读文章",
    back: "全部文章",
    published: "发布日期",
    updated: "更新日期",
    onThisPage: "本文目录",
    relatedPlugins: "文中插件",
    relatedPluginsDescription: "本文提及的已验证插件。",
    newer: "较新文章",
    older: "较早文章",
    navigation: "更多文章",
    notFound: "未找到这篇文章",
    notFoundDescription: "这篇文章不存在或已取消发布，请返回博客查看近期文章。",
    empty: "还没有发布文章，稍后再来看看。",
  },
} as const;

export type BlogPostSummary = {
  readonly slug: string;
  readonly publishedAt: string;
  readonly updatedAt: string;
  readonly status: "draft" | "published";
  readonly revision: number;
  readonly coverImageUrl: string | null;
  readonly copy: Readonly<Record<Locale, { readonly title: string; readonly description: string }>>;
};
