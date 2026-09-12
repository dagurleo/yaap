import type { BetterAuthOptions } from "better-auth";

// Shared with schema generation so auth tables reflect runtime configuration.
export const authOptions = {
  appName: "OS Analytics",
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
    minPasswordLength: 12,
    maxPasswordLength: 128,
    requireEmailVerification: false,
  },
  session: { expiresIn: 60 * 60 * 24 * 7, updateAge: 60 * 60 * 24 },
  rateLimit: { enabled: true, storage: "database", window: 60, max: 20 },
  advanced: {
    cookiePrefix: "os-analytics",
    ipAddress: { ipAddressHeaders: ["cf-connecting-ip"] },
  },
} satisfies BetterAuthOptions;
