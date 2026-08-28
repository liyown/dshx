import type { Locale } from "./i18n";

export type AgentDocumentBlock =
  | { readonly kind: "paragraph"; readonly text: string }
  | { readonly kind: "list"; readonly items: readonly string[] }
  | { readonly kind: "code"; readonly code: string; readonly language?: string }
  | {
      readonly kind: "table";
      readonly headers: readonly string[];
      readonly rows: readonly (readonly string[])[];
    };

export type AgentDocumentSection = {
  readonly title: string;
  readonly blocks: readonly AgentDocumentBlock[];
};

export type AgentDocument = {
  readonly title: string;
  readonly description: string;
  readonly canonical: string;
  readonly locale: Locale;
  readonly lastVerified?: string;
  readonly sections: readonly AgentDocumentSection[];
  readonly references?: readonly { readonly label: string; readonly url: string }[];
  readonly structuredData?: readonly Record<string, unknown>[];
};

function scalar(value: string): string {
  return JSON.stringify(value);
}

function escapeCell(value: string): string {
  return value.replaceAll("|", "\\|").replaceAll("\n", "<br>");
}

function codeFence(code: string): string {
  const longest = Math.max(0, ...(code.match(/`+/g) ?? []).map((run) => run.length));
  return "`".repeat(Math.max(3, longest + 1));
}

function renderBlock(block: AgentDocumentBlock): string {
  switch (block.kind) {
    case "paragraph":
      return block.text.trim();
    case "list":
      return block.items.map((item) => `- ${item}`).join("\n");
    case "code": {
      const fence = codeFence(block.code);
      return `${fence}${block.language ?? ""}\n${block.code.trimEnd()}\n${fence}`;
    }
    case "table": {
      const header = `| ${block.headers.map(escapeCell).join(" | ")} |`;
      const divider = `| ${block.headers.map(() => "---").join(" | ")} |`;
      const rows = block.rows.map((row) => `| ${row.map(escapeCell).join(" | ")} |`);
      return [header, divider, ...rows].join("\n");
    }
  }
}

export function renderAgentDocument(document: AgentDocument): string {
  const frontmatter = [
    "---",
    `title: ${scalar(document.title)}`,
    `description: ${scalar(document.description)}`,
    `canonical: ${scalar(document.canonical)}`,
    `language: ${scalar(document.locale === "zh" ? "zh-CN" : "en")}`,
    ...(document.lastVerified ? [`last_verified: ${scalar(document.lastVerified)}`] : []),
    "---",
  ];
  const sections = document.sections.map((section) =>
    [`## ${section.title}`, ...section.blocks.map(renderBlock)].join("\n\n"),
  );
  const references = document.references?.length
    ? [
        [
          "## References",
          document.references
            .map((reference) => `- [${reference.label}](${reference.url})`)
            .join("\n"),
        ].join("\n\n"),
      ]
    : [];
  const structuredData = document.structuredData?.length
    ? [
        [
          "## Structured data",
          "```json\n" +
            JSON.stringify({
              "@context": "https://schema.org",
              "@graph": document.structuredData,
            }) +
            "\n```",
        ].join("\n\n"),
      ]
    : [];
  return [
    frontmatter.join("\n"),
    `# ${document.title}`,
    document.description,
    ...sections,
    ...references,
    ...structuredData,
  ]
    .join("\n\n")
    .trim()
    .concat("\n");
}

export function estimateMarkdownTokens(markdown: string): number {
  const cjk =
    markdown.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu)
      ?.length ?? 0;
  const remainder = markdown.replace(
    /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu,
    "",
  );
  return Math.max(1, cjk + Math.ceil(remainder.length / 4));
}
