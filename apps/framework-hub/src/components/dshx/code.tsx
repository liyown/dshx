import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type TokenKind = "kw" | "fn" | "str" | "cm" | "punc" | "prop";
type Token = { t: string; c?: TokenKind | undefined };

const rules: { re: RegExp; c: TokenKind }[] = [
  { re: /^\/\/.*/, c: "cm" },
  { re: /^'[^']*'|^"[^"]*"|^`[^`]*`/, c: "str" },
  {
    re: /^\b(export|default|import|from|const|let|return|function|await|async|new|type|interface)\b/,
    c: "kw",
  },
  {
    re: /^\b(defineApi|defineClient|defineCommand|defineConversation|defineHost|definePromptContext|definePromptSection|defineSettings|defineSlot|defineTool|method|useApi|useQuery|useSettings|setup|on)\b/,
    c: "fn",
  },
  { re: /^[a-zA-Z_$][\w$]*(?=\s*:)/, c: "prop" },
  { re: /^[{}[\](),.:;=><+*/|&?!-]/, c: "punc" },
];

function tokenize(line: string): Token[] {
  const out: Token[] = [];
  let rest = line;
  let buf = "";
  while (rest.length) {
    let matched = false;
    for (const r of rules) {
      const m = r.re.exec(rest);
      if (m) {
        if (buf) {
          out.push({ t: buf });
          buf = "";
        }
        out.push({ t: m[0], c: r.c });
        rest = rest.slice(m[0].length);
        matched = true;
        break;
      }
    }
    if (!matched) {
      buf += rest[0];
      rest = rest.slice(1);
    }
  }
  if (buf) out.push({ t: buf });
  return out;
}

const colors: Record<string, string> = {
  kw: "text-[oklch(0.78_0.13_300)]",
  fn: "text-[oklch(0.8_0.13_235)]",
  str: "text-[oklch(0.82_0.13_150)]",
  cm: "text-ink-muted",
  punc: "text-ink-muted",
  prop: "text-[oklch(0.86_0.09_85)]",
};

export function CodeSurface({
  title,
  children,
  className,
  dots = true,
}: {
  title?: string | undefined;
  children: ReactNode;
  className?: string | undefined;
  dots?: boolean | undefined;
}) {
  return (
    <div
      data-scroll-surface
      className={cn(
        "overflow-hidden rounded-xl border border-ink-border bg-ink text-ink-foreground",
        className,
      )}
    >
      {(title || dots) && (
        <div className="flex items-center gap-3 border-b border-ink-border px-4 py-2.5">
          {dots && (
            <span className="flex gap-1.5">
              <span className="size-[7px] rounded-full bg-ink-border" />
              <span className="size-[7px] rounded-full bg-ink-border" />
              <span className="size-[7px] rounded-full bg-ink-border" />
            </span>
          )}
          {title && (
            <span className="font-mono text-[11px] tracking-tight text-ink-muted">{title}</span>
          )}
        </div>
      )}
      <div className="overflow-x-auto p-4">{children}</div>
    </div>
  );
}

export function Code({
  code,
  className,
  highlightLines = [],
  lineNumbers = false,
}: {
  code: string;
  className?: string | undefined;
  highlightLines?: number[] | undefined;
  lineNumbers?: boolean | undefined;
}) {
  const lines = code.replace(/\n$/, "").split("\n");
  return (
    <pre
      className={cn(
        "font-mono text-[12.5px] leading-[1.75] whitespace-pre text-ink-foreground",
        className,
      )}
    >
      <code>
        {lines.map((line, i) => (
          <div
            key={i}
            className={cn(
              "-mx-2 px-2 transition-colors duration-500",
              lineNumbers && "grid grid-cols-[2.5rem_minmax(0,1fr)]",
              highlightLines.includes(i + 1) && "bg-accent/12 shadow-[inset_2px_0_0] shadow-accent",
            )}
          >
            {lineNumbers ? (
              <span aria-hidden className="select-none pr-4 text-right text-ink-muted/55">
                {i + 1}
              </span>
            ) : null}
            <span>
              {tokenize(line).map((tk, j) => (
                <span key={j} className={tk.c ? colors[tk.c] : undefined}>
                  {tk.t}
                </span>
              ))}
              {line === "" ? " " : ""}
            </span>
          </div>
        ))}
      </code>
    </pre>
  );
}

export function Terminal({
  lines,
  className,
  title = "zsh",
}: {
  lines: { text: string; kind?: "cmd" | "out" | "ok" | "dim" | "accent" | undefined }[];
  className?: string | undefined;
  title?: string | undefined;
}) {
  return (
    <CodeSurface title={title} className={className}>
      <div className="font-mono text-[12.5px] leading-[1.9]">
        {lines.map((l, i) => (
          <div
            key={i}
            className={cn(
              "animate-rise",
              l.kind === "cmd" && "text-ink-foreground",
              l.kind === "ok" && "text-ok",
              l.kind === "accent" && "text-ink-accent",
              (l.kind === "dim" || l.kind === undefined) && "text-ink-muted",
            )}
            style={{ animationDelay: `${i * 90}ms` }}
          >
            {l.kind === "cmd" && <span className="mr-2 text-ink-accent">$</span>}
            {l.text}
          </div>
        ))}
      </div>
    </CodeSurface>
  );
}
