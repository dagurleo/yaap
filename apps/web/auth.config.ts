import { betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { drizzle } from "drizzle-orm/d1";
import { authOptions } from "./src/auth/options";

// Schema-only config: generation reads metadata and never accesses a database.
export const auth = betterAuth({
  ...authOptions,
  baseURL: "http://localhost:8790",
  database: drizzleAdapter(drizzle({} as D1Database), { provider: "sqlite", transaction: false }),
});
