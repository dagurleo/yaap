import { z } from "zod";

const email = z.string().trim().email().max(254);

/** Match Better Auth's case-insensitive email identity without provider tricks. */
export function normalizeEmail(value: string) {
  return email.parse(value).toLowerCase();
}
