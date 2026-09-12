import Bowser from "bowser";

// Keep only coarse categories. Raw IPs, user agents and coordinates never enter the queue.
export function visitorMetadata(request: Request) {
  const cf = request.cf as
    { country?: unknown; region?: unknown; city?: unknown } | undefined;
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(
    new URL(request.url).hostname,
  );
  const place = (value: unknown) =>
    typeof value === "string" &&
    value.trim() &&
    value.length <= 120 &&
    !/[\u0000-\u001f\u007f]/.test(value)
      ? value.trim()
      : null;
  const country =
    !local &&
    typeof cf?.country === "string" &&
    /^[A-Z]{2}$/.test(cf.country) &&
    !["XX", "T1"].includes(cf.country)
      ? cf.country
      : null;
  const ua = (request.headers.get("user-agent") ?? "").slice(0, 2048);
  const parsed = ua ? Bowser.parse(ua) : null;
  const type = parsed?.platform.type;
  return {
    country,
    region: country ? place(cf?.region) : null,
    city: country ? place(cf?.city) : null,
    browser: parsed?.browser.name || null,
    os: parsed?.os.name || null,
    device:
      type === "mobile"
        ? "Mobile"
        : type === "tablet"
          ? "Tablet"
          : type === "desktop"
            ? "Desktop"
            : type === "tv"
              ? "TV"
              : null,
  };
}
