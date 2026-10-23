/** changelog */

const en = {
  "changelog.title": "Changelog",
  "changelog.eyebrow": "Product updates",
  "changelog.description":
    "New releases, improvements, and fixes across the DSHX framework, developer tools, and Hub.",
  "changelog.latest": "Latest release",
  "changelog.read": "Read release notes",
  "changelog.back": "All updates",
  "changelog.published": "Published",
  "changelog.updated": "Updated",
  "changelog.version": "Version",
  "changelog.onThisPage": "In this update",
  "changelog.sources": "Release links",
  "changelog.newer": "Newer update",
  "changelog.older": "Older update",
  "changelog.navigation": "More updates",
  "changelog.preview": "Preview",
  "changelog.release": "Release",
  "changelog.notFound": "Update not found",
  "changelog.notFoundDescription":
    "This update does not exist. Browse the changelog for published releases.",
  "changelog.empty": "No updates have been published yet. Check back soon.",
} as const;

const zh: Record<keyof typeof en, string> = {
  "changelog.title": "更新日志",
  "changelog.eyebrow": "产品进展",
  "changelog.description": "记录 DSHX 框架、开发工具和 Hub 的新版本、功能改进与问题修复。",
  "changelog.latest": "最新发布",
  "changelog.read": "阅读更新详情",
  "changelog.back": "全部更新",
  "changelog.published": "发布日期",
  "changelog.updated": "更新日期",
  "changelog.version": "版本",
  "changelog.onThisPage": "本次更新",
  "changelog.sources": "发布链接",
  "changelog.newer": "较新更新",
  "changelog.older": "较早更新",
  "changelog.navigation": "更多更新",
  "changelog.preview": "预览版",
  "changelog.release": "正式发布",
  "changelog.notFound": "未找到这条更新",
  "changelog.notFoundDescription": "这条更新不存在，请返回更新日志查看已发布的版本。",
  "changelog.empty": "还没有发布更新，稍后再来看看。",
};

export const changelogMessages = { en, zh };
