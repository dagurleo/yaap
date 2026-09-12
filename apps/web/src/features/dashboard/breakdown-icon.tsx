import {
  Globe,
  Monitor,
  Smartphone,
  Tablet,
  Tv,
  CircleHelp,
  AppWindow,
} from "lucide-react";
import { countryFlags } from "./country-flags";

type Kind = "country" | "browser" | "os" | "device";
const browserLogos: Record<string, string> = {
  chrome: "chrome",
  "chrome mobile": "chrome",
  "chrome webview": "chrome",
  chromium: "chrome",
  firefox: "firefox",
  safari: "safari",
  "microsoft edge": "microsoft-edge",
  edge: "microsoft-edge",
  opera: "opera",
  "opera touch": "opera",
  brave: "brave",
  vivaldi: "vivaldi-icon",
};
const osLogos: Record<string, string> = {
  windows: "microsoft-windows-icon",
  "windows phone": "microsoft-windows-icon",
  macos: "apple",
  "mac os": "apple",
  ios: "apple",
  ipados: "apple",
  android: "android-icon",
  linux: "linux-tux",
  ubuntu: "ubuntu",
  "chrome os": "chrome",
};

export function BreakdownIcon({
  kind,
  value,
}: {
  kind: Kind;
  value: string | null;
}) {
  const normalized = value?.toLowerCase() ?? "";
  const logo =
    kind === "browser"
      ? browserLogos[normalized]
      : kind === "os"
        ? osLogos[normalized]
        : undefined;
  const src =
    kind === "country" && countryFlags.has(normalized)
      ? `/icons/circle-flags/${normalized}.svg`
      : logo
        ? `/icons/logos/${logo}.svg`
        : null;
  const Fallback =
    kind === "country" || kind === "browser"
      ? Globe
      : kind === "os"
        ? AppWindow
        : normalized === "mobile"
          ? Smartphone
          : normalized === "tablet"
            ? Tablet
            : normalized === "desktop"
              ? Monitor
              : normalized === "tv"
                ? Tv
                : CircleHelp;
  return (
    <span
      aria-hidden="true"
      className="flex size-5 shrink-0 items-center justify-center"
    >
      {src ? (
        <>
          {logo === "apple" && (
            <img
              src="/icons/logos/apple-dark.svg"
              alt=""
              width={18}
              height={18}
              className="hidden size-[18px] object-contain dark:block"
            />
          )}
          <img
            src={src}
            alt=""
            width={18}
            height={18}
            className={`size-[18px] object-contain ${logo === "apple" ? "dark:hidden" : ""}`}
          />
        </>
      ) : (
        <Fallback className="size-4 text-muted-foreground" strokeWidth={1.75} />
      )}
    </span>
  );
}
