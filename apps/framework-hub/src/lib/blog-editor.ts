import type { BlogBlock, BlogSection } from "@/lib/blog.contracts";

const OVERVIEW_TITLES = { en: "Overview", zh: "概述" } as const;

function sectionId(title: string, index: number, used: Set<string>): string {
  const base =
    title
      .toLowerCase()
      .replaceAll(/[^a-z0-9]+/g, "-")
      .replaceAll(/^-+|-+$/g, "")
      .slice(0, 72) || `section-${index + 1}`;
  let candidate = base;
  let suffix = 2;
  while (used.has(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  used.add(candidate);
  return candidate;
}

/**
 * Converts the admin's lightweight Markdown-style body into the stored block
 * model. Only block syntax is interpreted: headings, lists, quotes, fences and
 * paragraphs. Nothing is rendered as HTML.
 */
export function parseBlogBody(body: string, locale: "en" | "zh"): BlogSection[] {
  const lines = body.replaceAll("\r\n", "\n").split("\n");
  const sections: Array<{ title: string; blocks: BlogBlock[] }> = [];
  let current: { title: string; blocks: BlogBlock[] } = {
    title: OVERVIEW_TITLES[locale],
    blocks: [],
  };
  let paragraph: string[] = [];

  function flushParagraph() {
    const text = paragraph.join("\n").trim();
    paragraph = [];
    if (text) current.blocks.push({ type: "paragraph", text });
  }

  function flushSection() {
    flushParagraph();
    if (current.blocks.length > 0) sections.push(current);
  }

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const trimmed = line.trim();

    if (trimmed.startsWith("```")) {
      flushParagraph();
      const language = trimmed.slice(3).trim();
      const code: string[] = [];
      index += 1;
      while (index < lines.length && !(lines[index] ?? "").trim().startsWith("```")) {
        code.push(lines[index] ?? "");
        index += 1;
      }
      const value = code.join("\n").trim();
      if (value) {
        current.blocks.push({
          type: "code",
          ...(language ? { language } : {}),
          code: value,
        });
      }
      continue;
    }

    const image = trimmed.match(/^!\[([^\]]*)\]\((https:\/\/[^\s)]+)(?:\s+"([^"]*)")?\)$/);
    if (image) {
      flushParagraph();
      current.blocks.push({
        type: "image",
        url: image[2] ?? "",
        alt: image[1]?.trim() || "Image",
        ...(image[3]?.trim() ? { caption: image[3].trim() } : {}),
      });
      continue;
    }

    if (/^#{2,3}\s+/.test(trimmed)) {
      flushSection();
      current = { title: trimmed.replace(/^#{2,3}\s+/, "").trim(), blocks: [] };
      continue;
    }

    if (/^[-*]\s+/.test(trimmed)) {
      flushParagraph();
      const items: string[] = [];
      while (index < lines.length && /^[-*]\s+/.test((lines[index] ?? "").trim())) {
        items.push(
          (lines[index] ?? "")
            .trim()
            .replace(/^[-*]\s+/, "")
            .trim(),
        );
        index += 1;
      }
      index -= 1;
      if (items.some(Boolean)) current.blocks.push({ type: "list", items: items.filter(Boolean) });
      continue;
    }

    if (trimmed.startsWith(">")) {
      flushParagraph();
      const quote: string[] = [];
      while (index < lines.length && (lines[index] ?? "").trim().startsWith(">")) {
        quote.push((lines[index] ?? "").trim().replace(/^>\s?/, ""));
        index += 1;
      }
      index -= 1;
      const text = quote.join("\n").trim();
      if (text) current.blocks.push({ type: "quote", text });
      continue;
    }

    if (trimmed === "") {
      flushParagraph();
      continue;
    }

    paragraph.push(line.trimEnd());
  }

  flushSection();

  const used = new Set<string>();
  return sections.map((section, index) => ({
    id: sectionId(section.title, index, used),
    title: section.title,
    blocks: section.blocks,
  }));
}

/**
 * Reuses stored section ids when an edited heading still has the same title, so
 * anchors from previously published articles keep working after an admin save.
 * New or retitled sections keep the parser's generated id.
 */
export function preserveSectionIds(
  sections: readonly BlogSection[],
  previous: readonly BlogSection[],
): BlogSection[] {
  const preferredByTitle = new Map(previous.map((section) => [section.title, section.id]));
  const preferred = new Set(preferredByTitle.values());
  const assigned = new Set<string>();
  return sections.map((section) => {
    const candidate = preferredByTitle.get(section.title);
    let id = candidate ?? section.id;
    if (assigned.has(id) || (!candidate && preferred.has(id))) {
      let suffix = 2;
      const base = id;
      while (assigned.has(`${base}-${suffix}`) || preferred.has(`${base}-${suffix}`)) suffix += 1;
      id = `${base}-${suffix}`;
    }
    assigned.add(id);
    return { ...section, id };
  });
}

export function serializeBlogBody(sections: readonly BlogSection[]): string {
  return sections
    .map((section) => {
      const blocks = section.blocks.map((block) => {
        switch (block.type) {
          case "paragraph":
            return block.text;
          case "list":
            return block.items.map((item) => `- ${item}`).join("\n");
          case "quote":
            return block.text
              .split("\n")
              .map((line) => `> ${line}`)
              .join("\n");
          case "code":
            return `\`\`\`${block.language ?? ""}\n${block.code}\n\`\`\``;
          case "image":
            return `![${block.alt}](${block.url}${block.caption ? ` "${block.caption}"` : ""})`;
        }
      });
      return [`## ${section.title}`, ...blocks].join("\n\n");
    })
    .join("\n\n");
}

export function blogBodyHelp(locale: "en" | "zh"): string {
  return locale === "zh"
    ? "支持段落、## 小节标题、- 列表、> 引用、``` 代码块，以及 ![说明](https://… “图注”) 图片。正文按当前填写的语言保存。"
    : 'Supports paragraphs, ## section headings, - lists, > quotes, ``` code fences, and ![alt](https://… "caption") images. Body text is stored for the current language.';
}
