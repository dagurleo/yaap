import type { ReactElement } from "react";
import { render, toPlainText } from "react-email";
import { sendEmail, type OutboundEmail } from "./email";
import type { Env } from "../types";

/** Render once so the HTML and plain-text alternatives contain the same data. */
export async function renderEmail(template: ReactElement) {
  const html = await render(template);
  return { html, text: toPlainText(html) };
}

export async function sendTemplateEmail(
  env: Pick<Env, "EMAIL" | "EMAIL_FROM" | "EMAIL_REPLY_TO">,
  message: Pick<OutboundEmail, "to" | "subject"> & { template: ReactElement },
): Promise<EmailSendResult> {
  const content = await renderEmail(message.template);
  return sendEmail(env, {
    to: message.to,
    subject: message.subject,
    ...content,
  });
}
