import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/* ---------- X motif ---------- */

export function XMark({ className }: { className?: string | undefined }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={cn("size-6", className)} aria-hidden>
      <path d="M3 3 L21 21" stroke="currentColor" strokeWidth="1.25" />
      <path d="M21 3 L3 21" stroke="currentColor" strokeWidth="1.25" />
      <circle cx="12" cy="12" r="2" fill="currentColor" />
    </svg>
  );
}

export function Wordmark({ className }: { className?: string | undefined }) {
  return (
    <span
      className={cn(
        "inline-flex items-baseline gap-[1px] text-[17px] font-semibold tracking-[-0.05em]",
        className,
      )}
    >
      DSH
      <span className="relative inline-block text-accent">
        X
        <span className="absolute -bottom-[3px] left-0 h-px w-full bg-accent/50" />
      </span>
    </span>
  );
}

/* ---------- layout ---------- */

export function Container({
  children,
  className,
}: {
  children: ReactNode;
  className?: string | undefined;
}) {
  return (
    <div className={cn("mx-auto w-full max-w-[1180px] px-6 md:px-10", className)}>
      {children}
    </div>
  );
}

export function SectionLabel({ index, children }: { index: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <span className="font-mono text-[11px] tracking-[0.12em] text-accent">{index}</span>
      <span className="mono-label">{children}</span>
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}

export function SectionHeading({
  children,
  className,
}: {
  children: ReactNode;
  className?: string | undefined;
}) {
  return (
    <h2
      className={cn(
        "text-balance-tight max-w-3xl text-[clamp(1.75rem,3.6vw,2.75rem)] leading-[1.08] font-medium",
        className,
      )}
    >
      {children}
    </h2>
  );
}

export function Lede({ children, className }: { children: ReactNode; className?: string | undefined }) {
  return (
    <p className={cn("max-w-2xl text-[15px] leading-relaxed text-muted-foreground", className)}>
      {children}
    </p>
  );
}

/* ---------- buttons ---------- */

const base =
  "inline-flex h-10 items-center justify-center gap-2 rounded-[10px] px-4 text-[13.5px] font-medium transition-colors duration-150";

export function ButtonLink({
  to,
  href,
  variant = "primary",
  children,
  className,
}: {
  to?: string | undefined;
  href?: string | undefined;
  variant?: "primary" | "outline" | "ghost" | "accent" | undefined;
  children: ReactNode;
  className?: string | undefined;
}) {
  const styles = {
    primary: "bg-primary text-primary-foreground hover:bg-primary/90",
    accent: "bg-accent text-accent-foreground hover:bg-accent/90",
    outline: "border border-border-strong text-foreground hover:bg-surface-2",
    ghost: "text-muted-foreground hover:text-foreground",
  }[variant];

  if (href) {
    return (
      <a
        href={href}
        target={href.startsWith("http") ? "_blank" : undefined}
        rel="noreferrer"
        className={cn(base, styles, className)}
      >
        {children}
      </a>
    );
  }
  return (
    <Link to={to ?? "/"} className={cn(base, styles, className)}>
      {children}
    </Link>
  );
}

/* ---------- badges / chips ---------- */

export function Chip({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: "neutral" | "accent" | "ok" | undefined;
  className?: string | undefined;
}) {
  const tones = {
    neutral: "border-border text-muted-foreground",
    accent: "border-accent/30 bg-accent-soft/60 text-accent",
    ok: "border-ok/40 text-ok",
  }[tone];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 font-mono text-[10.5px] tracking-tight",
        tones,
        className,
      )}
    >
      {children}
    </span>
  );
}
