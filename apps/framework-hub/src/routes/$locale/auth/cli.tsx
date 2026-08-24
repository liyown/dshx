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
import { parseLocale, type Locale } from "@/lib/i18n";

type PageCopy = {
  label: string;
  title: string;
  description: string;
  statusLabel: string;
  terminal: { text: string; kind?: "cmd" | "out" | "ok" | "dim" | "accent" }[];
};

const baseCopy = {
  zh: {
    connecting: {
      label: "正在连接 GitHub",
      title: "完成 CLI 授权",
      description: "即将前往 GitHub 验证身份。完成后会自动回到这里，并把运营凭证交给本机 CLI。",
      statusLabel: "等待浏览器确认",
      terminal: [
        { text: "dshx-hub auth login", kind: "cmd" },
        { text: "browser      GitHub OAuth", kind: "dim" },
        { text: "callback     loopback only", kind: "dim" },
        { text: "status       waiting", kind: "accent" },
      ],
    },
    success: {
      label: "授权完成",
      title: "CLI 已安全连接",
      description: "运营凭证已经写入系统钥匙串。现在可以关闭此页面，回到终端继续操作。",
      statusLabel: "已连接",
      terminal: [
        { text: "dshx-hub auth status", kind: "cmd" },
        { text: "status       connected", kind: "ok" },
        { text: "storage      system keychain", kind: "dim" },
        { text: "next         return to terminal", kind: "accent" },
      ],
    },
  },
  en: {
    connecting: {
      label: "Connecting to GitHub",
      title: "Complete CLI authorization",
      description:
        "You are about to verify your identity with GitHub. When complete, the browser will return here and hand the operator credential to your local CLI.",
      statusLabel: "Waiting for browser confirmation",
      terminal: [
        { text: "dshx-hub auth login", kind: "cmd" },
        { text: "browser      GitHub OAuth", kind: "dim" },
        { text: "callback     loopback only", kind: "dim" },
        { text: "status       waiting", kind: "accent" },
      ],
    },
    success: {
      label: "Authorization complete",
      title: "CLI connected securely",
      description:
        "The operator credential is now stored in your system keychain. You can close this page and return to the terminal.",
      statusLabel: "Connected",
      terminal: [
        { text: "dshx-hub auth status", kind: "cmd" },
        { text: "status       connected", kind: "ok" },
        { text: "storage      system keychain", kind: "dim" },
        { text: "next         return to terminal", kind: "accent" },
      ],
    },
  },
} satisfies Record<Locale, Record<"connecting" | "success", PageCopy>>;

const errorCopy: Record<Locale, Record<CliAuthorizationReason | "unknown", PageCopy>> = {
  zh: {
    expired: {
      label: "请求已失效",
      title: "这次授权没有完成",
      description: "授权链接已经过期或状态不匹配。没有凭证写入本机，请回到终端重新发起登录。",
      statusLabel: "未连接",
      terminal: [
        { text: "dshx-hub auth login", kind: "cmd" },
        { text: "status       not connected", kind: "dim" },
        { text: "recovery     run login again", kind: "accent" },
      ],
    },
    incomplete: {
      label: "响应不完整",
      title: "这次授权没有完成",
      description: "浏览器没有收到完整的授权结果。没有凭证写入本机，请回到终端重新发起登录。",
      statusLabel: "未连接",
      terminal: [
        { text: "dshx-hub auth login", kind: "cmd" },
        { text: "status       incomplete", kind: "dim" },
        { text: "recovery     run login again", kind: "accent" },
      ],
    },
    exchange: {
      label: "凭证未保存",
      title: "这次授权没有完成",
      description: "Hub 无法把运营凭证安全保存到系统钥匙串。请回到终端查看错误，然后重新登录。",
      statusLabel: "未连接",
      terminal: [
        { text: "dshx-hub auth login", kind: "cmd" },
        { text: "status       exchange failed", kind: "dim" },
        { text: "recovery     check terminal", kind: "accent" },
      ],
    },
    server: {
      label: "服务暂时不可用",
      title: "这次授权没有完成",
      description: "Hub 暂时无法完成授权。没有凭证写入本机，请稍后回到终端重试。",
      statusLabel: "未连接",
      terminal: [
        { text: "dshx-hub auth login", kind: "cmd" },
        { text: "status       unavailable", kind: "dim" },
        { text: "recovery     retry later", kind: "accent" },
      ],
    },
    unknown: {
      label: "授权未完成",
      title: "这次授权没有完成",
      description: "没有凭证写入本机。请回到终端重新运行登录命令。",
      statusLabel: "未连接",
      terminal: [
        { text: "dshx-hub auth login", kind: "cmd" },
        { text: "status       not connected", kind: "dim" },
        { text: "recovery     run login again", kind: "accent" },
      ],
    },
  },
  en: {
    expired: {
      label: "Request expired",
      title: "Authorization did not complete",
      description:
        "The authorization link expired or its state did not match. No credential was stored; return to the terminal and start sign-in again.",
      statusLabel: "Not connected",
      terminal: [
        { text: "dshx-hub auth login", kind: "cmd" },
        { text: "status       not connected", kind: "dim" },
        { text: "recovery     run login again", kind: "accent" },
      ],
    },
    incomplete: {
      label: "Incomplete response",
      title: "Authorization did not complete",
      description:
        "The browser did not receive a complete authorization result. No credential was stored; return to the terminal and start sign-in again.",
      statusLabel: "Not connected",
      terminal: [
        { text: "dshx-hub auth login", kind: "cmd" },
        { text: "status       incomplete", kind: "dim" },
        { text: "recovery     run login again", kind: "accent" },
      ],
    },
    exchange: {
      label: "Credential not stored",
      title: "Authorization did not complete",
      description:
        "Hub could not store the operator credential in your system keychain. Check the terminal error, then start sign-in again.",
      statusLabel: "Not connected",
      terminal: [
        { text: "dshx-hub auth login", kind: "cmd" },
        { text: "status       exchange failed", kind: "dim" },
        { text: "recovery     check terminal", kind: "accent" },
      ],
    },
    server: {
      label: "Service unavailable",
      title: "Authorization did not complete",
      description:
        "Hub could not complete authorization right now. No credential was stored; return to the terminal and retry later.",
      statusLabel: "Not connected",
      terminal: [
        { text: "dshx-hub auth login", kind: "cmd" },
        { text: "status       unavailable", kind: "dim" },
        { text: "recovery     retry later", kind: "accent" },
      ],
    },
    unknown: {
      label: "Authorization incomplete",
      title: "Authorization did not complete",
      description:
        "No credential was stored. Return to the terminal and run the sign-in command again.",
      statusLabel: "Not connected",
      terminal: [
        { text: "dshx-hub auth login", kind: "cmd" },
        { text: "status       not connected", kind: "dim" },
        { text: "recovery     run login again", kind: "accent" },
      ],
    },
  },
};

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
  if (status === "error") return errorCopy[locale][reason ?? "unknown"];
  return baseCopy[locale][status];
}

function CliAuthorizationPage() {
  const { locale: localeParam } = Route.useParams();
  const search = Route.useSearch();
  const locale = parseLocale(localeParam);
  const [redirectFailed, setRedirectFailed] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const started = useRef(false);
  const effectiveStatus = redirectFailed ? "error" : search.status;
  const copy = redirectFailed
    ? errorCopy[locale].server
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
          <span>CLI authorization</span>
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
                {locale === "zh" ? "重新连接 GitHub" : "Reconnect GitHub"}
              </Button>
            ) : null}
          </section>

          <Terminal title="dshx-hub — authorization" lines={copy.terminal} className="w-full" />
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
          <p>
            {locale === "zh"
              ? "Hub 运营凭证与 GitHub API 凭证相互独立。"
              : "Hub operator credentials remain separate from GitHub API credentials."}
          </p>
        </div>
      </Container>
    </main>
  );
}
