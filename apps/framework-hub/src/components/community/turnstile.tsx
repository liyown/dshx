import { CircleCheck, LoaderCircle } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";

import { useI18n } from "@/lib/i18n";

declare global {
  interface Window {
    turnstile?: {
      render: (
        element: string | HTMLElement,
        options: {
          sitekey: string;
          callback: (token: string) => void;
          "expired-callback": () => void;
          "error-callback": () => void;
        },
      ) => string;
      remove: (id: string) => void;
    };
  }
}

let scriptPromise: Promise<void> | null = null;
const verificationEvent = "dshx:human-verification";

function broadcastVerification(expiresAt: string | null) {
  window.dispatchEvent(new CustomEvent(verificationEvent, { detail: { expiresAt } }));
}

function loadTurnstileScript() {
  if (window.turnstile) return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      'script[data-dshx-turnstile="true"]',
    );
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Turnstile failed to load")), {
        once: true,
      });
      return;
    }
    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    script.defer = true;
    script.dataset["dshxTurnstile"] = "true";
    script.addEventListener("load", () => resolve(), { once: true });
    script.addEventListener("error", () => reject(new Error("Turnstile failed to load")), {
      once: true,
    });
    document.head.appendChild(script);
  });
  void scriptPromise.catch(() => {
    scriptPromise = null;
  });
  return scriptPromise;
}

export function Turnstile({
  onToken,
  mode = "session",
}: {
  onToken: (token: string) => void;
  mode?: "session" | "direct";
}) {
  const { t } = useI18n();
  const reactId = useId().replaceAll(":", "");
  const container = useRef<HTMLDivElement>(null);
  const [siteKey, setSiteKey] = useState<string | null | undefined>(undefined);
  const [status, setStatus] = useState<"checking" | "required" | "verifying" | "verified">(
    "checking",
  );
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (mode === "direct") return;
    const synchronize = (event: Event) => {
      const nextExpiry = (event as CustomEvent<{ expiresAt: string | null }>).detail.expiresAt;
      setExpiresAt(nextExpiry);
      if (nextExpiry && Date.parse(nextExpiry) > Date.now()) {
        setError(null);
        setStatus("verified");
        onToken("verified-session");
      } else {
        onToken("");
        setStatus("required");
      }
    };
    window.addEventListener(verificationEvent, synchronize);
    return () => window.removeEventListener(verificationEvent, synchronize);
  }, [mode, onToken]);

  useEffect(() => {
    let cancelled = false;
    if (mode === "direct") {
      void fetch("/api/config")
        .then(async (configResponse) => {
          if (!configResponse.ok) throw new Error("configuration");
          const config = (await configResponse.json()) as { turnstileSiteKey: string | null };
          if (cancelled) return;
          setSiteKey(config.turnstileSiteKey);
          onToken("");
          setStatus("required");
        })
        .catch(() => {
          if (cancelled) return;
          onToken("");
          setError(t("community.verification.loadFailed"));
          setStatus("required");
        });
      return () => {
        cancelled = true;
      };
    }
    void Promise.all([fetch("/api/config"), fetch("/api/community/verification")])
      .then(async ([configResponse, verificationResponse]) => {
        if (!configResponse.ok || !verificationResponse.ok) throw new Error("configuration");
        const config = (await configResponse.json()) as { turnstileSiteKey: string | null };
        const verification = (await verificationResponse.json()) as {
          verified: boolean;
          expiresAt: string | null;
        };
        if (cancelled) return;
        setSiteKey(config.turnstileSiteKey);
        if (verification.verified && verification.expiresAt) {
          setExpiresAt(verification.expiresAt);
          setStatus("verified");
          onToken("verified-session");
          broadcastVerification(verification.expiresAt);
        } else {
          onToken("");
          setStatus("required");
        }
      })
      .catch(() => {
        if (cancelled) return;
        onToken("");
        setError(t("community.verification.loadFailed"));
        setStatus("required");
      });
    return () => {
      cancelled = true;
    };
  }, [mode, onToken, t]);

  const verify = useCallback(
    async (turnstileToken: string) => {
      setError(null);
      setStatus("verifying");
      onToken("");
      if (mode === "direct") {
        const directExpiry = new Date(Date.now() + 5 * 60_000).toISOString();
        setExpiresAt(directExpiry);
        setStatus("verified");
        onToken(turnstileToken);
        return;
      }
      try {
        const response = await fetch("/api/community/verification", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ turnstileToken }),
        });
        const payload = (await response.json()) as {
          expiresAt?: string;
          error?: { message?: string };
        };
        if (!response.ok || !payload.expiresAt)
          throw new Error(payload.error?.message ?? t("community.verification.failed"));
        setExpiresAt(payload.expiresAt);
        setStatus("verified");
        onToken("verified-session");
        broadcastVerification(payload.expiresAt);
      } catch (verificationError) {
        setError(
          verificationError instanceof Error
            ? verificationError.message
            : t("community.verification.failed"),
        );
        setStatus("required");
      }
    },
    [mode, onToken, t],
  );

  useEffect(() => {
    if (status !== "required" || !siteKey || !container.current) return;
    let widgetId: string | null = null;
    void loadTurnstileScript()
      .then(() => {
        if (!container.current || !window.turnstile) return;
        widgetId = window.turnstile.render(container.current, {
          sitekey: siteKey,
          callback: (turnstileToken) => void verify(turnstileToken),
          "expired-callback": () => {
            onToken("");
            setExpiresAt(null);
            setStatus("required");
          },
          "error-callback": () => {
            onToken("");
            setError(t("community.verification.failed"));
          },
        });
      })
      .catch(() => setError(t("community.verification.failed")));
    return () => {
      if (widgetId && window.turnstile) window.turnstile.remove(widgetId);
    };
  }, [onToken, siteKey, status, t, verify]);

  useEffect(() => {
    if (status !== "verified" || !expiresAt) return;
    const remaining = Date.parse(expiresAt) - Date.now();
    if (remaining <= 0) {
      onToken("");
      setStatus("required");
      broadcastVerification(null);
      return;
    }
    const timer = window.setTimeout(() => {
      onToken("");
      setStatus("required");
      broadcastVerification(null);
    }, remaining);
    return () => window.clearTimeout(timer);
  }, [expiresAt, onToken, status]);

  if (siteKey === undefined && error)
    return (
      <p className="text-xs text-destructive" role="alert">
        {error}
      </p>
    );
  if (status === "checking" || siteKey === undefined)
    return (
      <p className="flex items-center gap-2 text-xs text-muted-foreground" aria-live="polite">
        <LoaderCircle className="size-3.5 animate-spin" aria-hidden />
        {t("community.verification.checking")}
      </p>
    );
  if (status === "verified")
    return (
      <p className="flex items-center gap-2 text-xs text-muted-foreground" aria-live="polite">
        <CircleCheck className="size-3.5 text-ok" aria-hidden />
        {t(
          mode === "direct"
            ? "community.verification.submissionReady"
            : "community.verification.active",
        )}
      </p>
    );
  if (status === "verifying")
    return (
      <p className="flex items-center gap-2 text-xs text-muted-foreground" aria-live="polite">
        <LoaderCircle className="size-3.5 animate-spin" aria-hidden />
        {t("community.verification.confirming")}
      </p>
    );
  if (siteKey === null)
    return (
      <p className="text-xs text-muted-foreground">{t("community.verification.unavailable")}</p>
    );
  return (
    <div className="space-y-2">
      <p id={`turnstile-help-${reactId}`} className="text-xs leading-5 text-muted-foreground">
        {t(
          mode === "direct"
            ? "community.verification.submissionRequired"
            : "community.verification.required",
        )}
      </p>
      {error ? (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      <div
        id={`turnstile-${reactId}`}
        ref={container}
        className="min-h-16"
        aria-describedby={`turnstile-help-${reactId}`}
      />
    </div>
  );
}
