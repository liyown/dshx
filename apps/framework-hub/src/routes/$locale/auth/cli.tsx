import { createFileRoute } from "@tanstack/react-router";
import { AlertTriangle, Check, Github, LoaderCircle, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Terminal } from "@/components/dshx/code";
import { Container } from "@/components/dshx/primitives";
import { Button } from "@/components/ui/button";
import {
  normalizeCliAuthorizationSearch,
  type CliAuthorizationReason,
  type CliAuthorizationStatus,
} from "@/lib/auth/cli-page";
import { createTranslator, parseLocale, type Locale } from "@/lib/i18n";

type PageCopy = {
  label: string;
  title: string;
  description: string;
  statusLabel: string;
  terminal: { text: string; kind?: "cmd" | "out" | "ok" | "dim" | "accent" }[];
};

type CliPageState = Exclude<CliAuthorizationStatus, "error"> | CliAuthorizationReason | "unknown";

/**
 * What each state prints in the terminal mock. The lines are fixed output of
 * the CLI, not interface copy: they are the same in every locale.
 */
const terminalLines: Record<CliPageState, PageCopy["terminal"]> = {
  connecting: [
    { text: "dshx-hub auth login", kind: "cmd" },
    { text: "browser      GitHub OAuth", kind: "dim" },
    { text: "callback     loopback only", kind: "dim" },
    { text: "status       waiting", kind: "accent" },
  ],
  success: [
    { text: "dshx-hub auth status", kind: "cmd" },
    { text: "status       connected", kind: "ok" },
    { text: "storage      system keychain", kind: "dim" },
    { text: "next         return to terminal", kind: "accent" },
  ],
  expired: [
    { text: "dshx-hub auth login", kind: "cmd" },
    { text: "status       not connected", kind: "dim" },
    { text: "recovery     run login again", kind: "accent" },
  ],
  incomplete: [
    { text: "dshx-hub auth login", kind: "cmd" },
    { text: "status       incomplete", kind: "dim" },
    { text: "recovery     run login again", kind: "accent" },
  ],
  exchange: [
    { text: "dshx-hub auth login", kind: "cmd" },
    { text: "status       exchange failed", kind: "dim" },
    { text: "recovery     check terminal", kind: "accent" },
  ],
  server: [
    { text: "dshx-hub auth login", kind: "cmd" },
    { text: "status       unavailable", kind: "dim" },
    { text: "recovery     retry later", kind: "accent" },
  ],
  unknown: [
    { text: "dshx-hub auth login", kind: "cmd" },
    { text: "status       not connected", kind: "dim" },
    { text: "recovery     run login again", kind: "accent" },
  ],
};

function pageState(status: CliAuthorizationStatus, reason?: CliAuthorizationReason): CliPageState {
  return status === "error" ? (reason ?? "unknown") : status;
}

export const Route = createFileRoute("/$locale/auth/cli")({
  validateSearch: normalizeCliAuthorizationSearch,
  head: ({ params, match }) => {
    const locale = parseLocale(params.locale);
    const search = normalizeCliAuthorizationSearch(match.search);
    const copy = getCopy(locale, search.status, search.reason);
    return {
      meta: [
        { title: `${copy.title} · DSHX Hub` },
        { name: "description", content: copy.description },
        { name: "robots", content: "noindex,nofollow" },
      ],
    };
  },
  component: CliAuthorizationPage,
});

function getCopy(
  locale: Locale,
  status: CliAuthorizationStatus,
  reason?: CliAuthorizationReason,
): PageCopy {
  const state = pageState(status, reason);
  const t = createTranslator(locale);
  return {
    label: t(`auth.cli.${state}.label`),
    title: t(`auth.cli.${state}.title`),
    description: t(`auth.cli.${state}.description`),
    statusLabel: t(`auth.cli.${state}.statusLabel`),
    terminal: terminalLines[state],
  };
}

function CliAuthorizationPage() {
  const { locale: localeParam } = Route.useParams();
  const search = Route.useSearch();
  const locale = parseLocale(localeParam);
  const [redirectFailed, setRedirectFailed] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const started = useRef(false);
  const effectiveStatus = redirectFailed ? "error" : search.status;
  const t = createTranslator(locale);
  const copy = redirectFailed
    ? getCopy(locale, "error", "server")
    : getCopy(locale, search.status, search.reason);

  const startGitHubLogin = useCallback(async () => {
    if (!search.returnTo || redirecting) return;
    setRedirectFailed(false);
    setRedirecting(true);
    try {
      const response = await fetch("/api/auth/sign-in/social", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider: "github", callbackURL: search.returnTo }),
      });
      const payload = (await response.json()) as { url?: unknown };
      if (!response.ok || typeof payload.url !== "string") throw new Error("Missing OAuth URL");
      window.location.assign(payload.url);
    } catch {
      setRedirecting(false);
      setRedirectFailed(true);
    }
  }, [redirecting, search.returnTo]);

  useEffect(() => {
    if (search.status !== "connecting" || !search.returnTo || started.current) return;
    started.current = true;
    void startGitHubLogin();
  }, [search.returnTo, search.status, startGitHubLogin]);

  const tone =
    effectiveStatus === "success" ? "ok" : effectiveStatus === "error" ? "error" : "waiting";
  const StatusIcon =
    effectiveStatus === "success"
      ? Check
      : effectiveStatus === "error"
        ? AlertTriangle
        : LoaderCircle;

  return (
    <main className="border-b border-border">
      <Container className="flex min-h-[calc(100svh-3.5rem)] flex-col py-12 md:py-20 [@media(max-height:600px)]:py-6">
        <div className="flex items-center gap-3 border-b border-border pb-4 font-mono text-[11px] tracking-[0.12em] text-muted-foreground uppercase">
          <ShieldCheck className="size-4 text-accent" aria-hidden="true" />
          <span>{t("auth.cli.label")}</span>
          <span className="ml-auto hidden text-[10px] normal-case tracking-normal sm:block">
            dshx.io / loopback
          </span>
        </div>

        <div className="grid flex-1 gap-12 py-12 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,0.72fr)] lg:items-center lg:gap-20 lg:py-20 [@media(max-height:600px)]:gap-8 [@media(max-height:600px)]:py-6">
          <section className="max-w-2xl">
            <div
              className={
                tone === "ok"
                  ? "inline-flex items-center gap-2 rounded-md border border-ok/40 px-2.5 py-1 font-mono text-[11px] text-ok"
                  : tone === "error"
                    ? "inline-flex items-center gap-2 rounded-md border border-destructive/35 px-2.5 py-1 font-mono text-[11px] text-destructive"
                    : "inline-flex items-center gap-2 rounded-md border border-accent/30 bg-accent-soft/50 px-2.5 py-1 font-mono text-[11px] text-accent"
              }
              role="status"
              aria-live="polite"
            >
              <StatusIcon
                className={
                  effectiveStatus === "connecting"
                    ? "size-3.5 animate-spin motion-reduce:animate-none"
                    : "size-3.5"
                }
                aria-hidden="true"
              />
              {copy.label}
            </div>

            <h1 className="mt-7 max-w-[13ch] text-balance text-[clamp(2.6rem,7vw,5.25rem)] leading-[0.98] font-medium tracking-[-0.04em] [@media(max-height:600px)]:mt-5 [@media(max-height:600px)]:text-[clamp(2.25rem,6vw,4rem)]">
              {copy.title}
            </h1>
            <p className="mt-6 max-w-[62ch] text-[15px] leading-7 text-muted-foreground md:text-base">
              {copy.description}
            </p>

            {redirectFailed && search.returnTo ? (
              <Button
                className="mt-8"
                onClick={() => void startGitHubLogin()}
                disabled={redirecting}
              >
                <Github data-icon="inline-start" aria-hidden="true" />
                {t("auth.cli.reconnect")}
              </Button>
            ) : null}
          </section>

          <Terminal title={t("auth.cli.terminalTitle")} lines={copy.terminal} className="w-full" />
        </div>

        <div className="grid gap-5 border-t border-border pt-5 text-[13px] text-muted-foreground sm:grid-cols-[1fr_auto] sm:items-center">
          <div className="flex items-center gap-2.5">
            <span
              className={
                tone === "ok"
                  ? "size-1.5 rounded-full bg-ok"
                  : tone === "error"
                    ? "size-1.5 rounded-full bg-destructive"
                    : "size-1.5 rounded-full bg-accent"
              }
              aria-hidden="true"
            />
            <span>{copy.statusLabel}</span>
          </div>
          <p>{t("auth.cli.separationNote")}</p>
        </div>
      </Container>
    </main>
  );
}
