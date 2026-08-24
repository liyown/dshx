import { Container } from "./primitives";
import { useI18n } from "@/lib/i18n";

export function DevelopmentBanner() {
  const { t } = useI18n();

  return (
    <aside
      aria-label={t("status.developmentLabel")}
      className="border-b border-accent/15 bg-accent-soft/55"
    >
      <Container className="flex min-h-10 flex-col items-start justify-center gap-0.5 py-2 sm:flex-row sm:items-center sm:gap-3">
        <span className="inline-flex shrink-0 items-center gap-2 font-mono text-[10px] font-medium tracking-[0.1em] text-accent uppercase">
          <span aria-hidden className="size-1.5 rounded-full bg-accent" />
          {t("status.developmentLabel")}
        </span>
        <span aria-hidden className="hidden h-3 w-px bg-accent/20 sm:block" />
        <p className="text-[12.5px] leading-5 text-foreground/75">
          {t("status.developmentMessage")}
        </p>
      </Container>
    </aside>
  );
}
