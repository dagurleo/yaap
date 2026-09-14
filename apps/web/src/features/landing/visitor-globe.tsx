import { useEffect, useRef, useState } from "react";
import type { Globe } from "cobe";

const cities: {
  name: string;
  country: string;
  flag: string;
  path: string;
  location: [number, number];
  size: number;
}[] = [
  {
    name: "London",
    country: "United Kingdom",
    flag: "gb",
    path: "/pricing",
    location: [51.5072, -0.1276],
    size: 0.035,
  },
  {
    name: "New York",
    country: "United States",
    flag: "us",
    path: "/",
    location: [40.7128, -74.006],
    size: 0.035,
  },
  {
    name: "Tokyo",
    country: "Japan",
    flag: "jp",
    path: "/docs",
    location: [35.6762, 139.6503],
    size: 0.025,
  },
  {
    name: "Sydney",
    country: "Australia",
    flag: "au",
    path: "/pricing",
    location: [-33.8688, 151.2093],
    size: 0.025,
  },
  {
    name: "Reykjavík",
    country: "Iceland",
    flag: "is",
    path: "/",
    location: [64.1466, -21.9426],
    size: 0.025,
  },
  {
    name: "Singapore",
    country: "Singapore",
    flag: "sg",
    path: "/docs",
    location: [1.3521, 103.8198],
    size: 0.025,
  },
];
const markerElevation = 0.015;

// Illustrative activity only. Never fetch private visitor telemetry for this hero.
const markers: { location: [number, number]; size: number }[] = [
  ...cities,
  { location: [-23.5505, -46.6333], size: 0.025 },
  { location: [37.7749, -122.4194], size: 0.03 },
  { location: [43.6532, -79.3832], size: 0.02 },
  { location: [19.4326, -99.1332], size: 0.025 },
  { location: [49.2827, -123.1207], size: 0.02 },
  { location: [52.52, 13.405], size: 0.025 },
  { location: [48.8566, 2.3522], size: 0.02 },
  { location: [59.3293, 18.0686], size: 0.02 },
  { location: [6.5244, 3.3792], size: 0.03 },
  { location: [-1.2921, 36.8219], size: 0.025 },
  { location: [-33.9249, 18.4241], size: 0.025 },
  { location: [25.2048, 55.2708], size: 0.025 },
  { location: [19.076, 72.8777], size: 0.03 },
  { location: [37.5665, 126.978], size: 0.025 },
  { location: [22.3193, 114.1694], size: 0.02 },
  { location: [-6.2088, 106.8456], size: 0.025 },
  { location: [-36.8485, 174.7633], size: 0.025 },
  { location: [-34.6037, -58.3816], size: 0.025 },
];

export function VisitorGlobe() {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const labelsRef = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    const mount = canvasRef.current;
    if (!mount) return;
    const stage = mount.parentElement!;
    // COBE wraps its canvas; keep that DOM inside a mount owned by this effect.
    const canvas = document.createElement("canvas");
    mount.appendChild(canvas);
    const context = {
      alpha: true,
      antialias: true,
      stencil: false,
      depth: false,
    };
    if (
      !canvas.getContext("webgl2", context) &&
      !canvas.getContext("webgl", context)
    ) {
      canvas.remove();
      return;
    }
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const isDarkMode = () => document.documentElement.dataset.theme === "dark";
    let globe: Globe | undefined;
    let disposed = false;
    let frame = 0;
    let visible = true;
    let last = 0;
    let phi = 0.8;
    let theta = 0.22;
    let pointerId: number | undefined;
    let pointerX = 0;
    let pointerY = 0;
    // Match COBE 2's orthographic projection (unit sphere radius 0.8).
    // Labels share the canvas's square bounds, so percentages also survive resize.
    const positionLabels = () => {
      const projected = cities.map((city, index) => {
        const label = labelsRef.current[index];
        if (!label) return null;
        const card = label.firstElementChild as HTMLElement;
        const width = card.offsetWidth;
        const height = card.offsetHeight;
        const latitude = (city.location[0] * Math.PI) / 180;
        const longitude = (city.location[1] * Math.PI) / 180 - Math.PI;
        const radius = 0.8 + markerElevation;
        const x = -Math.cos(latitude) * Math.cos(longitude) * radius;
        const y = Math.sin(latitude) * radius;
        const z = Math.cos(latitude) * Math.sin(longitude) * radius;
        const horizontal = Math.cos(phi) * x + Math.sin(phi) * z;
        const vertical =
          Math.sin(phi) * Math.sin(theta) * x +
          Math.cos(theta) * y -
          Math.cos(phi) * Math.sin(theta) * z;
        const depth =
          -Math.sin(phi) * Math.cos(theta) * x +
          Math.sin(theta) * y +
          Math.cos(phi) * Math.cos(theta) * z;
        return {
          label,
          width,
          height,
          left: (horizontal + 1) * 50,
          top: (1 - vertical) * 50,
          depth,
        };
      });
      // Keep cards upright and choose a free side of the marker at every tilt.
      // Read dimensions first, then write positions to avoid repeated layout work.
      const size = mount.clientWidth;
      const occupied: {
        left: number;
        top: number;
        right: number;
        bottom: number;
      }[] = [];
      for (const point of projected
        .filter((point) => point !== null)
        .sort((a, b) => b.depth - a.depth)) {
        const { label, width, height, left, top, depth } = point;
        const x = (left / 100) * (size - width);
        const y = (top / 100) * size;
        const offsets = [-height - 10, 10, -2 * height - 16, height + 16];
        const offset = offsets.find(
          (offset) =>
            !occupied.some(
              (rect) =>
                x < rect.right + 6 &&
                x + width + 6 > rect.left &&
                y + offset < rect.bottom + 6 &&
                y + offset + height + 6 > rect.top,
            ),
        );
        const opacity =
          offset === undefined ? 0 : Math.max(0, Math.min(1, depth / 0.15));
        if (opacity > 0)
          occupied.push({
            left: x,
            top: y + offset!,
            right: x + width,
            bottom: y + offset! + height,
          });
        label.style.left = `${left}%`;
        label.style.top = `${top}%`;
        label.style.opacity = String(opacity);
        label.style.setProperty("--label-align", `${left}%`);
        label.style.setProperty(
          "--label-offset-y",
          `${offset ?? offsets[0]}px`,
        );
      }
    };
    const updateRotation = () => {
      globe?.update({ phi, theta });
      positionLabels();
    };
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    const draw = (now: number) => {
      if (disposed || !globe) return;
      if (last && pointerId === undefined && !reduced.matches) {
        phi += Math.min(now - last, 50) * ((Math.PI * 2) / 90000);
      }
      last = now;
      updateRotation();
      if (
        visible &&
        !document.hidden &&
        !reduced.matches &&
        pointerId === undefined
      )
        frame = requestAnimationFrame(draw);
    };
    const resume = () => {
      cancelAnimationFrame(frame);
      last = 0;
      setReady(Boolean(globe));
      if (globe && visible && !document.hidden && !reduced.matches)
        frame = requestAnimationFrame(draw);
    };
    const resize = new ResizeObserver(() => {
      const width = mount.clientWidth;
      globe?.update({ width, height: width });
      positionLabels();
      resume();
    });
    const syncColorScheme = () => {
      const darkMode = isDarkMode();
      globe?.update({
        dark: darkMode ? 0.82 : 0,
        mapBrightness: darkMode ? 6.5 : 5.5,
        mapBaseBrightness: darkMode ? 0.08 : 0,
        baseColor: darkMode ? [0.18, 0.24, 0.34] : [0.76, 0.82, 0.91],
        glowColor: darkMode ? [0.08, 0.11, 0.16] : [0.975, 0.98, 0.985],
      });
      resume();
    };
    const themeObserver = new MutationObserver(syncColorScheme);
    const visibility = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      resume();
    });
    const contextLost = (event: Event) => {
      event.preventDefault();
      cancelAnimationFrame(frame);
      globe?.destroy();
      globe = undefined;
      setReady(false);
    };
    const pointerDown = (event: PointerEvent) => {
      if (!globe || pointerId !== undefined || event.button !== 0) return;
      pointerId = event.pointerId;
      pointerX = event.clientX;
      pointerY = event.clientY;
      stage.setPointerCapture(event.pointerId);
      stage.dataset.dragging = "true";
      cancelAnimationFrame(frame);
      last = 0;
    };
    const pointerMove = (event: PointerEvent) => {
      if (event.pointerId !== pointerId || !globe) return;
      const sensitivity = (Math.PI * 2) / mount.clientWidth;
      const horizontalDirection = Math.cos(theta) < 0 ? -1 : 1;
      phi += (event.clientX - pointerX) * sensitivity * horizontalDirection;
      theta += (event.clientY - pointerY) * sensitivity;
      pointerX = event.clientX;
      pointerY = event.clientY;
      updateRotation();
    };
    const pointerUp = (event: PointerEvent) => {
      if (event.pointerId !== pointerId) return;
      pointerId = undefined;
      delete stage.dataset.dragging;
      if (stage.hasPointerCapture(event.pointerId))
        stage.releasePointerCapture(event.pointerId);
      resume();
    };
    const keyDown = (event: KeyboardEvent) => {
      if (
        !globe ||
        !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)
      )
        return;
      event.preventDefault();
      if (event.key === "ArrowUp" || event.key === "ArrowDown") {
        theta += event.key === "ArrowDown" ? 0.2 : -0.2;
      } else {
        phi +=
          (event.key === "ArrowRight" ? 0.2 : -0.2) *
          (Math.cos(theta) < 0 ? -1 : 1);
      }
      updateRotation();
    };
    stage.addEventListener("pointerdown", pointerDown);
    stage.addEventListener("pointermove", pointerMove);
    stage.addEventListener("pointerup", pointerUp);
    stage.addEventListener("pointercancel", pointerUp);
    stage.addEventListener("lostpointercapture", pointerUp);
    stage.addEventListener("keydown", keyDown);

    // Load the actual globe after hydration; the reserved space prevents layout shifts.
    import("cobe")
      .then(({ default: createGlobe }) => {
        if (disposed) return;
        try {
          const width = mount.clientWidth;
          const darkMode = isDarkMode();
          globe = createGlobe(canvas, {
            width,
            height: width,
            devicePixelRatio: pixelRatio,
            context,
            phi,
            theta,
            dark: darkMode ? 0.82 : 0,
            diffuse: 1.4,
            scale: 1,
            mapSamples: 26000,
            mapBrightness: darkMode ? 6.5 : 5.5,
            mapBaseBrightness: darkMode ? 0.08 : 0,
            baseColor: darkMode ? [0.18, 0.24, 0.34] : [0.76, 0.82, 0.91],
            markerColor: [0.14, 0.35, 0.92],
            glowColor: darkMode ? [0.08, 0.11, 0.16] : [0.975, 0.98, 0.985],
            opacity: 1,
            markerElevation,
            markers,
          });
          positionLabels();
          resize.observe(mount);
          visibility.observe(mount);
          resume();
        } catch {
          // Leave the decorative illustration hidden when graphics are unavailable.
          globe?.destroy();
          globe = undefined;
        }
      })
      .catch(() => {});
    reduced.addEventListener("change", resume);
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    document.addEventListener("visibilitychange", resume);
    canvas.addEventListener("webglcontextlost", contextLost);
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      resize.disconnect();
      visibility.disconnect();
      reduced.removeEventListener("change", resume);
      themeObserver.disconnect();
      document.removeEventListener("visibilitychange", resume);
      canvas.removeEventListener("webglcontextlost", contextLost);
      stage.removeEventListener("pointerdown", pointerDown);
      stage.removeEventListener("pointermove", pointerMove);
      stage.removeEventListener("pointerup", pointerUp);
      stage.removeEventListener("pointercancel", pointerUp);
      stage.removeEventListener("lostpointercapture", pointerUp);
      stage.removeEventListener("keydown", keyDown);
      delete stage.dataset.dragging;
      globe?.destroy();
      mount.replaceChildren();
    };
  }, []);

  return (
    <figure
      className="visitor-globe"
      data-ready={ready}
      aria-hidden={!ready}
      aria-label="Illustration of visitors around the world"
      data-markdown-skip
    >
      <div
        className="visitor-count"
        aria-label="Illustrative example: 128 visitors now"
      >
        <span className="dot" aria-hidden="true" />
        <span>Visitors now</span>
        <strong>128</strong>
      </div>
      <div
        className="globe-stage"
        data-ready={ready}
        tabIndex={ready ? 0 : undefined}
        role="img"
        aria-label={
          ready
            ? "Visitor globe. Drag in any direction or use the arrow keys to spin."
            : "Illustrative visitor globe"
        }
      >
        <div className="globe-skeleton" aria-hidden="true" />
        <div className="globe-canvas" ref={canvasRef} aria-hidden="true" />
        <div className="globe-locations" aria-hidden="true">
          {cities.map((city, index) => (
            <div
              className="visitor-anchor"
              key={city.name}
              ref={(element) => {
                labelsRef.current[index] = element;
              }}
            >
              <div className="visitor-location">
                <img
                  className="visitor-flag"
                  src={`/icons/circle-flags/${city.flag}.svg`}
                  alt={city.country}
                  width={16}
                  height={16}
                  draggable={false}
                />
                {city.name} <span className="visitor-path">{city.path}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </figure>
  );
}
