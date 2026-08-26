import { useEffect, useRef, useState } from "react";

import { getDshxDeveloperPrompt } from "@/lib/agent-prompt";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const copy = {
  en: {
    idle: "Copy development prompt",
    copied: "Copied — paste into your Agent",
    failed: "Copy failed — try again",
    title:
      "Copy a prompt that installs the current DSHX development Skill, reads the API guide, and separates offline checks from real DSH smoke",
  },
  zh: {
    idle: "复制开发 Prompt",
    copied: "已复制，粘贴给 Agent",
    failed: "复制失败，请重试",
    title: "复制一段会安装当前 DSHX 开发 Skill、读取 API 指引并区分离线检查与真实 DSH smoke 的 Prompt",
  },
} as const;

type CopyState = "idle" | "copied" | "failed";

function legacyCopy(text: string): boolean {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  return copied;
}

export function CopyAgentPrompt({
  className,
  variant = "primary",
}: {
  className?: string | undefined;
  variant?: "primary" | "outline" | undefined;
}) {
  const { locale } = useI18n();
  const [state, setState] = useState<CopyState>("idle");
  const resetTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const messages = copy[locale];

  useEffect(
    () => () => {
      if (resetTimer.current !== undefined) clearTimeout(resetTimer.current);
    },
    [],
  );

  const handleCopy = async () => {
    try {
      const prompt = getDshxDeveloperPrompt(locale);
      if (navigator.clipboard?.writeText !== undefined) await navigator.clipboard.writeText(prompt);
      else if (!legacyCopy(prompt)) throw new Error("Clipboard API unavailable");
      setState("copied");
    } catch {
      setState("failed");
    }
    if (resetTimer.current !== undefined) clearTimeout(resetTimer.current);
    resetTimer.current = setTimeout(() => setState("idle"), 2400);
  };

  const label =
    state === "copied" ? messages.copied : state === "failed" ? messages.failed : messages.idle;

  return (
    <button
      type="button"
      title={messages.title}
      onClick={() => void handleCopy()}
      className={cn(
        "inline-flex h-10 items-center justify-center gap-2 rounded-[10px] px-4 text-[13.5px] font-medium transition-colors duration-150",
        variant === "primary"
          ? "bg-primary text-primary-foreground hover:bg-primary/90"
          : "border border-border-strong text-foreground hover:bg-surface-2",
        state === "copied" && "border-ok/40 bg-ok/10 text-ok hover:bg-ok/10",
        state === "failed" && "border-destructive/40 bg-destructive/10 text-destructive",
        className,
      )}
      aria-live="polite"
    >
      <span aria-hidden className="font-mono text-[12px] opacity-70">
        {state === "copied" ? "✓" : ">_"}
      </span>
      {label}
    </button>
  );
}
