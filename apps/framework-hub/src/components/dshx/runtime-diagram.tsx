import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

const events = [
  "client rebuilt · 72ms",
  "HMR applied",
  "host restarted",
  "slot mounted",
  "API connected",
];

type NodeDef = { id: string; x: number; y: number; label: string; sub?: string; kind?: "core" };

const nodes: NodeDef[] = [
  { id: "src", x: 60, y: 34, label: "src/host.ts" },
  { id: "srcc", x: 368, y: 34, label: "src/client.tsx" },
  { id: "x", x: 230, y: 108, label: "DSHX", kind: "core" },
  { id: "host", x: 96, y: 186, label: "Host", sub: "Tool · API" },
  { id: "client", x: 344, y: 186, label: "Client", sub: "React Slot · useQuery" },
  { id: "runtime", x: 230, y: 268, label: "DSH Runtime", kind: "core" },
];

const edges: [string, string][] = [
  ["src", "x"],
  ["srcc", "x"],
  ["x", "host"],
  ["x", "client"],
  ["host", "runtime"],
  ["client", "runtime"],
];

const byId = (id: string) => nodes.find((n) => n.id === id)!;

export function RuntimeDiagram({ className }: { className?: string | undefined }) {
  const [log, setLog] = useState<string[]>([]);

  useEffect(() => {
    let i = 0;
    const t = setInterval(() => {
      setLog((prev) => [...prev.slice(-3), events[i % events.length]!]);
      i += 1;
    }, 1900);
    return () => clearInterval(t);
  }, []);

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-xl border border-ink-border bg-ink text-ink-foreground",
        className,
      )}
    >
      <div className="flex items-center justify-between border-b border-ink-border px-4 py-2.5">
        <span className="font-mono text-[11px] text-ink-muted">runtime composition</span>
        <span className="flex items-center gap-2 font-mono text-[11px] text-ok">
          <span className="animate-node-pulse inline-block size-1.5 rounded-full bg-ok" />
          ready
        </span>
      </div>

      <svg viewBox="0 0 520 320" className="w-full" role="img" aria-label="DSHX runtime graph">
        <defs>
          <pattern id="dshx-grid" width="26" height="26" patternUnits="userSpaceOnUse">
            <path d="M26 0 L0 0 0 26" fill="none" stroke="currentColor" strokeWidth="0.5" />
          </pattern>
        </defs>
        <rect width="520" height="320" fill="url(#dshx-grid)" className="text-ink-border/40" />

        {edges.map(([a, b], i) => {
          const A = byId(a);
          const B = byId(b);
          return (
            <g key={`${a}-${b}`}>
              <line
                x1={A.x + 28}
                y1={A.y + 14}
                x2={B.x + 28}
                y2={B.y + 6}
                stroke="currentColor"
                strokeWidth="1"
                className="animate-draw text-ink-border"
                style={{ ["--dash" as string]: "300", animationDelay: `${i * 180}ms` }}
              />
              <line
                x1={A.x + 28}
                y1={A.y + 14}
                x2={B.x + 28}
                y2={B.y + 6}
                stroke="currentColor"
                strokeWidth="1.25"
                className="animate-flow text-ink-accent/70"
                style={{ animationDelay: `${i * 300}ms` }}
              />
            </g>
          );
        })}

        {nodes.map((n) => (
          <g key={n.id}>
            {n.kind === "core" ? (
              <>
                <line
                  x1={n.x + 12}
                  y1={n.y - 8}
                  x2={n.x + 44}
                  y2={n.y + 20}
                  stroke="currentColor"
                  strokeWidth="1"
                  className="text-ink-accent"
                />
                <line
                  x1={n.x + 44}
                  y1={n.y - 8}
                  x2={n.x + 12}
                  y2={n.y + 20}
                  stroke="currentColor"
                  strokeWidth="1"
                  className="text-ink-accent"
                />
              </>
            ) : null}
            <rect
              x={n.x - 6}
              y={n.y - 12}
              width={n.label.length * 6.6 + 40}
              height={n.sub ? 36 : 26}
              rx="6"
              className={cn(
                "fill-ink stroke-ink-border",
                n.kind === "core" && "stroke-ink-accent/60",
              )}
              strokeWidth="1"
            />
            <text
              x={n.x + 6}
              y={n.y + 5}
              className={cn(
                "font-mono text-[11px]",
                n.kind === "core" ? "fill-[oklch(0.8_0.13_290)]" : "fill-[oklch(0.9_0.006_280)]",
              )}
            >
              {n.label}
            </text>
            {n.sub && (
              <text x={n.x + 6} y={n.y + 19} className="fill-[oklch(0.63_0.014_280)] font-mono text-[9.5px]">
                {n.sub}
              </text>
            )}
          </g>
        ))}
      </svg>

      <div className="border-t border-ink-border px-4 py-3 font-mono text-[11.5px] leading-[1.9]">
        {log.length === 0 && <div className="text-ink-muted">watching…</div>}
        {log.map((l, i) => (
          <div
            key={`${l}-${i}`}
            className="animate-rise flex items-center gap-2 text-ink-muted"
            style={{ opacity: 0.4 + i * 0.2 }}
          >
            <span className="text-ink-accent">·</span>
            {l}
          </div>
        ))}
      </div>
    </div>
  );
}
