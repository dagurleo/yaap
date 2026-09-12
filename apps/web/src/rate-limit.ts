import { createHash } from "node:crypto";
import { createDb } from "./db";
import { HttpError } from "./http";
import type { Env } from "./types";

export async function limitRequest(
  request: Request,
  env: Env,
  scope: string,
  max: number,
) {
  const now = Date.now();
  const window = Math.floor(now / 60000);
  const identity = request.headers.get("cf-connecting-ip") ?? "local";
  const key = createHash("sha256")
    .update(`${env.BETTER_AUTH_SECRET}:${scope}:${identity}:${window}`)
    .digest("hex");
  const count = await createDb(env).incrementRateLimit(
    key,
    (window + 1) * 60000,
  );
  if (count > max)
    throw new HttpError(429, "Too many requests. Try again in a minute.");
}
