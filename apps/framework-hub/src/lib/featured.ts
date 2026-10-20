export const featuredCopy = {
  en: {
    eyebrow: "Curated by DSHX",
    title: "Featured DeepSeek Harness plugins",
    description:
      "A hand-picked shelf of strong DeepSeek Harness plugins, organized by the jobs they do. Each row is curated by the Hub operators, not ranked automatically.",
    browseCategory: "Browse category",
    categories: "Categories",
    jumpTo: "Jump to a featured category",
    pluginCount: (count: number) => (count === 1 ? "1 plugin" : `${count} plugins`),
    empty:
      "Featured shelves are being curated. Browse the DeepSeek Harness plugin catalog in the meantime.",
    browseAll: "Browse all plugins",
  },
  zh: {
    eyebrow: "DSHX 精选",
    title: "精选 DeepSeek Harness 插件",
    description:
      "按用途整理的优质 DeepSeek Harness 插件人工精选清单，每一行由 Hub 运营挑选，而非自动排序。",
    browseCategory: "浏览分类",
    categories: "类目",
    jumpTo: "跳转到精选类目",
    pluginCount: (count: number) => `${count} 个插件`,
    empty: "精选清单正在整理中，可以先浏览完整的 DeepSeek Harness 插件目录。",
    browseAll: "浏览全部插件",
  },
} as const;
