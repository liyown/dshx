import { createFileRoute } from "@tanstack/react-router";
import { Container, SectionLabel, Chip } from "@/components/dshx/primitives";

export const Route = createFileRoute("/changelog")({
  head: () => ({
    meta: [
      { title: "Changelog & compatibility — DSHX" },
      {
        name: "description",
        content:
          "DSHX release history and DSH runtime compatibility matrix across framework versions.",
      },
      { property: "og:title", content: "Changelog & compatibility — DSHX" },
      {
        property: "og:description",
        content: "Release notes and supported DSH runtime versions for each DSHX release.",
      },
    ],
  }),
  component: Changelog,
});

const releases = [
  {
    v: "0.4.0",
    date: "2026-08-14",
    dsh: "^0.9",
    notes: [
      "dshx inspect slots reads live runtime slot registrations",
      "Client HMR preserves slot-local React state",
      "Typed API contracts generate host and client stubs",
    ],
  },
  {
    v: "0.3.2",
    date: "2026-07-28",
    dsh: "^0.8 — ^0.9",
    notes: ["Faster host restarts (avg 142ms)", "CSS Modules lifecycle fixes on slot unmount"],
  },
  {
    v: "0.3.0",
    date: "2026-06-30",
    dsh: "^0.8",
    notes: ["dshx add ui scaffolding", "Production builds emit source maps by default"],
  },
];

function Changelog() {
  return (
    <main>
      <Container className="py-16 md:py-24">
        <SectionLabel index="/changelog">Releases</SectionLabel>
        <h1 className="text-balance-tight mt-6 text-[clamp(2rem,4.5vw,3.25rem)] leading-[1.05] font-medium">
          Changelog & compatibility.
        </h1>

        <div className="mt-14 space-y-px overflow-hidden rounded-xl border border-border bg-border">
          {releases.map((r) => (
            <div key={r.v} className="grid gap-4 bg-surface p-6 md:grid-cols-[180px_1fr]">
              <div className="flex flex-col gap-2">
                <span className="font-mono text-[15px]">v{r.v}</span>
                <span className="font-mono text-[11.5px] text-muted-foreground">{r.date}</span>
                <Chip tone="accent">dsh {r.dsh}</Chip>
              </div>
              <ul className="space-y-2">
                {r.notes.map((n) => (
                  <li key={n} className="flex gap-3 text-[13.5px] text-muted-foreground">
                    <span className="mt-2 size-1 shrink-0 rounded-full bg-accent/70" />
                    {n}
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
