import { useEffect, useRef, useState } from "react";

import { getDshxDeveloperPrompt } from "@/lib/agent-prompt";
import { createTranslator } from "@/lib/i18n";
import { useI18n } from "@/lib/i18n/use-i18n";
import { cn } from "@/lib/utils";

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
  const t = createTranslator(locale);

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

  const label = t(
    state === "copied"
      ? "docs.copyPrompt.copied"
      : state === "failed"
        ? "docs.copyPrompt.failed"
        : "docs.copyPrompt.idle",
  );

  return (
    <button
      type="button"
      title={t("docs.copyPrompt.title")}
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
