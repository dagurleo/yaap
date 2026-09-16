import { z } from "zod";
import type { Env } from "../types";

type EmailEnv = Pick<Env, "EMAIL" | "EMAIL_FROM" | "EMAIL_REPLY_TO">;

const address = z.string().trim().email();
const messageSchema = z.object({
  to: address,
  subject: z
    .string()
    .trim()
    .min(1)
    .max(998)
    .regex(/^[^\r\n]+$/),
  text: z
    .string()
    .min(1)
    .refine((value) => value.trim().length > 0),
  html: z.string().min(1).optional(),
});

export type OutboundEmail = z.input<typeof messageSchema>;

/** One recipient per message keeps future report recipients private. */
export async function sendEmail(
  env: EmailEnv,
  message: OutboundEmail,
): Promise<EmailSendResult> {
  try {
    return await deliverEmail(env, message);
  } catch (error) {
    // Better Auth catches some email failures. Log here without recipients,
    // message bodies, or reset/verification tokens.
    const code =
      error && typeof error === "object" && "code" in error
        ? String(error.code)
        : "E_EMAIL_SEND_FAILED";
    console.error("Outbound email failed", {
      code: /^E_[A-Z0-9_]+$/.test(code) ? code : "E_EMAIL_SEND_FAILED",
      bindingConfigured: !!env.EMAIL,
      senderConfigured: !!env.EMAIL_FROM?.trim(),
    });
    throw error;
  }
}

async function deliverEmail(
  env: EmailEnv,
  message: OutboundEmail,
): Promise<EmailSendResult> {
  if (!env.EMAIL || !env.EMAIL_FROM?.trim()) {
    throw new Error("Email sending requires the EMAIL binding and EMAIL_FROM.");
  }
  const from = address.parse(env.EMAIL_FROM);
  const replyTo = env.EMAIL_REPLY_TO?.trim()
    ? address.parse(env.EMAIL_REPLY_TO)
    : undefined;
  const content = messageSchema.parse(message);

  // Let callers handle provider errors (including suppression and rate limits).
  // Do not retry here: an ambiguous failure may already have accepted the email.
  return env.EMAIL.send({
    ...content,
    from: { email: from, name: "Yaap" },
    ...(replyTo ? { replyTo } : {}),
  });
}
