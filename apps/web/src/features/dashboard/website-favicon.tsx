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
  const [loadedSource, setLoadedSource] = useState<string | null>(null);
  const src = sources[sourceIndex];
  const loaded = src !== undefined && loadedSource === src;

  useEffect(() => {
    setSourceIndex(0);
    setLoadedSource(null);
  }, [origin]);

  return (
    <span
      className={cn(
        "relative grid shrink-0 place-items-center overflow-hidden bg-control outline-1 -outline-offset-1 outline-border",
        sizes[size],
        className,
      )}
      aria-hidden="true"
    >
      {!loaded && <Globe2 className="size-4 stroke-muted-foreground" />}
      {src && (
        <img
          key={src}
          ref={(image) => {
            if (!image?.complete) return;
            if (image.naturalWidth > 0) setLoadedSource(src);
            else
              setSourceIndex((index) =>
                sources[index] === src ? index + 1 : index,
              );
          }}
          src={src}
          alt=""
          width="64"
          height="64"
          loading="lazy"
          referrerPolicy="no-referrer"
          className={cn(
            "absolute inset-0 size-full object-contain",
            loaded ? "opacity-100" : "opacity-0",
          )}
          onLoad={() => setLoadedSource(src)}
          onError={() => {
            setLoadedSource(null);
            setSourceIndex((index) =>
              sources[index] === src ? index + 1 : index,
            );
          }}
        />
      )}
    </span>
  );
}
