import type { ReportSection } from "../contracts.js";

/** Optional editorial labels; reports may omit, combine, or replace them. */
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
    mediaType: "text/markdown",
    dialect: "GitHub Flavored Markdown",
    parseMarkdown: true,
    parseHtml: false,
  },
  markdown: {
    includeTitle: false,
    topLevelHeading: "h2",
    allowHtml: false,
    allowImages: false,
    mergeMarker: "<!-- daily-report:merged -->",
  },
  dailyMerge: {
    enabled: true,
    timeZone: "Asia/Shanghai",
    description:
      "When a report from the same UTC+8 calendar day already exists, publish the cumulative daily report instead of a separate run note.",
  },
  sections: dailyReportSections,
  requiredSections: false,
  organization:
    "Choose the structure that best explains the day's actual work, using stable H2 headings so merged reports stay readable.",
  body: {
    en: "[Explain the priorities, evidence, useful findings, and confirmed changes that mattered. Include material unfinished work or blockers when relevant. Use GitHub-Flavored Markdown with H2 sections; omit empty categories.]",
    zh: "[说明本轮重要的判断、证据、有用发现和已确认的改动；有实质未完成事项或阻碍时如实交代。使用 GitHub-Flavored Markdown 和 H2 分节；不必填写空白类别。]",
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
