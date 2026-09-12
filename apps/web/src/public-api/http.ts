import { outputFor } from "./outputs";
import { readJson, json } from "../http";
import { appOrigin } from "../server/services";
import type { Env } from "../types";
import { authenticate } from "./auth";
import { operations, openapi } from "./registry";
import { execute, envelope } from "./service";
import { ApiError, errorResult, type Input } from "./contracts";

export async function publicApi(request: Request, env: Env): Promise<Response> {
  const requestId = crypto.randomUUID();
  try {
    const url = new URL(request.url),
      origin = appOrigin(request, env),
      path = url.pathname.slice("/api/v1".length);
    if (path === "/openapi.json" && request.method === "GET")
      return json(openapi(origin));
    const matches = operations
      .map((op) => ({
        op,
        match: path.match(
          new RegExp("^" + op.path.replace(/\{\w+\}/g, "([^/]+)") + "$"),
        ),
      }))
      .filter((x) => x.match);
    if (!matches.length)
      throw new ApiError(404, "not_found", "Endpoint not found");
    const found = matches.find((x) => x.op.method === request.method);
    if (!found)
      throw new ApiError(405, "method_not_allowed", "Method not allowed");
    const { op, match } = found,
      principal = await authenticate(request, env, !!op.sessionOnly);
    if (op.sessionOnly && principal.kind !== "session")
      throw new ApiError(
        403,
        "owner_session_required",
        "Use an owner session for credential administration",
      );
    let input: Input = {};
    if (request.method === "GET") {
      for (const [key, value] of url.searchParams) {
        if (key in input)
          throw new ApiError(
            400,
            "invalid_argument",
            `Duplicate query parameter: ${key}`,
          );
        input[key] = value;
      }
      if (input.propertyValue !== undefined) {
        try {
          input.propertyValue = JSON.parse(String(input.propertyValue));
        } catch {
          throw new ApiError(
            400,
            "invalid_argument",
            "propertyValue must be a JSON scalar, including quotes for strings",
          );
        }
      }
    } else {
      if (url.search)
        throw new ApiError(
          400,
          "invalid_argument",
          "Mutation query parameters are not supported",
        );
      if (request.body && request.headers.has("content-type"))
        input = await readJson(request, 16384);
      else if (request.body) {
        const reader = request.body.getReader();
        while (true) {
          const part = await reader.read();
          if (part.done) break;
          if (part.value.length) {
            await reader.cancel();
            throw new ApiError(
              415,
              "unsupported_media_type",
              "Send application/json",
            );
          }
        }
      }
    }
    for (const [i, param] of [...op.path.matchAll(/\{(\w+)\}/g)].entries()) {
      if (param[1] in input)
        throw new ApiError(
          400,
          "invalid_argument",
          `Do not duplicate path parameter ${param[1]}`,
        );
      try {
        input[param[1]] = decodeURIComponent(match![i + 1]);
      } catch {
        throw new ApiError(400, "invalid_argument", "Invalid encoded path");
      }
    }
    const result = await execute(
      op,
      {
        env,
        principal,
        operation: op.name,
        input,
        idempotencyKey: request.headers.get("idempotency-key") ?? undefined,
        ifMatch: request.headers.get("if-match") ?? undefined,
      },
      origin,
    );
    return json(
      outputFor(op.name).parse(envelope(result, requestId)),
      result.status ?? 200,
      {
        "X-Request-Id": requestId,
        ...(result.etag ? { ETag: `"${result.etag}"` } : {}),
      },
    );
  } catch (error) {
    const result = errorResult(error, requestId);
    return json(result.body, result.status, {
      "X-Request-Id": requestId,
      ...(result.status === 401 ? { "WWW-Authenticate": "Bearer" } : {}),
      ...(result.status === 429 ? { "Retry-After": "60" } : {}),
    });
  }
}
