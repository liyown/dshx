import type { Locale } from "@/lib/i18n";

export const changelogCopy = {
  en: {
    title: "Changelog",
    eyebrow: "Product updates",
    description:
      "New releases, improvements, and fixes across the DSHX framework, developer tools, and Hub.",
    latest: "Latest release",
    read: "Read release notes",
    back: "All updates",
    published: "Published",
    updated: "Updated",
    version: "Version",
    onThisPage: "In this update",
    sources: "Release links",
    newer: "Newer update",
    older: "Older update",
    navigation: "More updates",
    preview: "Preview",
    release: "Release",
    notFound: "Update not found",
    notFoundDescription: "This update does not exist. Browse the changelog for published releases.",
  },
  zh: {
    title: "更新日志",
    eyebrow: "产品进展",
    description: "记录 DSHX 框架、开发工具和 Hub 的新版本、功能改进与问题修复。",
    latest: "最新发布",
    read: "阅读更新详情",
    back: "全部更新",
    published: "发布日期",
    updated: "更新日期",
    version: "版本",
    onThisPage: "本次更新",
    sources: "发布链接",
    newer: "较新更新",
    older: "较早更新",
    navigation: "更多更新",
    preview: "预览版",
    release: "正式发布",
    notFound: "未找到这条更新",
    notFoundDescription: "这条更新不存在，请返回更新日志查看已发布的版本。",
  },
} as const;

export type ChangelogEntry = {
  readonly slug: string;
  readonly publishedAt: string;
  readonly updatedAt: string;
  readonly version: string;
  readonly product: string;
  readonly channel: "preview" | "release";
  readonly status: "draft" | "published";
  readonly revision: number;
  readonly copy: Readonly<Record<Locale, { readonly title: string; readonly description: string }>>;
};

export function formatChangelogDate(date: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(date));
}
