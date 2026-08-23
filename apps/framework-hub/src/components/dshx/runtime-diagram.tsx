import { motion, useInView } from "motion/react";
import { useEffect, useId, useRef, useState } from "react";

import { useI18n } from "@/lib/i18n";
import type { MessageKey } from "@/lib/i18n/messages";
import { cn } from "@/lib/utils";

import { useHydratedReducedMotion } from "./use-hydrated-reduced-motion";

const ENTRY_EASE = [0.16, 1, 0.3, 1] as const;

type Tone = "violet" | "teal";
type NodeGlyph = "host" | "client" | "runtime" | "plugins";
type SatelliteGlyph = "tool" | "api" | "slot" | "inspect";

type FlowPathProps = {
  d: string;
  delay: number;
  duration: number;
  running: boolean;
  reduceMotion: boolean;
  tone?: Tone;
  dashed?: boolean;
};

type ArchitectureNodeProps = {
  x: number;
  y: number;
  width: number;
  label: string;
  source?: string | undefined;
  glyph: NodeGlyph;
  tone?: Tone;
  delay: number;
  ports: Array<"left" | "right">;
  reduceMotion: boolean;
};

type SatelliteProps = {
  x: number;
  y: number;
  width: number;
  label: string;
  glyph: SatelliteGlyph;
  tone?: Tone;
  delay: number;
  reduceMotion: boolean;
};

const flows: Omit<FlowPathProps, "running" | "reduceMotion">[] = [
  { d: "M 130 84 C 148 96 149 121 162 136", delay: 0.2, duration: 3.3, dashed: true },
  { d: "M 130 236 C 148 221 149 194 162 180", delay: 1.45, duration: 3.1, dashed: true },
  {
    d: "M 590 84 C 572 96 571 121 558 136",
    delay: 0.75,
    duration: 3.4,
    dashed: true,
    tone: "teal",
  },
  {
    d: "M 590 236 C 572 221 571 194 558 180",
    delay: 2.05,
    duration: 3.2,
    dashed: true,
    tone: "teal",
  },
  { d: "M 235 158 C 274 158 286 178 309 190", delay: 0.35, duration: 3.5 },
  {
    d: "M 485 158 C 446 158 434 178 411 190",
    delay: 1.25,
    duration: 3.5,
    tone: "teal",
  },
  { d: "M 351 254 C 347 284 323 307 300 320", delay: 2.1, duration: 3.7 },
  { d: "M 373 340 C 398 340 420 340 438 340", delay: 2.9, duration: 3.15 },
  {
    d: "M 563 340 C 580 340 594 340 608 340",
    delay: 3.4,
    duration: 2.85,
    dashed: true,
    tone: "teal",
  },
];

const pluginParticles = [
  { cx: 620, cy: 340, r: 4.5, tone: "violet", delay: 0 },
  { cx: 642, cy: 321, r: 4, tone: "violet", delay: 0.16 },
  { cx: 655, cy: 349, r: 3.5, tone: "teal", delay: 0.32 },
  { cx: 632, cy: 365, r: 3, tone: "teal", delay: 0.48 },
  { cx: 670, cy: 370, r: 3.5, tone: "teal", delay: 0.64 },
  { cx: 676, cy: 338, r: 2.5, tone: "violet", delay: 0.8 },
] as const;

function useDocumentVisible() {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const update = () => setVisible(document.visibilityState === "visible");
    update();
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);

  return visible;
}

function FlowPath({
  d,
  delay,
  duration,
  running,
  reduceMotion,
  tone = "violet",
  dashed = false,
}: FlowPathProps) {
  return (
    <g
      className={cn(
        "runtime-motion-flow",
        `runtime-motion-flow-${tone}`,
        dashed && "runtime-motion-flow-dashed",
      )}
    >
      <motion.path
        d={d}
        className="runtime-motion-flow-base"
        initial={reduceMotion ? false : { pathLength: 0.72, opacity: 0.28 }}
        animate={{ pathLength: 1, opacity: dashed ? 0.62 : 0.82 }}
        transition={{
          duration: reduceMotion ? 0 : 0.78,
          delay: reduceMotion ? 0 : Math.min(delay * 0.22, 0.52),
          ease: ENTRY_EASE,
        }}
      />
      <motion.path
        d={d}
        className="runtime-motion-flow-beam"
        initial={false}
        animate={
          running ? { pathOffset: [0, 1], opacity: [0, 1, 1, 0] } : { pathOffset: 0, opacity: 0 }
        }
        style={{ pathLength: dashed ? 0.07 : 0.16, pathSpacing: dashed ? 0.93 : 0.84 }}
        transition={
          running
            ? {
                pathOffset: { duration, delay, ease: "linear", repeat: Infinity },
                opacity: {
                  duration,
                  delay,
                  ease: "linear",
                  repeat: Infinity,
                  times: [0, 0.08, 0.9, 1],
                },
              }
            : { duration: 0.18 }
        }
      />
    </g>
  );
}

function ArchitectureGlyph({ glyph }: { glyph: NodeGlyph }) {
  if (glyph === "runtime") {
    return (
      <g className="runtime-motion-node-glyph">
        <path d="m -7 -5 7 -4 7 4 -7 4 -7 -4Z" />
        <path d="m -7 0 7 4 7 -4M -7 5 0 9 7 5" />
      </g>
    );
  }

  if (glyph === "plugins") {
    return (
      <path
        className="runtime-motion-node-glyph"
        d="M -8 -7 h 6 v -3 a 3 3 0 0 1 6 0 v 3 h 6 v 6 H 7 a 3 3 0 0 0 0 6 h 3 v 6 H 4 V 8 a 3 3 0 0 0 -6 0 v 3 h -6 V 5 h 3 a 3 3 0 0 0 0 -6 h -3 Z"
      />
    );
  }

  return (
    <g className="runtime-motion-node-glyph">
      <path d="M -7 -6 H 7 M -7 0 H 4 M -7 6 H 1" />
      {glyph === "client" ? <path d="M 8 -6 V 6" /> : null}
    </g>
  );
}

function ArchitectureNode({
  x,
  y,
  width,
  label,
  source,
  glyph,
  tone = "violet",
  delay,
  ports,
  reduceMotion,
}: ArchitectureNodeProps) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <motion.g
        className={cn("runtime-motion-node", `runtime-motion-node-${tone}`)}
        initial={reduceMotion ? false : { opacity: 0.72, scale: 0.96, y: 4 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{
          duration: reduceMotion ? 0 : 0.62,
          delay: reduceMotion ? 0 : delay,
          ease: ENTRY_EASE,
        }}
      >
        {source ? (
          <text className="runtime-motion-node-source" y="-32" textAnchor="middle">
            {source}
          </text>
        ) : null}
        <rect
          className="runtime-motion-node-shell"
          x={-width / 2}
          y="-21"
          width={width}
          height="42"
          rx="10"
        />
        <g transform={`translate(${-width / 2 + 22} 0)`}>
          <ArchitectureGlyph glyph={glyph} />
        </g>
        <text className="runtime-motion-node-label" x={-width / 2 + 41} y="4">
          {label}
        </text>
        <circle className="runtime-motion-node-status" cx={width / 2 - 12} cy="-11" r="3.5" />
        {ports.includes("left") ? (
          <g className="runtime-motion-port" transform={`translate(${-width / 2} 0)`}>
            <circle r="5" />
            <circle r="2" />
          </g>
        ) : null}
        {ports.includes("right") ? (
          <g className="runtime-motion-port" transform={`translate(${width / 2} 0)`}>
            <circle r="5" />
            <circle r="2" />
          </g>
        ) : null}
      </motion.g>
    </g>
  );
}

function SatelliteIcon({ glyph }: { glyph: SatelliteGlyph }) {
  if (glyph === "tool") {
    return (
      <path d="M -4 -5 a 5 5 0 0 0 6 6 l 4 4 -3 3 -4 -4 a 5 5 0 0 0 -6 -6 l 3 1 2 -2 -2 -2Z" />
    );
  }

  if (glyph === "api") {
    return <path d="M -6 4 0 -7 6 4 M -3 0 H 3 M -7 7 H 7" />;
  }

  if (glyph === "slot") {
    return (
      <path d="m 0 -7 6 3.5 V 4 L 0 7.5 -6 4 v -7.5 L 0 -7Z M 0 0 6 -3.5 M 0 0 -6 -3.5 M 0 0 v 7.5" />
    );
  }

  return (
    <g>
      <circle cx="-1" cy="-1" r="5" />
      <path d="m 3 3 5 5" />
    </g>
  );
}

function Satellite({
  x,
  y,
  width,
  label,
  glyph,
  tone = "violet",
  delay,
  reduceMotion,
}: SatelliteProps) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <motion.g
        className={cn("runtime-motion-satellite", `runtime-motion-satellite-${tone}`)}
        initial={reduceMotion ? false : { opacity: 0.68, scale: 0.92 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{
          duration: reduceMotion ? 0 : 0.52,
          delay: reduceMotion ? 0 : delay,
          ease: ENTRY_EASE,
        }}
      >
        <rect x={-width / 2} y="-16" width={width} height="32" rx="16" />
        <g className="runtime-motion-satellite-icon" transform={`translate(${-width / 2 + 17} 0)`}>
          <circle r="10" />
          <g>
            <SatelliteIcon glyph={glyph} />
          </g>
        </g>
        <text x={-width / 2 + 33} y="4">
          {label}
        </text>
      </motion.g>
    </g>
  );
}

function Core({
  label,
  running,
  reduceMotion,
}: {
  label: string;
  running: boolean;
  reduceMotion: boolean;
}) {
  return (
    <g transform="translate(360 205)">
      <motion.g
        className="runtime-motion-core-orbit"
        initial={false}
        animate={running ? { rotate: 360 } : { rotate: 0 }}
        transition={
          running ? { duration: 18, ease: "linear", repeat: Infinity } : { duration: 0.2 }
        }
      >
        <circle r="58" />
        <circle className="runtime-motion-core-orbit-violet" cx="0" cy="-58" r="2.5" />
        <circle className="runtime-motion-core-orbit-teal" cx="58" cy="0" r="2.5" />
      </motion.g>
      <motion.g
        className="runtime-motion-core"
        initial={reduceMotion ? false : { opacity: 0.8, scale: 0.96 }}
        animate={
          running && !reduceMotion
            ? { opacity: 1, scale: [0.99, 1.015, 0.99] }
            : { opacity: 1, scale: 1 }
        }
        transition={
          running && !reduceMotion
            ? {
                opacity: { duration: 0.6 },
                scale: { duration: 4.8, ease: "easeInOut", repeat: Infinity },
              }
            : { duration: 0.2 }
        }
      >
        <circle className="runtime-motion-core-halo" r="48" />
        <circle className="runtime-motion-core-surface" r="38" />
        <circle className="runtime-motion-core-track" r="30" />
        <g className="runtime-motion-core-router">
          <path
            className="runtime-motion-core-route-violet"
            d="M -23 0 H -12 M 0 -23 V -12 M 0 12 V 23"
          />
          <path className="runtime-motion-core-route-teal" d="M 12 0 H 23" />
          <rect
            className="runtime-motion-core-chip"
            x="-10"
            y="-10"
            width="20"
            height="20"
            rx="5"
            transform="rotate(45)"
          />
          <circle className="runtime-motion-core-chip-dot" r="3.25" />
          <circle className="runtime-motion-core-route-violet" cx="-23" cy="0" r="2" />
          <circle className="runtime-motion-core-route-teal" cx="23" cy="0" r="2" />
          <circle className="runtime-motion-core-route-violet" cx="0" cy="-23" r="2" />
          <circle className="runtime-motion-core-route-violet" cx="0" cy="23" r="2" />
        </g>
        <circle className="runtime-motion-core-port" cx="-51" cy="-15" r="3.5" />
        <circle className="runtime-motion-core-port" cx="51" cy="-15" r="3.5" />
        <circle className="runtime-motion-core-port" cx="-9" cy="51" r="3.5" />
      </motion.g>
      <motion.text
        className="runtime-motion-core-label"
        y="76"
        textAnchor="middle"
        initial={reduceMotion ? false : { opacity: 0.55 }}
        animate={{ opacity: 1 }}
        transition={{ duration: reduceMotion ? 0 : 0.6, delay: reduceMotion ? 0 : 0.52 }}
      >
        {label}
      </motion.text>
    </g>
  );
}

export function RuntimeDiagram({ className }: { className?: string | undefined }) {
  const { t } = useI18n();
  const stageRef = useRef<HTMLDivElement>(null);
  const inView = useInView(stageRef, { amount: 0.32 });
  const reduceMotion = useHydratedReducedMotion();
  const documentVisible = useDocumentVisible();
  const running = inView && documentVisible && !reduceMotion;
  const titleId = `runtime-motion-title-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const descriptionId = `${titleId}-description`;

  const text = (key: MessageKey) => t(key);

  return (
    <div
      ref={stageRef}
      className={cn("runtime-motion-stage", className)}
      data-scroll-surface
      data-scroll-parallax="-1"
    >
      <svg
        className="runtime-motion-svg"
        viewBox="0 0 720 430"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-labelledby={`${titleId} ${descriptionId}`}
      >
        <title id={titleId}>{text("runtime.graphLabel")}</title>
        <desc id={descriptionId}>
          {text("runtime.node.host")} · {text("runtime.node.client")} ·{" "}
          {text("runtime.node.runtime")} · {text("runtime.node.plugins")} · DSHX
        </desc>

        <g aria-hidden="true">
          <path className="runtime-motion-guide" d="M 72 205 H 648" />
          <circle className="runtime-motion-guide-dot" cx="72" cy="205" r="2" />
          <circle className="runtime-motion-guide-dot" cx="648" cy="205" r="2" />

          {flows.map((flow) => (
            <FlowPath key={flow.d} {...flow} running={running} reduceMotion={reduceMotion} />
          ))}

          <Satellite
            x={95}
            y={72}
            width={72}
            label={text("runtime.node.tool")}
            glyph="tool"
            delay={0.1}
            reduceMotion={reduceMotion}
          />
          <Satellite
            x={95}
            y={248}
            width={68}
            label={text("runtime.node.api")}
            glyph="api"
            delay={0.24}
            reduceMotion={reduceMotion}
          />
          <Satellite
            x={625}
            y={72}
            width={72}
            label={text("runtime.node.slot")}
            glyph="slot"
            tone="teal"
            delay={0.18}
            reduceMotion={reduceMotion}
          />
          <Satellite
            x={625}
            y={248}
            width={88}
            label={text("runtime.node.inspect")}
            glyph="inspect"
            tone="teal"
            delay={0.32}
            reduceMotion={reduceMotion}
          />

          <ArchitectureNode
            x={175}
            y={158}
            width={120}
            label={text("runtime.node.host")}
            source={text("runtime.node.sourceHost")}
            glyph="host"
            delay={0.22}
            ports={["right"]}
            reduceMotion={reduceMotion}
          />
          <ArchitectureNode
            x={545}
            y={158}
            width={120}
            label={text("runtime.node.client")}
            source={text("runtime.node.sourceClient")}
            glyph="client"
            tone="teal"
            delay={0.3}
            ports={["left"]}
            reduceMotion={reduceMotion}
          />
          <ArchitectureNode
            x={300}
            y={340}
            width={146}
            label={text("runtime.node.runtime")}
            glyph="runtime"
            delay={0.46}
            ports={["right"]}
            reduceMotion={reduceMotion}
          />
          <ArchitectureNode
            x={500}
            y={340}
            width={126}
            label={text("runtime.node.plugins")}
            glyph="plugins"
            tone="teal"
            delay={0.56}
            ports={["left", "right"]}
            reduceMotion={reduceMotion}
          />

          <Core label={text("runtime.node.dshx")} running={running} reduceMotion={reduceMotion} />

          <g className="runtime-motion-particles">
            {pluginParticles.map((particle) => (
              <motion.circle
                key={`${particle.cx}-${particle.cy}`}
                className={`runtime-motion-particle runtime-motion-particle-${particle.tone}`}
                cx={particle.cx}
                cy={particle.cy}
                r={particle.r}
                initial={reduceMotion ? false : { opacity: 0.42, scale: 0.76 }}
                animate={
                  running
                    ? { opacity: [0.35, 1, 0.52], scale: [0.76, 1.18, 0.88] }
                    : { opacity: 0.6, scale: 1 }
                }
                transition={
                  running
                    ? {
                        duration: 2.8,
                        delay: particle.delay,
                        ease: "easeInOut",
                        repeat: Infinity,
                      }
                    : { duration: 0.2 }
                }
              />
            ))}
          </g>
        </g>
      </svg>
    </div>
  );
}
