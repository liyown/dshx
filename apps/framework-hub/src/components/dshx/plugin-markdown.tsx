import type { ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

import { cn } from "@/lib/utils";

/**
 * Plugin overviews and source READMEs are third-party Markdown. The renderer
 * never enables raw HTML, so unsafe markup in a README can only ever show up
 * as text, and images are limited to HTTPS sources without a referrer.
 */
const safeImageSource = /^https:\/\//u;

/** GitHub-style heading anchors keep README tables of contents working. */
function createHeadingSlugger() {
  const seen = new Map<string, number>();
  return (text: string) => {
    const base =
      text
        .toLowerCase()
        .trim()
        .replace(/[^\p{L}\p{N}\s_-]/gu, "")
        .replace(/\s+/gu, "-") || "section";
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    return count === 0 ? base : `${base}-${count}`;
  };
}

function nodeText(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(nodeText).join("");
  if (node && typeof node === "object" && "props" in node)
    return nodeText((node as { props?: { children?: ReactNode } }).props?.children);
  return "";
}

const headingClasses: Record<number, string> = {
  1: "mt-10 text-[20px] leading-7 font-medium tracking-[-0.02em] first:mt-0",
  2: "mt-10 border-b border-border pb-2 text-[17px] leading-6 font-medium tracking-[-0.01em] first:mt-0",
  3: "mt-8 text-[15.5px] leading-6 font-medium first:mt-0",
  4: "mt-6 text-[14.5px] leading-6 font-medium first:mt-0",
  5: "mt-6 text-[14px] leading-6 font-medium first:mt-0",
  6: "mt-6 text-[13.5px] leading-6 font-medium uppercase tracking-[0.06em] first:mt-0",
};

function createComponents(anchors: boolean): Components {
  const slug = createHeadingSlugger();
  const heading =
    (level: 1 | 2 | 3 | 4 | 5 | 6) =>
    ({ children }: { children?: ReactNode }) => {
      // A README's own `# Title` sits below the page and panel headings, so it
      // renders as an h2 and keeps the document outline continuous.
      const Tag = (level === 1 ? "h2" : `h${level}`) as "h2" | "h3" | "h4" | "h5" | "h6";
      return (
        <Tag
          {...(anchors ? { id: slug(nodeText(children)) } : {})}
          className={cn("scroll-mt-28 text-foreground", headingClasses[level])}
        >
          {children}
        </Tag>
      );
    };

  return {
    h1: heading(1),
    h2: heading(2),
    h3: heading(3),
    h4: heading(4),
    h5: heading(5),
    h6: heading(6),
    p: ({ children }) => (
      <p className="mt-4 text-[14.5px] leading-7 text-muted-foreground [overflow-wrap:anywhere] first:mt-0">
        {children}
      </p>
    ),
    ul: ({ children }) => (
      <ul className="mt-3 list-disc space-y-1.5 pl-5 text-[14.5px] leading-7 text-muted-foreground marker:text-border-strong">
        {children}
      </ul>
    ),
    ol: ({ children }) => (
      <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-[14.5px] leading-7 text-muted-foreground marker:text-border-strong">
        {children}
      </ol>
    ),
    li: ({ children }) => <li className="pl-1 [overflow-wrap:anywhere]">{children}</li>,
    a: ({ href, children }) => {
      const external =
        typeof href === "string" &&
        /^https?:\/\//u.test(href) &&
        !href.startsWith("https://dshx.io");
      return (
        <a
          href={href}
          {...(external ? { target: "_blank", rel: "noreferrer noopener" } : {})}
          className="text-accent underline decoration-border-strong underline-offset-2 hover:text-foreground [overflow-wrap:anywhere]"
        >
          {children}
        </a>
      );
    },
    strong: ({ children }) => <strong className="font-medium text-foreground">{children}</strong>,
    em: ({ children }) => <em className="text-foreground/90">{children}</em>,
    blockquote: ({ children }) => (
      <blockquote className="mt-4 border-l-2 border-border-strong pl-4 text-muted-foreground [&>p]:mt-2 [&>p:first-child]:mt-0">
        {children}
      </blockquote>
    ),
    code: ({ children }) => (
      <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[0.86em] text-foreground [overflow-wrap:anywhere]">
        {children}
      </code>
    ),
    pre: ({ children }) => (
      <pre className="mt-4 overflow-x-auto rounded-lg border border-border bg-surface-2 p-3.5 font-mono text-[12.5px] leading-6 text-foreground [&_code]:bg-transparent [&_code]:p-0 [&_code]:text-inherit">
        {children}
      </pre>
    ),
    table: ({ children }) => (
      <div className="mt-4 overflow-x-auto rounded-lg border border-border">
        <table className="w-full border-collapse text-left text-[13.5px]">{children}</table>
      </div>
    ),
    thead: ({ children }) => <thead className="bg-surface-2">{children}</thead>,
    th: ({ children }) => <th className="px-3 py-2 font-medium text-foreground">{children}</th>,
    td: ({ children }) => (
      <td className="border-t border-border px-3 py-2 align-top text-muted-foreground [overflow-wrap:anywhere]">
        {children}
      </td>
    ),
    hr: () => <hr className="mt-8 border-border" />,
    img: ({ src, alt }) => {
      if (typeof src !== "string" || !safeImageSource.test(src)) return null;
      return (
        <img
          src={src}
          alt={alt ?? ""}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          className="mt-4 max-h-96 max-w-full rounded-lg object-contain"
        />
      );
    },
    input: ({ type, checked }) =>
      type === "checkbox" ? (
        <input
          type="checkbox"
          checked={Boolean(checked)}
          readOnly
          disabled
          className="mr-1.5 h-3.5 w-3.5 translate-y-px accent-accent"
        />
      ) : null,
  };
}

/**
 * Renders curated plugin overviews, install notes and source READMEs. Heading
 * anchors are opt-in because README tables of contents need them while the
 * shorter curated blocks would only add duplicate ids to the page.
 */
export function PluginMarkdown({
  children,
  className,
  anchors = false,
}: {
  children: string;
  className?: string;
  anchors?: boolean;
}) {
  return (
    <div
      dir="auto"
      className={cn(
        "max-w-[75ch] text-[14.5px] text-muted-foreground [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&>p:empty]:hidden",
        className,
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={createComponents(anchors)}
        // Raw HTML (badges, <img>, <details>) is skipped rather than escaped
        // into visible tag soup; Markdown-only output keeps untrusted READMEs
        // safe without an HTML sanitizer.
        skipHtml
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
