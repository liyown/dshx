/**
 * docs
 *
 * The reference's chrome and headings. A chapter's own prose is a document and
 * lives with the chapter (`lib/docs/chapters`), not here.
 */

const en = {
  "docs.head.title": "DSHX API reference · Public modules and examples",
  "docs.head.description":
    "Reference for DSHX Host, Client, Settings, typed API, Conversation, config, compiler, CLI, and compatibility APIs.",
  "docs.pageTitle.gettingStarted": "Create a DeepSeek Harness Plugin with DSHX",
  "docs.pageTitle.compatibility": "DSHX Compatibility with DeepSeek Harness Versions",
  "docs.shell.home": "Documentation home",
  "docs.shell.mobile": "Documentation navigation",
  "docs.shell.version": "DSHX 0.2",
  "docs.shell.experimental": "experimental",
  "docs.shell.onPage": "On this chapter",
  "docs.overview.eyebrow": "API documentation",
  "docs.overview.title": "DSHX API reference",
  "docs.overview.intro":
    "Choose a public module to see its exported functions, signatures, parameters, return values, examples, automatic wiring, and errors.",
  "docs.overview.quickstart": "Quick start",
  "docs.overview.quickstartBody":
    "The initializer creates the conventional Host and Client entries, installs dependencies, and prepares the official DeepSeek Harness development loop.",
  "docs.overview.ready": "host ready · client watching · DeepSeek Harness opened",
  "docs.overview.chapters": "API modules and guides",
  "docs.overview.chaptersBody":
    "Host, Client, Settings, Typed API, Conversation, compiler, CLI, and compatibility are documented separately.",
  "docs.overview.open": "Open reference",
  "docs.overview.experimental": "Experimental",
  "docs.overview.next": "New project",
  "docs.overview.nextBody":
    "Create the starter project, then use the reference for the modules imported by your plugin.",
  "docs.pager.previous": "Previous",
  "docs.pager.next": "Next",
  "docs.pager.index": "All chapters",
  "docs.verification.label": "verification",
  "docs.verification.title": "Sources and last verification",
  "docs.verification.lastVerified": "Last verified: ",
  "docs.copyPrompt.idle": "Copy development prompt",
  "docs.copyPrompt.copied": "Copied. Paste it into your Agent",
  "docs.copyPrompt.failed": "Copy failed. Try again",
  "docs.copyPrompt.title":
    "Copy a prompt for your Agent to install the current DSHX development Skill, read the API guide, and distinguish offline checks from a real DeepSeek Harness smoke test.",
} as const;

const zh: Record<keyof typeof en, string> = {
  "docs.head.title": "DSHX API 参考 · 公开模块与示例",
  "docs.head.description":
    "DSHX Host、Client、Settings、类型化 API、Conversation、配置、Compiler、CLI 与兼容性 API 参考。",
  "docs.pageTitle.gettingStarted": "使用 DSHX 创建 DeepSeek Harness 插件",
  "docs.pageTitle.compatibility": "DSHX 与 DeepSeek Harness 版本兼容性",
  "docs.shell.home": "文档首页",
  "docs.shell.mobile": "文档导航",
  "docs.shell.version": "DSHX 0.2",
  "docs.shell.experimental": "实验性",
  "docs.shell.onPage": "本章目录",
  "docs.overview.eyebrow": "API 文档",
  "docs.overview.title": "DSHX API 参考",
  "docs.overview.intro": "按公开模块查看导出函数、签名、参数、返回值、完整示例、自动接线与错误。",
  "docs.overview.quickstart": "快速开始",
  "docs.overview.quickstartBody":
    "初始化器会创建标准 Host 与 Client 入口、安装依赖，并准备官方 DeepSeek Harness 开发循环。",
  "docs.overview.ready": "Host 就绪 · Client 监听中 · DeepSeek Harness 已打开",
  "docs.overview.chapters": "API 模块与指南",
  "docs.overview.chaptersBody":
    "Host、Client、Settings、类型化 API、Conversation、Compiler、CLI 与兼容性分别说明。",
  "docs.overview.open": "打开参考",
  "docs.overview.experimental": "实验性",
  "docs.overview.next": "新建项目",
  "docs.overview.nextBody": "先创建 starter project，再按插件实际 import 的模块查阅 API。",
  "docs.pager.previous": "上一章",
  "docs.pager.next": "下一章",
  "docs.pager.index": "全部章节",
  "docs.verification.label": "验证",
  "docs.verification.title": "来源与最后验证",
  "docs.verification.lastVerified": "最后验证日期：",
  "docs.copyPrompt.idle": "复制开发 Prompt",
  "docs.copyPrompt.copied": "已复制，粘贴给 Agent",
  "docs.copyPrompt.failed": "复制失败，请重试",
  "docs.copyPrompt.title":
    "复制一段 Prompt，让 Agent 安装当前 DSHX 开发 Skill、读取 API 指引，并区分离线检查与真实 DeepSeek Harness smoke test。",
};

export const docsMessages = { en, zh };
