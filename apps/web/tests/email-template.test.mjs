import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";

let worker;
before(async () => {
  const bundle = await build({
    stdin: {
      contents: `
        import { createElement } from "react";
        import ReportReadyEmail from "./src/emails/report-ready";
        import { sendTemplateEmail } from "./src/server/email-template";
        export default {
          async fetch(request) {
            const props = await request.json();
            let sent;
            const env = {
              EMAIL_FROM: "reports@example.com",
              EMAIL_REPLY_TO: "support@example.com",
              EMAIL: { async send(message) {
                sent = message;
                return { messageId: "template-test" };
              } },
            };
            try {
              const result = await sendTemplateEmail(env, {
                to: "reader@example.com",
                subject: "Your Yaap report",
                template: createElement(ReportReadyEmail, props),
              });
              return Response.json({ result, sent });
            } catch {
              return Response.json({ failed: true, sent: Boolean(sent) }, { status: 400 });
            }
          },
        };
      `,
      resolveDir: process.cwd(),
      loader: "ts",
    },
    bundle: true,
    write: false,
    format: "esm",
    platform: "browser",
    conditions: ["workerd", "worker", "browser"],
    external: ["node:*"],
    define: { "process.env.NODE_ENV": '"production"' },
  });
  worker = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: bundle.outputFiles[0].text,
      compatibilityDate: "2026-09-09",
      compatibilityFlags: ["nodejs_compat"],
    }),
  );
});
after(async () => worker?.dispose());

const props = {
  siteName: 'Acme <script>alert("x")</script> & Co',
  periodLabel: "September 1–7, 2026",
  dashboardUrl:
    "https://analytics.example.com/app/site/overview?days=7&cohort=all",
};
const request = (overrides = {}) =>
  worker.dispatchFetch("https://email.test", {
    method: "POST",
    body: JSON.stringify({ ...props, ...overrides }),
  });

test("renders and sends HTML plus plain text inside a Cloudflare Worker", async () => {
  const response = await request();
  assert.equal(response.status, 200);
  const { result, sent } = await response.json();
  assert.equal(result.messageId, "template-test");
  assert.equal(sent.to, "reader@example.com");
  assert.equal(sent.from.email, "reports@example.com");
  assert.equal(sent.replyTo, "support@example.com");
  assert.match(sent.html, /<!DOCTYPE html/);
  assert.match(sent.html, /&lt;script&gt;/);
  assert.doesNotMatch(sent.html, /<script/);
  assert.match(sent.html, /September 1–7, 2026/);
  assert.ok(sent.text.toLowerCase().includes(props.siteName.toLowerCase()));
  assert.ok(sent.text.includes(props.dashboardUrl));
  assert.doesNotMatch(sent.text, /<html|<table/);
  assert.equal(sent.subject, "Your Yaap report");
  assert.match(
    sent.html,
    /src="https:\/\/analytics\.example\.com\/brand\/logo-email\.png"/,
  );
  assert.doesNotMatch(sent.html, /12,408|28,916/);
});

test("invalid template links fail before delivery", async () => {
  for (const dashboardUrl of [
    "javascript:alert(1)",
    "/app/site",
    "http://example.com",
    "https://user:pass@example.com",
  ]) {
    const response = await request({ dashboardUrl });
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { failed: true, sent: false });
  }
});
