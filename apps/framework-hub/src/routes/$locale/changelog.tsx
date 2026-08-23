import { createFileRoute } from "@tanstack/react-router";
import { Container, SectionLabel, Chip } from "@/components/dshx/primitives";
import { createTranslator, formatDate, parseLocale, useI18n, type MessageKey } from "@/lib/i18n";

export const Route = createFileRoute("/$locale/changelog")({
  head: ({ params }) => {
    const t = createTranslator(parseLocale(params.locale));
    return {
    meta: [
      { title: t("changelog.title") + " — DSHX" },
      {
        name: "description",
        content: t("changelog.title"),
      },
      { property: "og:title", content: t("changelog.title") + " — DSHX" },
      {
        property: "og:description",
        content: t("changelog.title"),
      },
    ],
    };
  },
  component: Changelog,
});

const releases = [
  {
    v: "0.4.0",
    date: "2026-08-14",
    dsh: "^0.9",
    notes: ["changelog.note.inspect", "changelog.note.hmr", "changelog.note.api"],
  },
  {
    v: "0.3.2",
    date: "2026-07-28",
    dsh: "^0.8 — ^0.9",
    notes: ["changelog.note.hostRestart", "changelog.note.css"],
  },
  {
    v: "0.3.0",
    date: "2026-06-30",
    dsh: "^0.8",
    notes: ["changelog.note.scaffold", "changelog.note.maps"],
  },
];

function Changelog() {
  const { locale, t } = useI18n();
  return (
    <main>
      <Container className="py-16 md:py-24">
        <SectionLabel index="/changelog">{t("changelog.label")}</SectionLabel>
        <h1 className="text-balance-tight mt-6 text-[clamp(2rem,4.5vw,3.25rem)] leading-[1.05] font-medium">
          {t("changelog.title")}
        </h1>

        <div className="mt-14 space-y-px overflow-hidden rounded-xl border border-border bg-border">
          {releases.map((r) => (
            <div key={r.v} className="grid gap-4 bg-surface p-6 md:grid-cols-[180px_1fr]">
              <div className="flex flex-col gap-2">
                <span className="font-mono text-[15px]">v{r.v}</span>
                <span className="font-mono text-[11.5px] text-muted-foreground">
                  {formatDate(r.date, locale)}
                </span>
                <Chip tone="accent">dsh {r.dsh}</Chip>
              </div>
              <ul className="space-y-2">
                {r.notes.map((n) => (
                  <li key={n} className="flex gap-3 text-[13.5px] text-muted-foreground">
                    <span className="mt-2 size-1 shrink-0 rounded-full bg-accent/70" />
                    {t(n as MessageKey)}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Container>
    </main>
  );
}
