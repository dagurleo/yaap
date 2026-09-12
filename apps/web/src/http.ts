export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export function json(value: unknown, status = 200, headers: HeadersInit = {}) {
  const responseHeaders = new Headers(headers);
  if (!responseHeaders.has("Cache-Control"))
    responseHeaders.set("Cache-Control", "no-store");
  return Response.json(value, { status, headers: responseHeaders });
}

/** Read bytes before decoding so chunked and multibyte bodies share one limit. */
export async function readBody(
  request: Request,
  limit: number,
): Promise<Uint8Array> {
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, "A request body is required");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > limit) {
        await reader.cancel();
        throw new HttpError(413, "Request is too large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}

export function mediaType(request: Request) {
  return request.headers
    .get("content-type")
    ?.split(";", 1)[0]
    .trim()
    .toLowerCase();
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function decodePathParam(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    throw new HttpError(400, "Invalid encoded path");
  }
}

export async function readJson(
  request: Request,
  limit = 4096,
): Promise<Record<string, unknown>> {
  if (mediaType(request) !== "application/json") {
    throw new HttpError(415, "Send application/json");
  }
  const bytes = await readBody(request, limit);
  try {
    const value = JSON.parse(new TextDecoder().decode(bytes));
    if (!isRecord(value)) throw new Error();
    return value;
  } catch {
    throw new HttpError(400, "Invalid JSON object");
  }
}

export function requiredString(body: unknown, key: string, max: number) {
  if (!isRecord(body)) throw new HttpError(400, "Invalid request object");
  const value = body[key];
  if (typeof value !== "string" || !value.trim() || value.length > max) {
    throw new HttpError(400, `Invalid ${key}`);
  }
  return value;
}
