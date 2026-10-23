export const featuredCopy = {
  en: {
    eyebrow: "Curated by DSHX",
    title: "Featured DeepSeek Harness plugins",
    description:
      "A hand-picked shelf of strong DeepSeek Harness plugins, organized by the jobs they do. Each row is curated by the Hub operators, not ranked automatically.",
    editorialNote:
      "Hand-picked by the Hub operators for compatibility and active maintenance — open any plugin to see its source, versions and release history.",
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
    editorialNote:
      "由 Hub 运营按兼容性与维护活跃度挑选；打开任意插件都能看到源码、版本和发布记录。",
    browseCategory: "浏览分类",
    categories: "类目",
    jumpTo: "跳转到精选类目",
    pluginCount: (count: number) => `${count} 个插件`,
    empty: "精选清单正在整理中，可以先浏览完整的 DeepSeek Harness 插件目录。",
    browseAll: "浏览全部插件",
  },
} as const;

/**
 * Editorial shelf names and descriptions. Featured picks are stored against
 * existing catalog categories, but the featured page intentionally uses its
 * own copy so the catalog taxonomy can stay stable while the shelves stay
 * opinionated. Keep this keyed by the category slug stored in
 * `featured_plugin_picks`.
 */
export const featuredShelfCopy = {
  en: {
    ui: {
      name: "Skins & Interface",
      description:
        "Themes, skins, sidebars, terminal UIs, and small widgets that change how DSH looks and feels.",
    },
    remote: {
      name: "Remote & Mobile",
      description:
        "Keep working when you leave the desk: phone pairing, browser remote control, and multi-device sessions.",
    },
    memory: {
      name: "Memory & Context",
      description:
        "Make agents remember projects, recall history, and keep context budgets honest.",
    },
    model: {
      name: "Models & Access",
      description: "Bring subscriptions, third-party models, OAuth, and fallback chains into DSH.",
    },
    "agent-automation": {
      name: "Agents & Automation",
      description: "Multi-agent teams, DAGs, scheduled jobs, and repeatable workflows.",
    },
    dev: {
      name: "Developer Workbench",
      description: "Git graphs, diffs, GitHub PR/CI, iOS simulators, and low-token file tools.",
    },
    vision: {
      name: "Browser & Multimodal",
      description: "Give text-only models eyes on web pages, images, and architecture diagrams.",
    },
    market: {
      name: "Markets & Trust",
      description:
        "Discover, install, manage, and review plugins without installing something you regret.",
    },
    session: {
      name: "Session & Rewind",
      description: "Edit mistakes, rewind turns, recover sessions, and compare exploration paths.",
    },
    fun: {
      name: "Fun & Experiments",
      description:
        "Desktop pets, memes, and 2005-era web ads. Not useful, but it gives DSH a personality.",
    },
  },
  zh: {
    ui: {
      name: "皮肤与界面",
      description: "主题、皮肤、侧边栏、终端 UI 和小组件，改变 DSH 的样子和手感。",
    },
    remote: {
      name: "远程与移动",
      description: "离开电脑也能继续：手机扫码、浏览器远控、多设备会话续接。",
    },
    memory: {
      name: "记忆与上下文",
      description: "让 agent 记住项目、召回历史，并把上下文压到该有的位置。",
    },
    model: {
      name: "模型与接入",
      description: "把订阅、第三方模型、OAuth 和 fallback 链接进 DSH。",
    },
    "agent-automation": {
      name: "智能体与自动化",
      description: "多 agent 编队、DAG、定时任务和可重复的工作流。",
    },
    dev: {
      name: "开发与代码",
      description: "Git 图、diff、GitHub PR/CI、iOS 模拟器和低 token 文件工具。",
    },
    vision: {
      name: "浏览与多模态",
      description: "让纯文本模型看见网页、图片和架构图。",
    },
    market: {
      name: "插件市集与治理",
      description: "发现、安装、管理和审查插件，避免装到坏东西。",
    },
    session: {
      name: "会话与回滚",
      description: "改错消息、回退回合、恢复会话、对比探索路径。",
    },
    fun: {
      name: "趣味与实验",
      description: "桌宠、梗图、2005 年网页广告；不实用，但让 DSH 有性格。",
    },
  },
} as const;

export type FeaturedShelfSlug = keyof typeof featuredShelfCopy.en;

const featuredShelfSlugs = Object.keys(featuredShelfCopy.en) as FeaturedShelfSlug[];
const featuredShelfOrder = new Map(featuredShelfSlugs.map((slug, index) => [slug, index]));

export function isFeaturedShelfSlug(slug: string): slug is FeaturedShelfSlug {
  return (featuredShelfSlugs as string[]).includes(slug);
}

/**
 * Editorial shelves have their own reading order, independent of the catalog's
 * category sort order. Unknown categories keep their database order after the
 * known shelves so operators can add a shelf before this module ships copy
 * for it.
 */
export function orderFeaturedSections<T extends { readonly slug: string }>(
  sections: readonly T[],
): T[] {
  return [...sections].sort((left, right) => {
    const leftOrder = featuredShelfOrder.get(left.slug as FeaturedShelfSlug);
    const rightOrder = featuredShelfOrder.get(right.slug as FeaturedShelfSlug);
    if (leftOrder === undefined && rightOrder === undefined) return 0;
    if (leftOrder === undefined) return 1;
    if (rightOrder === undefined) return -1;
    return leftOrder - rightOrder;
  });
}

/**
 * Overlay editorial copy on a database-backed section. Unknown category slugs
 * keep their stored localization so operators can add a shelf before this
 * module ships a name for it.
 */
export function withFeaturedShelfCopy<
  T extends { readonly slug: string; readonly name: string; readonly description: string | null },
>(section: T, locale: "en" | "zh"): T {
  if (!isFeaturedShelfSlug(section.slug)) return section;
  const copy = featuredShelfCopy[locale][section.slug];
  return { ...section, name: copy.name, description: copy.description };
}
