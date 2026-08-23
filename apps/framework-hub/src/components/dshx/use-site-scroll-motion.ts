import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useEffect } from "react";

export function useSiteScrollMotion(disabled: boolean) {
  useEffect(() => {
    if (disabled) return;

    gsap.registerPlugin(ScrollTrigger);
    const root = document.querySelector<HTMLElement>("main");
    if (!root) return;

    let context: ReturnType<typeof gsap.context> | undefined;
    let refreshFrame = 0;
    const startFrame = requestAnimationFrame(() => {
      context = gsap.context(() => {
        const sections = Array.from(root.querySelectorAll<HTMLElement>(":scope > section")).filter(
          (section) => section.getBoundingClientRect().height > 160,
        );

        sections.slice(1).forEach((section) => {
          const sectionStartsOffscreen =
            section.getBoundingClientRect().top >= window.innerHeight * 0.82;
          const headingTargets = sectionStartsOffscreen
            ? Array.from(
                section.querySelectorAll<HTMLElement>(
                  "[data-scroll-kicker], [data-scroll-heading]",
                ),
              )
            : [];
          const copyTargets = sectionStartsOffscreen
            ? Array.from(section.querySelectorAll<HTMLElement>("[data-scroll-copy]"))
            : [];
          const allRevealTargets = Array.from(
            section.querySelectorAll<HTMLElement>("[data-scroll-surface]"),
          );
          const revealTargets = allRevealTargets.filter(
            (target) =>
              target.getBoundingClientRect().top >= window.innerHeight * 0.88 &&
              !allRevealTargets.some(
                (candidate) => candidate !== target && candidate.contains(target),
              ),
          );

          if (headingTargets.length > 0) {
            gsap.set(headingTargets, {
              autoAlpha: 0,
              y: 34,
              clipPath: "inset(0 0 100% 0)",
            });
          }
          if (copyTargets.length > 0) {
            gsap.set(copyTargets, { autoAlpha: 0, y: 18 });
          }
          if (revealTargets.length > 0) {
            gsap.set(revealTargets, { autoAlpha: 0, y: 36, scale: 0.99 });
          }

          const headingTimeline =
            headingTargets.length > 0 || copyTargets.length > 0
              ? gsap.timeline({
                  scrollTrigger: {
                    trigger: section,
                    start: "top 82%",
                    toggleActions: "play none none none",
                  },
                })
              : null;

          if (headingTargets.length > 0) {
            headingTimeline?.to(headingTargets, {
              autoAlpha: 1,
              y: 0,
              clipPath: "inset(0 0 0% 0)",
              duration: 0.68,
              stagger: 0.1,
              ease: "power4.out",
            });
          }

          if (copyTargets.length > 0) {
            headingTimeline?.to(
              copyTargets,
              {
                autoAlpha: 1,
                y: 0,
                duration: 0.48,
                stagger: 0.08,
                ease: "power3.out",
              },
              headingTargets.length > 0 ? "-=0.34" : 0,
            );
          }

          revealTargets.forEach((target, index) => {
            gsap.to(target, {
              autoAlpha: 1,
              y: 0,
              scale: 1,
              duration: 0.68,
              delay: Math.min(index * 0.075, 0.375),
              ease: "power3.out",
              scrollTrigger: {
                trigger: target,
                start: "top 88%",
                toggleActions: "play none none none",
              },
            });
          });
        });

        sections.forEach((section) => {
          section.querySelectorAll<HTMLElement>("[data-scroll-parallax]").forEach((target) => {
            const direction = Number(target.dataset["scrollParallax"] ?? 1) || 1;
            gsap.fromTo(
              target,
              { yPercent: -3.5 * direction },
              {
                yPercent: 3.5 * direction,
                ease: "none",
                scrollTrigger: {
                  trigger: section,
                  start: "top bottom",
                  end: "bottom top",
                  scrub: 0.8,
                },
              },
            );
          });
        });
      }, root);

      refreshFrame = requestAnimationFrame(() => ScrollTrigger.refresh());
    });

    return () => {
      cancelAnimationFrame(startFrame);
      cancelAnimationFrame(refreshFrame);
      context?.revert();
    };
  }, [disabled]);
}
