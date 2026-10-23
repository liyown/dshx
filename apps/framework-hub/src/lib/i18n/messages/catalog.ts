/**
 * catalog
 *
 * The category page's chrome, and the copy the catalog generates for a plugin
 * it publishes — its SEO suffix and the standing paragraphs of a curated
 * overview. Length budgets stay next to the generator in
 * `lib/catalog/content-quality.ts`; the words live here.
 */

const en = {
  "catalog.categoryLabel": "Verified registry",
  "catalog.categoryDescription":
    "Verified DeepSeek Harness bundles in a Hub-managed category. The Hub uses GitHub topics only as source evidence for its public categories.",
  "catalog.categoryTitle": "{name} plugins | DSHX Hub",
  "catalog.categoryMeta":
    "Verified DeepSeek Harness plugins in {name}, with compatibility, version and maintainer information.",
  "catalog.seoTitleSuffix": " – DeepSeek Harness Plugin | DSHX",
  "catalog.seoDescriptionSuffix": " A DeepSeek Harness plugin.",
  "catalog.overviewInstall":
    "Installation: run {command} to add the plugin to DeepSeek Harness's default web profile.",
  "catalog.overviewInstallMissing":
    "Installation: no active primary install target is currently available; consult the upstream documentation first.",
  "catalog.overviewSourceReadme":
    "Source and risk: this overview is derived from the plugin's public README. Read the original documentation and review the source before installation; DSHX catalogs public source claims and has not independently verified security, compatibility, or operability.",
  "catalog.overviewSourceMetadata":
    "Source and risk: this overview uses the currently available public metadata only. Review the upstream source before installation; DSHX has not independently verified security, compatibility, or operability.",
} as const;

const zh: Record<keyof typeof en, string> = {
  "catalog.categoryLabel": "已验证目录",
  "catalog.categoryDescription":
    "Hub 管理的分类中已通过验证的 DeepSeek Harness Bundle。GitHub Topic 仅作为公开分类的来源依据。",
  "catalog.categoryTitle": "{name} 插件 | DSHX Hub",
  "catalog.categoryMeta":
    "查看 {name} 分类中已验证的 DeepSeek Harness 插件、兼容性、版本与维护者信息。",
  "catalog.seoTitleSuffix": " – DeepSeek Harness 插件 | DSHX",
  "catalog.seoDescriptionSuffix": " DeepSeek Harness 插件。",
  "catalog.overviewInstall":
    "安装：使用 {command} 将插件添加到 DeepSeek Harness 默认的 web profile。",
  "catalog.overviewInstallMissing": "安装：当前没有可用的主安装目标，请先查看上游文档。",
  "catalog.overviewSourceReadme":
    "来源与风险：本概述整理自插件的公开 README。安装前请阅读原始文档并审查源码；DSHX 仅整理公开来源声明，未独立验证安全性、兼容性或可运行性。",
  "catalog.overviewSourceMetadata":
    "来源与风险：本概述仅依据当前可用的公开元数据。安装前请审查上游源码；DSHX 未独立验证安全性、兼容性或可运行性。",
};

export const catalogMessages = { en, zh };
