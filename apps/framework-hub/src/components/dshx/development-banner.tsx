import { X } from "lucide-react";

import { Container } from "./primitives";
import { useI18n } from "@/lib/i18n/use-i18n";

const storageKey = "dshx:development-banner:v1";
const dismissedAttribute = "data-development-banner-dismissed";
const initializationScript = `(function(){try{if(window.localStorage.getItem(${JSON.stringify(storageKey)})==="1"){document.documentElement.setAttribute(${JSON.stringify(dismissedAttribute)},"")}}catch{}})()`;

function dismissDevelopmentBanner() {
  document.documentElement.setAttribute(dismissedAttribute, "");
  try {
    window.localStorage.setItem(storageKey, "1");
  } catch {
    // Dismissal still applies to the current page when storage is unavailable.
  }
}

export function DevelopmentBanner() {
  const { t } = useI18n();

  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: initializationScript }} />
      <aside
        aria-label={t("status.developmentLabel")}
        className="development-banner border-b border-accent/15 bg-accent-soft/55"
      >
        <Container className="flex min-h-10 items-start gap-3 py-2 sm:items-center">
          <div className="flex min-w-0 flex-1 flex-col items-start gap-0.5 sm:flex-row sm:items-center sm:gap-3">
            <span className="inline-flex shrink-0 items-center gap-2 font-mono text-[10px] font-medium tracking-[0.1em] text-accent uppercase">
              <span aria-hidden className="size-1.5 rounded-full bg-accent" />
              {t("status.developmentLabel")}
            </span>
            <span aria-hidden className="hidden h-3 w-px bg-accent/20 sm:block" />
            <p className="text-[12.5px] leading-5 text-foreground/75">
              {t("status.developmentMessage")}
            </p>
          </div>
          <button
            type="button"
            aria-label={t("status.dismissDevelopmentNotice")}
            onClick={dismissDevelopmentBanner}
            className="-my-1.5 -mr-2 flex size-9 shrink-0 items-center justify-center rounded-md text-foreground/55 transition-colors hover:bg-accent/10 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <X className="size-4" strokeWidth={1.75} />
          </button>
        </Container>
      </aside>
    </>
  );
}
