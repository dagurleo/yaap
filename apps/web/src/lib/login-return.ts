/** Only resume the local OAuth authorization route; never redirect to user URLs. */
export function loginReturn(value: unknown): string | undefined {
  if (
    typeof value !== "string" ||
    value.length > 12000 ||
    !value.startsWith("/oauth/authorize?")
  )
    return;
  const url = new URL(value, "https://yaap.invalid");
  if (
    url.origin === "https://yaap.invalid" &&
    url.pathname === "/oauth/authorize"
  )
    return url.pathname + url.search;
}
