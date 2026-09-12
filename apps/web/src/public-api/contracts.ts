import {
  createHash,
  createHmac,
  timingSafeEqual,
  randomBytes,
} from "node:crypto";
import { HttpError } from "../http";
import {
  dimensionKeys,
  reportFilters,
  reportPeriod,
} from "../lib/report-filters";
import type { Env } from "../types";

export { scopes, type Scope } from "../lib/api-access";
export type Input = Record<string, unknown>;
export class ApiError extends HttpError {
  constructor(
    status: number,
    public code: string,
    message: string,
  ) {
    super(status, message);
  }
}
export function invalid(message: string): never {
  throw new ApiError(400, "invalid_argument", message);
}
export function fields(input: Input, allowed: readonly string[]) {
  for (const key of Object.keys(input))
    if (!allowed.includes(key)) invalid(`Unsupported field: ${key}`);
}
export function str(input: Input, key: string, max = 128) {
  const value = input[key];
  if (
    typeof value !== "string" ||
    !value.trim().length ||
    value.length > max ||
    /[\x00-\x1f\x7f]/.test(value)
  )
    invalid(`Invalid ${key}`);
  return value;
}
export function choice<T extends string>(
  value: unknown,
  values: readonly T[],
  fallback?: T,
): T {
  if (value === undefined && fallback !== undefined) return fallback;
  if (typeof value !== "string" || !values.includes(value as T))
    invalid(`Choose ${values.join(", ")}`);
  return value as T;
}
export function integer(value: unknown, fallback: number, max: number) {
  if (value === undefined) return fallback;
  if (
    (typeof value !== "number" && typeof value !== "string") ||
    value === "" ||
    !Number.isSafeInteger(Number(value)) ||
    Number(value) < 1 ||
    Number(value) > max
  )
    invalid(`Choose an integer from 1 to ${max}`);
  return Number(value);
}
export const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export const secret = (prefix: string) =>
  prefix + Buffer.from(randomBytes(32)).toString("base64url");
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
      .join(",")}}`;
  return JSON.stringify(value);
}
export async function crypt(
  env: Env,
  context: string,
  value: string,
  decrypt = false,
) {
  const key = await crypto.subtle.importKey(
    "raw",
    Buffer.from(hash(`yaap:api:v1:${env.BETTER_AUTH_SECRET}`), "hex"),
    "AES-GCM",
    false,
    ["encrypt", "decrypt"],
  );
  if (decrypt) {
    const [iv, body] = value.split(".");
    return new TextDecoder().decode(
      await crypto.subtle.decrypt(
        {
          name: "AES-GCM",
          iv: Buffer.from(iv, "base64url"),
          additionalData: new TextEncoder().encode(context),
        },
        key,
        Buffer.from(body, "base64url"),
      ),
    );
  }
  const iv = randomBytes(12);
  const body = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: new TextEncoder().encode(context) },
    key,
    new TextEncoder().encode(value),
  );
  return `${Buffer.from(iv).toString("base64url")}.${Buffer.from(body).toString("base64url")}`;
}
export function cursorCodec(env: Env, binding: unknown, input: Input) {
  const query = { ...input };
  delete query.cursor;
  const fingerprint = hash(canonical([binding, query]));
  const sign = (s: string) =>
    createHmac("sha256", env.BETTER_AUTH_SECRET)
      .update(`cursor:${s}`)
      .digest("base64url");
  let state: { asOf: number; last?: (string | number)[] } = {
    asOf: Date.now(),
  };
  if (input.cursor !== undefined) {
    try {
      const [body, signature] = str(input, "cursor", 4096).split(".");
      const expected = Buffer.from(sign(body)),
        received = Buffer.from(signature ?? "");
      if (
        received.length !== expected.length ||
        !timingSafeEqual(received, expected)
      )
        throw new Error();
      const parsed = JSON.parse(Buffer.from(body, "base64url").toString());
      if (
        parsed.fingerprint !== fingerprint ||
        !Number.isSafeInteger(parsed.asOf) ||
        parsed.asOf > Date.now() ||
        parsed.asOf < Date.now() - 86400000 ||
        !Array.isArray(parsed.last) ||
        parsed.last.some(
          (v: unknown) => !["string", "number"].includes(typeof v),
        )
      )
        throw new Error();
      state = parsed;
    } catch {
      invalid("Invalid, expired, or mismatched cursor");
    }
  }
  return {
    ...state,
    next(last: (string | number)[]) {
      const body = Buffer.from(
        JSON.stringify({ ...state, fingerprint, last }),
      ).toString("base64url");
      return `${body}.${sign(body)}`;
    },
  };
}
export const dateFields = [
  "from",
  "to",
  "compare",
  ...dimensionKeys,
  "unknown",
];
export function dates(
  input: Input,
  asOf = Date.now(),
  comparison = true,
  timezone = "UTC",
) {
  str(input, "from", 10);
  str(input, "to", 10);
  if (
    input.compare !== undefined &&
    (!comparison || input.compare !== "previous_period")
  )
    invalid("This report does not support that comparison");
  const raw: Input = {};
  for (const key of dimensionKeys)
    if (input[key] !== undefined) {
      if (input[key] === "__unknown__" || input[key] === "")
        invalid(`Use unknown=${key} for unknown values`);
      raw[key] = input[key];
    }
  if (input.unknown !== undefined) {
    const unknown = Array.isArray(input.unknown)
      ? input.unknown
      : str(input, "unknown", 256).split(",");
    for (const key of unknown) {
      if (
        !dimensionKeys.includes(key as never) ||
        raw[key as string] !== undefined
      )
        invalid("Invalid or conflicting unknown dimension");
      raw[key as string] = "__unknown__";
    }
  }
  const filters = reportFilters({
    ...raw,
    from: input.from,
    to: input.to,
    compare: input.compare === "previous_period",
  });
  filters.timezone = timezone;
  return { filters, ...reportPeriod(filters, asOf) };
}
export type Result = {
  data: unknown;
  meta?: Input;
  pagination?: { nextCursor: string | null };
  status?: number;
  etag?: string;
};
export function page<T>(
  rows: T[],
  limit: number,
  next: (row: T) => string,
): Result {
  return {
    data: rows.slice(0, limit),
    pagination: {
      nextCursor: rows.length > limit ? next(rows[limit - 1]) : null,
    },
  };
}
export function errorResult(error: unknown, requestId: string) {
  const status = error instanceof HttpError ? error.status : 503;
  const codes: Record<number, string> = {
    400: "invalid_argument",
    401: "unauthorized",
    403: "forbidden",
    404: "not_found",
    405: "method_not_allowed",
    409: "conflict",
    412: "revision_conflict",
    413: "payload_too_large",
    415: "unsupported_media_type",
    428: "precondition_required",
    429: "rate_limited",
    503: "temporarily_unavailable",
  };
  return {
    status,
    body: {
      error: {
        code:
          error instanceof ApiError
            ? error.code
            : (codes[status] ?? "request_failed"),
        message:
          error instanceof HttpError
            ? error.message
            : "Request could not complete. Retry later or check installation health.",
        requestId,
      },
    },
  };
}
