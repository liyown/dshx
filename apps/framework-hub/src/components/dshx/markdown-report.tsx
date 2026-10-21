import ReactMarkdown, { type Components } from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";

import { cn } from "@/lib/utils";

// Raw HTML is deliberately not enabled. React Markdown renders text and
// Markdown elements as React nodes, so report content can never inject HTML.
const components: Components = {
  h1: ({ children }) => (
    <h2 className="mt-10 text-[22px] leading-8 font-medium tracking-tight first:mt-0">
      {children}
    </h2>
  ),
  h2: ({ children }) => (
    <h2 className="mt-10 text-[22px] leading-8 font-medium tracking-tight first:mt-0">
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="mt-8 text-[18px] leading-7 font-medium first:mt-0">{children}</h3>
  ),
  h4: ({ children }) => (
    <h4 className="mt-7 text-[16px] leading-7 font-medium first:mt-0">{children}</h4>
  ),
  p: ({ children }) => (
    <p className="mt-4 text-[15px] leading-8 text-foreground [overflow-wrap:anywhere] first:mt-0">
      {children}
    </p>
  ),
  ul: ({ children }) => <ul className="mt-4 list-disc space-y-2 pl-6 text-[15px]">{children}</ul>,
  ol: ({ children }) => (
    <ol className="mt-4 list-decimal space-y-2 pl-6 text-[15px]">{children}</ol>
  ),
  li: ({ children }) => <li className="pl-1 leading-7 [overflow-wrap:anywhere]">{children}</li>,
  a: ({ href, children }) => {
    const external = typeof href === "string" && /^https?:\/\//u.test(href);
    return (
      <a
        href={href}
        {...(external ? { target: "_blank", rel: "noreferrer noopener" } : {})}
        className="break-words text-accent underline decoration-border-strong underline-offset-4 hover:text-foreground"
      >
        {children}
      </a>
    );
  },
  strong: ({ children }) => <strong className="font-medium text-foreground">{children}</strong>,
  blockquote: ({ children }) => (
    <blockquote className="mt-5 border-l-2 border-border-strong pl-5 text-muted-foreground">
      {children}
    </blockquote>
  ),
  code: ({ children }) => (
    <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[0.86em]">{children}</code>
  ),
  pre: ({ children }) => (
    <pre className="mt-5 overflow-x-auto rounded-lg border border-border bg-surface-2 p-4 font-mono text-[12.5px] leading-6 [&_code]:bg-transparent [&_code]:p-0">
      {children}
    </pre>
  ),
  table: ({ children }) => (
    <div className="mt-5 overflow-x-auto">
      <table className="w-full border-collapse text-left text-[14px]">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="border-b border-border-strong">{children}</thead>,
  th: ({ children }) => <th className="px-3 py-2 font-medium">{children}</th>,
  td: ({ children }) => <td className="border-t border-border px-3 py-2 align-top">{children}</td>,
  hr: () => <hr className="mt-10 border-border" />,
  // Reports link to sources; remote images add tracking and layout risk.
  img: () => null,
};

export function MarkdownReport({ children, className }: { children: string; className?: string }) {
  // The daily merge marker and any stray HTML comments are control data, not
  // reader-facing content.
  const visible = children.replace(/<!--[\s\S]*?-->/gu, "");
  return (
    <div className={cn("max-w-3xl text-foreground", className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]} components={components}>
        {visible}
      </ReactMarkdown>
    </div>
  );
}
