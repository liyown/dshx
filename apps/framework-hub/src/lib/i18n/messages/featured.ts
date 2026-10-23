/** featured */

const en = {
  "featured.eyebrow": "Curated by DSHX",
  "featured.title": "Featured DeepSeek Harness plugins",
  "featured.description":
    "A hand-picked shelf of strong DeepSeek Harness plugins, organized by the jobs they do. Each row is curated by the Hub operators, not ranked automatically.",
  "featured.editorialNote":
    "Hand-picked by the Hub operators for compatibility and active maintenance — open any plugin to see its source, versions and release history.",
  "featured.browseCategory": "Browse category",
  "featured.categories": "Categories",
  "featured.jumpTo": "Jump to a featured category",
  "featured.empty":
    "Featured shelves are being curated. Browse the DeepSeek Harness plugin catalog in the meantime.",
  "featured.browseAll": "Browse all plugins",
  "featured.pluginCountOne": "1 plugin",
  "featured.pluginCountMany": "{count} plugins",
  "featured.shelf.ui.name": "Skins & Interface",
  "featured.shelf.ui.description":
    "Themes, skins, sidebars, terminal UIs, and small widgets that change how DSH looks and feels.",
  "featured.shelf.remote.name": "Remote & Mobile",
  "featured.shelf.remote.description":
    "Keep working when you leave the desk: phone pairing, browser remote control, and multi-device sessions.",
  "featured.shelf.memory.name": "Memory & Context",
  "featured.shelf.memory.description":
    "Make agents remember projects, recall history, and keep context budgets honest.",
  "featured.shelf.model.name": "Models & Access",
  "featured.shelf.model.description":
    "Bring subscriptions, third-party models, OAuth, and fallback chains into DSH.",
  "featured.shelf.agent-automation.name": "Agents & Automation",
  "featured.shelf.agent-automation.description":
    "Multi-agent teams, DAGs, scheduled jobs, and repeatable workflows.",
  "featured.shelf.dev.name": "Developer Workbench",
  "featured.shelf.dev.description":
    "Git graphs, diffs, GitHub PR/CI, iOS simulators, and low-token file tools.",
  "featured.shelf.vision.name": "Browser & Multimodal",
  "featured.shelf.vision.description":
    "Give text-only models eyes on web pages, images, and architecture diagrams.",
  "featured.shelf.market.name": "Markets & Trust",
  "featured.shelf.market.description":
    "Discover, install, manage, and review plugins without installing something you regret.",
  "featured.shelf.session.name": "Session & Rewind",
  "featured.shelf.session.description":
    "Edit mistakes, rewind turns, recover sessions, and compare exploration paths.",
  "featured.shelf.fun.name": "Fun & Experiments",
  "featured.shelf.fun.description":
    "Desktop pets, memes, and 2005-era web ads. Not useful, but it gives DSH a personality.",
} as const;

const zh: Record<keyof typeof en, string> = {
  "featured.eyebrow": "DSHX 精选",
  "featured.title": "精选 DeepSeek Harness 插件",
  "featured.description":
    "按用途整理的优质 DeepSeek Harness 插件人工精选清单，每一行由 Hub 运营挑选，而非自动排序。",
  "featured.editorialNote":
    "由 Hub 运营按兼容性与维护活跃度挑选；打开任意插件都能看到源码、版本和发布记录。",
  "featured.browseCategory": "浏览分类",
  "featured.categories": "类目",
  "featured.jumpTo": "跳转到精选类目",
  "featured.empty": "精选清单正在整理中，可以先浏览完整的 DeepSeek Harness 插件目录。",
  "featured.browseAll": "浏览全部插件",
  "featured.pluginCountOne": "1 个插件",
  "featured.pluginCountMany": "{count} 个插件",
  "featured.shelf.ui.name": "皮肤与界面",
  "featured.shelf.ui.description": "主题、皮肤、侧边栏、终端 UI 和小组件，改变 DSH 的样子和手感。",
  "featured.shelf.remote.name": "远程与移动",
  "featured.shelf.remote.description": "离开电脑也能继续：手机扫码、浏览器远控、多设备会话续接。",
  "featured.shelf.memory.name": "记忆与上下文",
  "featured.shelf.memory.description": "让 agent 记住项目、召回历史，并把上下文压到该有的位置。",
  "featured.shelf.model.name": "模型与接入",
  "featured.shelf.model.description": "把订阅、第三方模型、OAuth 和 fallback 链接进 DSH。",
  "featured.shelf.agent-automation.name": "智能体与自动化",
  "featured.shelf.agent-automation.description": "多 agent 编队、DAG、定时任务和可重复的工作流。",
  "featured.shelf.dev.name": "开发与代码",
  "featured.shelf.dev.description": "Git 图、diff、GitHub PR/CI、iOS 模拟器和低 token 文件工具。",
  "featured.shelf.vision.name": "浏览与多模态",
  "featured.shelf.vision.description": "让纯文本模型看见网页、图片和架构图。",
  "featured.shelf.market.name": "插件市集与治理",
  "featured.shelf.market.description": "发现、安装、管理和审查插件，避免装到坏东西。",
  "featured.shelf.session.name": "会话与回滚",
  "featured.shelf.session.description": "改错消息、回退回合、恢复会话、对比探索路径。",
  "featured.shelf.fun.name": "趣味与实验",
  "featured.shelf.fun.description": "桌宠、梗图、2005 年网页广告；不实用，但让 DSH 有性格。",
};

export const featuredMessages = { en, zh };
