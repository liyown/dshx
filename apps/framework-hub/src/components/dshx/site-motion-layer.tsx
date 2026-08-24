import { useRouterState } from "@tanstack/react-router";
import { motion, useScroll, useSpring, useTransform } from "motion/react";
import { lazy, Suspense, useEffect, useRef, useState } from "react";

import { useHydratedReducedMotion } from "./use-hydrated-reduced-motion";

const PixelBlast = lazy(() => import("@/components/PixelBlast"));

type SceneState = {
  index: number;
  count: number;
};

const scenePositions = [18, 74, 28, 68, 22, 78, 36, 64] as const;

function getMajorSurfaces() {
  const candidates = Array.from(
    document.querySelectorAll<HTMLElement>("main > section, main > article, main > div"),
  );
  return candidates.filter((element) => element.getBoundingClientRect().height > 160);
}

export function SiteMotionLayer() {
  const sceneRef = useRef(0);
  const [mounted, setMounted] = useState(false);
  const [desktopEffects, setDesktopEffects] = useState(false);
  const [scene, setScene] = useState<SceneState>({ index: 0, count: 1 });
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const reduceMotion = useHydratedReducedMotion();
  const { scrollYProgress } = useScroll();
  const progress = useSpring(scrollYProgress, {
    stiffness: 110,
    damping: 28,
    mass: 0.24,
  });
  const railProgress = reduceMotion ? scrollYProgress : progress;
  const progressPosition = useTransform(railProgress, (value) => `${value * 100}%`);
  const fieldY = useTransform(progress, [0, 1], ["-6vh", "6vh"]);
  const glowY = useTransform(progress, [0, 1], ["-14vh", "58vh"]);

  useEffect(() => {
    setMounted(true);
    const query = window.matchMedia("(min-width: 768px)");
    const update = () => setDesktopEffects(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    sceneRef.current = scene.index;
  }, [scene.index]);

  useEffect(() => {
    const surfaces = getMajorSurfaces();
    if (surfaces.length === 0) {
      setScene({ index: 0, count: 1 });
      return;
    }

    const visibility = new Map<Element, number>();
    surfaces.forEach((surface) => visibility.set(surface, 0));
    setScene({ index: 0, count: surfaces.length });

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => visibility.set(entry.target, entry.intersectionRatio));

        let nextIndex = sceneRef.current;
        let nextVisibility = -1;
        surfaces.forEach((surface, index) => {
          const ratio = visibility.get(surface) ?? 0;
          if (ratio > nextVisibility) {
            nextIndex = index;
            nextVisibility = ratio;
          }
        });

        if (nextVisibility > 0) {
          setScene((current) =>
            current.index === nextIndex && current.count === surfaces.length
              ? current
              : { index: nextIndex, count: surfaces.length },
          );
        }
      },
      {
        rootMargin: "-18% 0px -32%",
        threshold: [0, 0.08, 0.2, 0.38, 0.58, 0.78],
      },
    );

    surfaces.forEach((surface) => observer.observe(surface));
    return () => observer.disconnect();
  }, [pathname]);

  const glowX = scenePositions[scene.index % scenePositions.length] ?? 50;

  return (
    <div className="site-motion-layer" aria-hidden="true">
      <motion.div
        className="site-pixel-blast-stage"
        style={{
          y: reduceMotion ? 0 : fieldY,
        }}
      >
        {!mounted || reduceMotion || !desktopEffects ? null : (
          <Suspense fallback={null}>
            <PixelBlast
              className="site-pixel-blast-field"
              variant="square"
              pixelSize={3}
              color="#B497CF"
              antialias={false}
              maxPixelRatio={1}
              frameRate={60}
              patternScale={2}
              patternDensity={1}
              enableRipples
              rippleSpeed={0.3}
              rippleThickness={0.1}
              rippleIntensityScale={1}
              speed={0.5}
              transparent
              edgeFade={0.5}
            />
          </Suspense>
        )}
      </motion.div>

      <div className="site-motion-readability" />

      <motion.div
        className="site-motion-focus"
        style={{ y: reduceMotion ? 0 : glowY }}
        animate={{ x: `${glowX}vw`, opacity: reduceMotion ? 0.18 : 0.42 }}
        transition={{ x: { type: "spring", stiffness: 72, damping: 22, mass: 0.7 } }}
      />

      <div className="site-scroll-rail">
        <span className="site-scroll-rail-track" />
        <motion.span className="site-scroll-rail-progress" style={{ scaleY: railProgress }} />
        <motion.span className="site-scroll-rail-pulse" style={{ top: progressPosition }} />
        {scene.count > 1 ? (
          <span className="site-scroll-scenes">
            {Array.from({ length: scene.count }, (_, index) => (
              <span
                key={index}
                className={index === scene.index ? "site-scroll-scene-active" : undefined}
                style={{ top: `${(index / Math.max(scene.count - 1, 1)) * 100}%` }}
              />
            ))}
          </span>
        ) : null}
      </div>
    </div>
  );
}
