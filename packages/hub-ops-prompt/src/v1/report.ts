import type { ReportSection } from "../contracts.js";

export const dailyReportSections = [
  { id: "source-scope", en: "Source scope", zh: "来源范围" },
  { id: "submissions", en: "Submissions", zh: "投稿处理" },
  { id: "discovery", en: "Proactive discovery", zh: "主动发现" },
  { id: "new-plugins", en: "New plugins", zh: "新增插件" },
  { id: "content", en: "Content completion", zh: "内容补全" },
  { id: "maintenance", en: "Refresh and hide actions", zh: "刷新与隐藏动作" },
  { id: "skipped", en: "Skipped items", zh: "跳过项" },
  { id: "errors", en: "Errors", zh: "错误" },
] as const satisfies readonly ReportSection[];

export const dailyReportTemplate = {
  schemaVersion: 1,
  input: {
    runId: "[stable unique run identifier]",
    startedAt: "[ISO 8601 start time]",
    completedAt: "[ISO 8601 completion time]",
    outcome: "[completed or partial]",
    body: {
      en: "[rendered English body]",
      zh: "[rendered Chinese body]",
    },
  },
  maximumCharactersPerLocale: 10_000,
  rendering: {
    mediaType: "text/plain",
    parseMarkdown: false,
    parseHtml: false,
  },
  sections: dailyReportSections,
  body: {
    en: `DSHX Hub Daily Operations Report
Run: [runId]
Window: [startedAt] to [completedAt]
Result: [completed or partial]

Source scope
[GitHub and npm queries, since time, and pagination coverage]

Submissions
[processed, accepted, duplicate, ignored, and pending counts]

Proactive discovery
[deduplicated sources inspected and skipped]

New plugins
[new draft and published plugin identities]

Content completion
[bilingual metadata and provenance completed]

Refresh and hide actions
[refreshed plugins, explicit hide or restore actions, and reasons]

Skipped items
[safe identifiers and concise reasons, or None]

Errors
[sanitized error summaries, or None]`,
    zh: `DSHX Hub 每日运营报告
运行：[runId]
时间范围：[startedAt] 至 [completedAt]
结果：[completed 或 partial]

来源范围
[GitHub 与 npm 查询、起始时间和分页覆盖情况]

投稿处理
[已处理、已接受、重复、忽略和待处理数量]

主动发现
[已检查的去重来源和跳过情况]

新增插件
[新增草稿和已发布插件身份]

内容补全
[已补全的双语元信息和来源引用]

刷新与隐藏动作
[刷新插件、明确隐藏或恢复动作及原因]

跳过项
[安全标识和简要原因，或“无”]

错误
[脱敏后的错误摘要，或“无”]`,
  },
  forbiddenContent: [
    "tokens or credentials",
    "email addresses",
    "private network addresses or private URLs",
    "local file paths",
    "raw stack traces",
    "internal audit payloads",
  ],
} as const;
