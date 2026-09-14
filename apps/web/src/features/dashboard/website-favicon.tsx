import { useEffect, useState } from "react";
import { Globe2 } from "lucide-react";
import { cn } from "@/lib/utils";

const sizes = {
  sm: "size-5 rounded-sm p-0.5",
  md: "size-7 rounded-md p-1",
};

function faviconUrls(origin: string) {
  try {
    const host = new URL(origin).hostname;
    return [
      new URL("/favicon.ico", origin).toString(),
      `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`,
    ];
  } catch {
    return [];
  }
}

export function WebsiteFavicon({
  origin,
  size = "sm",
  className,
}: {
  origin: string;
  size?: keyof typeof sizes;
  className?: string;
}) {
  const sources = faviconUrls(origin);
  const [sourceIndex, setSourceIndex] = useState(0);
  const src = sources[sourceIndex];

  useEffect(() => setSourceIndex(0), [origin]);

  return (
    <span
      className={cn(
        "grid shrink-0 place-items-center overflow-hidden bg-control outline-1 -outline-offset-1 outline-border",
        sizes[size],
        className,
      )}
      aria-hidden="true"
    >
      {src ? (
        <img
          src={src}
          alt=""
          width="64"
          height="64"
          loading="lazy"
          referrerPolicy="no-referrer"
          className="size-full object-contain"
          onError={() => setSourceIndex((index) => index + 1)}
        />
      ) : (
        <Globe2 className="size-4 stroke-muted-foreground" />
      )}
    </span>
  );
}
