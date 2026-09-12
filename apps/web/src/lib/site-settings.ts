import { HttpError, requiredString } from "../http";

export function validateSiteDetails(body: Record<string, unknown>) {
  const name = requiredString(body, "name", 120).trim();
  if (!name) throw new HttpError(400, "Enter a website name");
  const rawOrigin = requiredString(body, "origin", 512);
  let siteUrl: URL;
  try {
    siteUrl = new URL(rawOrigin);
  } catch {
    throw new HttpError(400, "Enter a valid website origin");
  }
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(siteUrl.hostname);
  if (
    siteUrl.username ||
    siteUrl.password ||
    siteUrl.search ||
    siteUrl.hash ||
    siteUrl.pathname !== "/" ||
    (siteUrl.protocol !== "https:" && !(local && siteUrl.protocol === "http:"))
  ) {
    throw new HttpError(
      400,
      "Use an HTTPS origin without a path (HTTP allowed for localhost)",
    );
  }
  return { name, origin: siteUrl.origin };
}

export type TrackingRules = {
  additionalOrigins: string[];
  allowAllDomains: boolean;
  excludedPaths: string[];
  excludedHostnames: string[];
};
export const defaultTrackingRules: TrackingRules = {
  additionalOrigins: [],
  allowAllDomains: false,
  excludedPaths: [],
  excludedHostnames: [],
};
export function validateTrackingRules(input: unknown): TrackingRules {
  if (!input || typeof input !== "object")
    throw new HttpError(400, "Invalid tracking rules");
  const rules = input as TrackingRules;
  const list = (value: unknown, label: string): string[] => {
    if (
      !Array.isArray(value) ||
      value.length > 50 ||
      value.some((v) => typeof v !== "string" || !v.trim() || v.length > 512)
    )
      throw new HttpError(400, `Enter up to 50 valid ${label}`);
    return [...new Set(value.map((v) => v.trim()))];
  };
  if (typeof rules.allowAllDomains !== "boolean")
    throw new HttpError(400, "Invalid domain setting");
  const additionalOrigins = list(rules.additionalOrigins, "origins").map(
    (origin) => validateSiteDetails({ name: "Website", origin }).origin,
  );
  const excludedPaths = list(rules.excludedPaths, "paths");
  if (
    excludedPaths.some(
      (path) =>
        !path.startsWith("/") || path.startsWith("//") || /[?#\s]/.test(path),
    )
  )
    throw new HttpError(
      400,
      "Paths must start with / and contain no spaces, query strings, or fragments",
    );
  const excludedHostnames = list(rules.excludedHostnames, "hostnames").map(
    (host) => host.toLowerCase(),
  );
  if (
    excludedHostnames.some(
      (host) =>
        !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/.test(
          host,
        ) || host.length > 253,
    )
  )
    throw new HttpError(
      400,
      "Enter hostnames without protocols, paths, ports, or wildcards",
    );
  return {
    additionalOrigins: [...new Set(additionalOrigins)],
    allowAllDomains: rules.allowAllDomains,
    excludedPaths,
    excludedHostnames,
  };
}
export function allowedTrackingOrigin(
  origin: string | null,
  primary: string,
  rules: TrackingRules,
): origin is string {
  if (!origin || origin === "null") return false;
  try {
    const url = new URL(origin);
    if (url.origin !== origin || !["http:", "https:"].includes(url.protocol))
      return false;
    return (
      rules.allowAllDomains ||
      origin === primary ||
      rules.additionalOrigins.includes(origin)
    );
  } catch {
    return false;
  }
}
// Match literal path segments with * as the only wildcard, without compiling user input to regex.
export function matchesPath(path: string, pattern: string) {
  const parts = pattern.split("*");
  if (parts.length === 1) return path === pattern;
  if (!path.startsWith(parts[0])) return false;
  let offset = parts[0].length;
  for (const part of parts.slice(1, -1)) {
    const index = path.indexOf(part, offset);
    if (index < 0) return false;
    offset = index + part.length;
  }
  const tail = parts[parts.length - 1];
  return path.endsWith(tail) && path.length - tail.length >= offset;
}
export function excludedByTrackingRules(
  origin: string,
  path: string,
  rules: TrackingRules,
) {
  return (
    rules.excludedHostnames.includes(new URL(origin).hostname) ||
    rules.excludedPaths.some((pattern) =>
      matchesPath(path.split(/[?#]/)[0], pattern),
    )
  );
}
