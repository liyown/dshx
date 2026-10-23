/** blog */

const en = {
  "blog.title": "Blog",
  "blog.eyebrow": "Field notes",
  "blog.latest": "Latest article",
  "blog.description":
    "Practical guides, plugin walkthroughs, and notes from building on the DSHX toolchain and the DeepSeek Harness runtime.",
  "blog.read": "Read article",
  "blog.back": "All articles",
  "blog.published": "Published",
  "blog.updated": "Updated",
  "blog.onThisPage": "In this article",
  "blog.relatedPlugins": "Plugins in this article",
  "blog.relatedPluginsDescription": "Verified bundles mentioned in this piece.",
  "blog.newer": "Newer article",
  "blog.older": "Older article",
  "blog.navigation": "More articles",
  "blog.notFound": "Article not found",
  "blog.notFoundDescription":
    "This article does not exist or is no longer published. Browse the blog for recent writing.",
  "blog.empty": "No articles have been published yet. Check back soon.",
} as const;

const zh: Record<keyof typeof en, string> = {
  "blog.title": "博客",
  "blog.eyebrow": "实践笔记",
  "blog.latest": "最新文章",
  "blog.description":
    "记录 DSHX 工具链与 DeepSeek Harness Runtime 上的实践指南、插件教程与开发笔记。",
  "blog.read": "阅读文章",
  "blog.back": "全部文章",
  "blog.published": "发布日期",
  "blog.updated": "更新日期",
  "blog.onThisPage": "本文目录",
  "blog.relatedPlugins": "文中插件",
  "blog.relatedPluginsDescription": "本文提及的已验证插件。",
  "blog.newer": "较新文章",
  "blog.older": "较早文章",
  "blog.navigation": "更多文章",
  "blog.notFound": "未找到这篇文章",
  "blog.notFoundDescription": "这篇文章不存在或已取消发布，请返回博客查看近期文章。",
  "blog.empty": "还没有发布文章，稍后再来看看。",
};

export const blogMessages = { en, zh };
