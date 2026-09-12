/** Resume only auth journeys owned by this application; never redirect to user URLs. */
export function loginReturn(value: unknown): string | undefined {
  if (
    typeof value !== "string" ||
    value.length > 12000 ||
    value.includes("\\") ||
    value.includes("\0")
  )
    return;
  let url: URL;
  try {
    url = new URL(value, "https://yaap.invalid");
  } catch {
    return;
  }
  if (url.origin !== "https://yaap.invalid" || url.hash) return;
  if (url.pathname === "/oauth/authorize" && url.search)
    return url.pathname + url.search;
  if (/^\/invite\/[A-Za-z0-9_-]{43}$/.test(url.pathname) && !url.search)
    return url.pathname;
}
