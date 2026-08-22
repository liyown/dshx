import { useEffect, useState } from "react";
import { Code, CodeSurface } from "./code";
import { cn } from "@/lib/utils";

const clientCode = `export default defineClient({
  api: statusApi,
  slots: [sidebarStatus],
})`;

const hostCode = `export default defineHost({
  tools: [searchTool],
  api: statusApi.host(ctx => ctx),
})`;

const clientSteps = [
  { t: "save", d: "client.tsx" },
  { t: "client rebuilt", d: "68ms" },
  { t: "HMR applied", d: "" },
  { t: "UI updated", d: "slot re-rendered" },
];

const hostSteps = [
  { t: "save", d: "host.ts" },
  { t: "host rebuilt", d: "142ms" },
  { t: "runtime restarted", d: "" },
  { t: "ready", d: "tools re-registered" },
];

export function DevLoop() {
  const [target, setTarget] = useState<"client" | "host">("client");
  const [step, setStep] = useState(0);

  const steps = target === "client" ? clientSteps : hostSteps;

  useEffect(() => {
    setStep(0);
    const t = setInterval(() => setStep((s) => (s + 1) % (steps.length + 1)), 900);
    return () => clearInterval(t);
  }, [target, steps.length]);

  return (
    <div className="grid gap-px overflow-hidden rounded-xl border border-border bg-border md:grid-cols-2">
      <div className="bg-background p-4 md:p-6">
        <div className="mb-4 flex items-center gap-1">
          {(["client", "host"] as const).map((k) => (
            <button
              key={k}
              onClick={() => setTarget(k)}
              className={cn(
                "rounded-md px-2.5 py-1 font-mono text-[11.5px] transition-colors",
                target === k
                  ? "bg-accent-soft text-accent"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {k === "client" ? "src/client.tsx" : "src/host.ts"}
            </button>
          ))}
        </div>
        <CodeSurface title={target === "client" ? "src/client.tsx" : "src/host.ts"}>
          <Code
            code={target === "client" ? clientCode : hostCode}
            highlightLines={step > 0 ? [2] : []}
          />
        </CodeSurface>
      </div>

      <div className="bg-background p-4 md:p-6">
        <div className="mb-4 font-mono text-[11.5px] text-muted-foreground">dshx dev</div>
        <div className="rounded-xl border border-ink-border bg-ink p-4">
          <div className="flex flex-col gap-2.5">
            {steps.map((s, i) => {
              const active = step > i;
              return (
                <div
                  key={s.t}
                  className={cn(
                    "flex items-center gap-3 font-mono text-[12.5px] transition-all duration-300",
                    active ? "opacity-100" : "opacity-25",
                  )}
                >
                  <span
                    className={cn(
                      "size-1.5 shrink-0 rounded-full transition-colors",
                      active
                        ? i === steps.length - 1
                          ? "bg-ok"
                          : "bg-ink-accent"
                        : "bg-ink-border",
                    )}
                  />
                  <span className={i === steps.length - 1 ? "text-ok" : "text-ink-foreground"}>
                    {s.t}
                  </span>
                  {s.d && <span className="text-ink-muted">· {s.d}</span>}
                  {i < steps.length - 1 && <span className="ml-auto text-ink-border">↓</span>}
                </div>
              );
            })}
          </div>
        </div>
        <p className="mt-4 font-mono text-[11px] text-muted-foreground">
          {target === "client"
            ? "client changes never restart the host"
            : "host changes restart the runtime, client state re-attaches"}
        </p>
      </div>
    </div>
  );
}
