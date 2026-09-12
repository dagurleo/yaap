import { useEffect, useState } from "react";
import { CircleHelp, Globe2, Megaphone, MousePointer2 } from "lucide-react";
import { cn } from "@/lib/utils";

const localLogos: Record<string, string> = {
  bing: "bing",
  "bing.com": "bing",
  duckduckgo: "duckduckgo",
  "duckduckgo.com": "duckduckgo",
  facebook: "facebook",
  "facebook.com": "facebook",
  github: "github-icon",
  "github.com": "github-icon",
  google: "google-icon",
  "google.com": "google-icon",
  instagram: "instagram-icon",
  "instagram.com": "instagram-icon",
  linkedin: "linkedin-icon",
  "linkedin.com": "linkedin-icon",
  mailchimp: "mailchimp-icon",
  "mailchimp.com": "mailchimp-icon",
  producthunt: "producthunt",
  "producthunt.com": "producthunt",
  reddit: "reddit-icon",
  "reddit.com": "reddit-icon",
  tiktok: "tiktok-icon",
  "tiktok.com": "tiktok-icon",
  twitter: "twitter",
  "twitter.com": "twitter",
  x: "twitter",
  "x.com": "twitter",
  ycombinator: "ycombinator",
  "ycombinator.com": "ycombinator",
  "news.ycombinator.com": "ycombinator",
  youtube: "youtube-icon",
  "youtube.com": "youtube-icon",
};

type SourceKind = "source" | "referrer" | "campaign";

function sourceParts(value: string, kind: SourceKind) {
  if (kind === "source") {
    if (value.startsWith("Referral · "))
      return { kind: "referrer" as const, value: value.slice(11) };
    if (value.startsWith("Campaign · "))
      return { kind: "campaign" as const, value: value.slice(11) };
  }
  return { kind, value };
}

function normalized(value: string) {
  return value.toLowerCase().trim().replace(/^www\./, "");
}

function logoFor(value: string) {
  const key = normalized(value);
  return localLogos[key] ?? localLogos[key.split(/[._-]/)[0]];
}

function validHost(value: string) {
  return /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i.test(
    value,
  );
}

export function TrafficSourceIcon({
  value,
  kind = "source",
  className,
}: {
  value: string | null | undefined;
  kind?: SourceKind;
  className?: string;
}) {
  const parts = sourceParts(value ?? "", kind);
  const host = normalized(parts.value);
  const local = logoFor(host);
  const remote = parts.kind === "referrer" && validHost(host);
  const src = local
    ? `/icons/logos/${local}.svg`
    : remote
      ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=32`
      : null;
  const [failed, setFailed] = useState(false);

  useEffect(() => setFailed(false), [src]);

  if (src && !failed)
    if (local === "github-icon")
      return (
        <span className={cn("inline-flex size-4 shrink-0", className)}>
          <img
            src={src}
            alt=""
            width="16"
            height="16"
            loading="lazy"
            className="size-4 shrink-0 dark:hidden"
            onError={() => setFailed(true)}
          />
          <img
            src="/icons/logos/github-icon-dark.svg"
            alt=""
            width="16"
            height="16"
            loading="lazy"
            className="size-4 shrink-0 not-dark:hidden"
            onError={() => setFailed(true)}
          />
        </span>
      );
  if (src && !failed)
    return (
      <img
        src={src}
        alt=""
        width="16"
        height="16"
        loading="lazy"
        referrerPolicy="no-referrer"
        className={cn("size-4 shrink-0 rounded-sm", className)}
        onError={() => setFailed(true)}
      />
    );

  const Icon =
    value === "Not recorded"
      ? CircleHelp
      : parts.kind === "campaign"
        ? Megaphone
        : parts.kind === "referrer"
          ? Globe2
          : MousePointer2;
  return (
    <Icon
      aria-hidden="true"
      className={cn("size-4 shrink-0 stroke-muted-foreground", className)}
    />
  );
}
