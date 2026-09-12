import { betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { authDatabase } from "../db";
import type { Env } from "../types";
import { authOptions } from "./options";
import { createDb } from "../db";
import { normalizeEmail } from "../lib/email";
import { sendEmail } from "../server/email";
import { billingConfig } from "../server/billing/config";
import { activateHostedTrialForVerifiedOwner } from "../server/billing/trial";

export type RegistrationContext =
  | { kind: "owner" }
  | { kind: "invitation"; email: string }
  | { kind: "hosted" };

export function createAuth(
  env: Env,
  origin: string,
  registration?: RegistrationContext,
) {
  if (!env.BETTER_AUTH_SECRET || env.BETTER_AUTH_SECRET.length < 32) {
    throw new Error("BETTER_AUTH_SECRET must contain at least 32 characters");
  }
  const { db, schema, provider, transaction } = authDatabase(env);
  const hosting = billingConfig(env);
  return betterAuth({
    ...authOptions,
    // Bindings are request-scoped. Never cache this instance across installations.
    database: drizzleAdapter(db, { provider, schema, transaction }),
    secret: env.BETTER_AUTH_SECRET,
    baseURL: origin,
    trustedOrigins: [origin],
    emailAndPassword: {
      ...authOptions.emailAndPassword,
      disableSignUp: !registration,
      requireEmailVerification: hosting.mode === "hosted",
      revokeSessionsOnPasswordReset: true,
      resetPasswordTokenExpiresIn: 60 * 60,
      sendResetPassword: async ({ user, url }) => {
        await sendEmail(env, {
          to: user.email,
          subject: "Reset your Yaap password",
          text: `Reset your password:\n\n${url}\n\nThis link expires in one hour. If you did not request this, you can ignore this email.`,
        });
      },
    },
    emailVerification: {
      expiresIn: 60 * 60,
      sendOnSignUp: hosting.mode === "hosted",
      autoSignInAfterVerification: true,
      sendVerificationEmail: async ({ user, url }) => {
        await sendEmail(env, {
          to: user.email,
          subject: "Verify your Yaap email",
          text: `Verify your email address to continue:\n\n${url}\n\nThis link expires in one hour.`,
        });
      },
      afterEmailVerification: async (user) => {
        await activateHostedTrialForVerifiedOwner(env, user.id);
      },
    },
    databaseHooks: registration
      ? {
          user: {
            create: {
              before: async (user) => {
                if (
                  registration.kind === "invitation" &&
                  normalizeEmail(user.email) !==
                    normalizeEmail(registration.email)
                )
                  return false;
                return registration.kind === "invitation"
                  ? { data: { ...user, emailVerified: true } }
                  : undefined;
              },
              after: async (user) => {
                if (
                  registration.kind === "owner" ||
                  registration.kind === "hosted"
                )
                  await createDb(env).createWorkspace(user.id);
              },
            },
          },
        }
      : undefined,
    advanced: {
      ...authOptions.advanced,
      useSecureCookies: origin.startsWith("https:"),
    },
    logger: { disabled: true },
  });
}
