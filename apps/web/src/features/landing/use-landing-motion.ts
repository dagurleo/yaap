import { useEffect, useRef } from "react";

const entranceEase = "cubic-bezier(0.22, 1, 0.36, 1)";

/** Progressive enhancement: SSR content is visible even without animation support. */
export function useLandingMotion() {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const page = root.current;
    if (!page || !window.IntersectionObserver || !page.animate) return;

    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const animations = new Set<Animation>();
    const seen = new WeakSet<Element>();
    const targets = page.querySelectorAll<HTMLElement>(
      ".hero h1, .hero-bottom, .product-window, .section-heading, .feature-grid > div, .ownership .split > div, .setup-top, .steps > li, .faq-grid > div",
    );
    const play = (
      element: Element,
      frames: Keyframe[],
      options: KeyframeAnimationOptions,
    ) => {
      const animation = element.animate(frames, options);
      animations.add(animation);
      animation.finished.then(
        () => animations.delete(animation),
        () => animations.delete(animation),
      );
    };

    const observer = new IntersectionObserver(
      (entries) => {
        let order = 0;
        for (const entry of entries) {
          if (!entry.isIntersecting || seen.has(entry.target)) continue;
          seen.add(entry.target);
          observer.unobserve(entry.target);
          if (preference.matches) continue;

          // Never replay a reveal when scrolling back, or delay focusable content.
          const delay = Math.min(order++ * 55, 165);
          play(
            entry.target,
            [
              { opacity: 0.35, transform: "translateY(12px)" },
              { opacity: 1, transform: "translateY(0)" },
            ],
            { duration: 480, delay, easing: entranceEase, fill: "backwards" },
          );
        }
      },
      { threshold: 0.08 },
    );

    const chart = page.querySelector<SVGPathElement>(".chart .current");
    const chartObserver = new IntersectionObserver(
      (entries) => {
        if (!chart || !entries.some((entry) => entry.isIntersecting)) return;
        chartObserver.disconnect();
        if (preference.matches) return;
        play(
          chart,
          [
            { strokeDasharray: "1", strokeDashoffset: "1" },
            { strokeDasharray: "1", strokeDashoffset: "0" },
          ],
          { duration: 950, easing: entranceEase },
        );
      },
      { threshold: 0.5 },
    );

    const stop = () => {
      if (!preference.matches) return;
      observer.disconnect();
      chartObserver.disconnect();
      animations.forEach((animation) => animation.cancel());
      animations.clear();
    };

    if (!preference.matches) {
      targets.forEach((target) => observer.observe(target));
      if (chart) chartObserver.observe(chart);
    }
    preference.addEventListener("change", stop);
    return () => {
      observer.disconnect();
      chartObserver.disconnect();
      preference.removeEventListener("change", stop);
      animations.forEach((animation) => animation.cancel());
    };
  }, []);

  return root;
}
