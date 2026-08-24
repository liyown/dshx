import { useEffect, useId, useRef, useState } from "react";

declare global {
  interface Window {
    turnstile?: {
      render: (
        element: string | HTMLElement,
        options: {
          sitekey: string;
          callback: (token: string) => void;
          "expired-callback": () => void;
        },
      ) => string;
      remove: (id: string) => void;
    };
  }
}

let scriptPromise: Promise<void> | null = null;

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
  return scriptPromise;
}

export function Turnstile({ onToken }: { onToken: (token: string) => void }) {
  const reactId = useId().replaceAll(":", "");
  const container = useRef<HTMLDivElement>(null);
  const [siteKey, setSiteKey] = useState<string | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetch("/api/config")
      .then((response) => response.json() as Promise<{ turnstileSiteKey: string | null }>)
      .then((config) => setSiteKey(config.turnstileSiteKey))
      .catch(() => setError("Security challenge configuration could not be loaded."));
  }, []);

  useEffect(() => {
    if (!siteKey || !container.current) return;
    let widgetId: string | null = null;
    void loadTurnstileScript()
      .then(() => {
        if (!container.current || !window.turnstile) return;
        widgetId = window.turnstile.render(container.current, {
          sitekey: siteKey,
          callback: onToken,
          "expired-callback": () => onToken(""),
        });
      })
      .catch(() => setError("Security challenge could not be loaded."));
    return () => {
      if (widgetId && window.turnstile) window.turnstile.remove(widgetId);
    };
  }, [onToken, siteKey]);

  if (error) return <p className="text-xs text-destructive">{error}</p>;
  if (siteKey === null)
    return (
      <p className="text-xs text-muted-foreground">
        Community writes are unavailable until Turnstile is configured.
      </p>
    );
  return <div id={`turnstile-${reactId}`} ref={container} className="min-h-16" />;
}
