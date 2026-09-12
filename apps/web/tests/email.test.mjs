import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";

const output = await build({
  entryPoints: ["src/server/email.ts"],
  bundle: true,
  write: false,
  format: "esm",
  platform: "node",
});
const { sendEmail } = await import(
  "data:text/javascript;base64," +
    Buffer.from(output.outputFiles[0].text).toString("base64")
);
const message = {
  to: "reader@example.com",
  subject: "Your report",
  text: "Your report is ready.",
};
function fixture(overrides = {}) {
  const sent = [];
  return {
    sent,
    env: {
      EMAIL: {
        async send(value) {
          sent.push(value);
          return { messageId: "test-message" };
        },
      },
      EMAIL_FROM: " reports@example.com ",
      ...overrides,
    },
  };
}

test("sends text and HTML with configured sender and reply-to", async () => {
  const { env, sent } = fixture({ EMAIL_REPLY_TO: " support@example.com " });
  const content = { ...message, html: "<p>Your report is ready.</p>" };
  assert.deepEqual(await sendEmail(env, content), {
    messageId: "test-message",
  });
  assert.deepEqual(sent, [
    {
      ...content,
      from: { email: "reports@example.com", name: "Yaap" },
      replyTo: "support@example.com",
    },
  ]);
});

test("supports text-only mail and cannot override sender or add recipients", async () => {
  const { env, sent } = fixture();
  await sendEmail(env, {
    ...message,
    from: "other@example.com",
    cc: "other@example.com",
  });
  assert.deepEqual(sent, [
    { ...message, from: { email: "reports@example.com", name: "Yaap" } },
  ]);
});

test("missing or invalid configuration fails before sending", async () => {
  for (const config of [
    { EMAIL: undefined },
    { EMAIL_FROM: undefined },
    { EMAIL_FROM: " " },
    { EMAIL_FROM: "invalid" },
    { EMAIL_REPLY_TO: "invalid" },
  ]) {
    const { env, sent } = fixture(config);
    await assert.rejects(sendEmail(env, message));
    assert.equal(sent.length, 0);
  }
});

test("rejects invalid recipients, header injection, and empty content", async () => {
  for (const invalid of [
    { to: "invalid" },
    { to: ["first@example.com", "second@example.com"] },
    { to: "a@example.com\r\nBcc: other@example.com" },
    { subject: " " },
    { subject: "Report\r\nBcc: other@example.com" },
    { text: " " },
    { text: undefined },
    { html: "" },
  ]) {
    const { env, sent } = fixture();
    await assert.rejects(sendEmail(env, { ...message, ...invalid }));
    assert.equal(sent.length, 0);
  }
});

test("provider failures propagate without retrying", async () => {
  for (const code of [
    "E_RECIPIENT_SUPPRESSED",
    "E_RATE_LIMIT_EXCEEDED",
    "E_INTERNAL_SERVER_ERROR",
  ]) {
    const failure = Object.assign(new Error("Provider failure"), { code });
    let attempts = 0;
    const { env } = fixture({
      EMAIL: {
        async send() {
          attempts++;
          throw failure;
        },
      },
    });
    await assert.rejects(sendEmail(env, message), (error) => error === failure);
    assert.equal(attempts, 1);
  }
});
