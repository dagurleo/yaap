import assert from "node:assert/strict";
import { test } from "node:test";
import { build } from "esbuild";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { Webhook } from "standardwebhooks";

async function moduleFrom(entry) {
  const output = await build({
    entryPoints: [entry],
    bundle: true,
    write: false,
    format: "esm",
    platform: "node",
    banner: {
      js: `import { createRequire } from "node:module"; const require = createRequire(${JSON.stringify(pathToFileURL(resolve("package.json")).href)});`,
    },
  });
  return import(
    "data:text/javascript;base64," +
      Buffer.from(output.outputFiles[0].text).toString("base64")
  );
}

const plansModule = await moduleFrom("src/lib/billing-plans.ts");
const configModule = await moduleFrom("src/server/billing/config.ts");
const entitlementModule = await moduleFrom(
  "src/server/billing/entitlements.ts",
);
const trialModule = await moduleFrom("src/server/billing/trial.ts");
const usageModule = await moduleFrom("src/server/billing/usage.ts");
const providerServiceModule = await moduleFrom(
  "src/server/billing/provider-service.ts",
);
const polarModule = await moduleFrom("src/server/billing/polar.ts");
const webhookModule = await moduleFrom("src/server/billing/webhooks.ts");
const notificationModule = await moduleFrom(
  "src/server/billing/notifications.ts",
);

const productIds = Object.fromEntries(
  plansModule.BILLING_PLANS.map((plan, index) => [
    plan.key,
    `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
  ]),
);

const hostedConfig = {
  YAAP_HOSTING_MODE: "hosted",
  POLAR_ENVIRONMENT: "sandbox",
  POLAR_ACCESS_TOKEN: "test-token",
  POLAR_WEBHOOK_SECRET: `whsec_${Buffer.from("test-webhook-secret").toString("base64")}`,
  POLAR_PRODUCT_IDS: JSON.stringify(productIds),
};

function fakeProvider() {
  const state = {
    checkouts: [],
    subscriptions: [],
    createCalls: 0,
    updateCalls: 0,
    subscriptionUpdateCalls: [],
    portalCalls: 0,
    failCreateOnce: false,
    failUpgradeOnce: false,
    createDelay: 0,
  };
  const provider = {
    async createCheckout(input) {
      state.createCalls += 1;
      if (state.createDelay)
        await new Promise((resolve) => setTimeout(resolve, state.createDelay));
      const checkout = {
        id: `checkout-${state.createCalls}`,
        status: "open",
        url: `https://sandbox.polar.sh/checkout/${state.createCalls}`,
        expiresAt: Date.now() + 60_000,
        externalCustomerId: input.externalCustomerId,
        customerId: "polar-customer-1",
        productId: input.selectedProductId,
        subscriptionId: null,
        amount: plansModule.BILLING_PLANS.find(
          (plan) => productIds[plan.key] === input.selectedProductId,
        ).monthlyPriceCents,
        currency: "USD",
        allowTrial: false,
        metadata: input.metadata,
      };
      state.checkouts.push(checkout);
      if (state.failCreateOnce) {
        state.failCreateOnce = false;
        throw new Error("response lost after provider commit");
      }
      return checkout;
    },
    async getCheckout(id) {
      const checkout = state.checkouts.find((candidate) => candidate.id === id);
      if (!checkout) throw new Error("checkout not found");
      return checkout;
    },
    async listOpenCheckouts(externalCustomerId) {
      return state.checkouts.filter(
        (checkout) =>
          checkout.status === "open" &&
          checkout.externalCustomerId === externalCustomerId,
      );
    },
    async updateCheckout(id, input) {
      state.updateCalls += 1;
      const checkout = await this.getCheckout(id);
      checkout.productId = input.selectedProductId;
      checkout.amount = plansModule.BILLING_PLANS.find(
        (plan) => productIds[plan.key] === input.selectedProductId,
      ).monthlyPriceCents;
      checkout.metadata = input.metadata;
      return checkout;
    },
    async listSubscriptions(externalCustomerId) {
      assert.equal(externalCustomerId, "billing-workspace");
      return state.subscriptions;
    },
    async updateSubscription(id, input) {
      state.subscriptionUpdateCalls.push({ id, ...input });
      if (state.failUpgradeOnce) {
        state.failUpgradeOnce = false;
        throw Object.assign(new Error("payment failed"), { statusCode: 402 });
      }
      const subscription = state.subscriptions.find(
        (candidate) => candidate.id === id,
      );
      if (!subscription) throw new Error("subscription not found");
      subscription.productId = input.selectedProductId;
      subscription.revision = new Date(
        Date.parse(subscription.revision) + 1,
      ).toISOString();
      return subscription;
    },
    async createPortalSession(externalCustomerId) {
      state.portalCalls += 1;
      assert.equal(externalCustomerId, "billing-workspace");
      return {
        url: "https://sandbox.polar.sh/portal/session",
        expiresAt: Date.now() + 60_000,
        customerId: "polar-customer-1",
      };
    },
  };
  return { state, provider };
}

function activeSubscription(overrides = {}) {
  const startsAt = Date.now();
  return {
    id: "subscription-1",
    status: "active",
    externalCustomerId: "billing-workspace",
    customerId: "polar-customer-1",
    productId: productIds.hosted_1m_monthly_v1,
    checkoutId: "checkout-1",
    currentPeriodStartsAt: startsAt,
    currentPeriodEndsAt: startsAt + 30 * 86400000,
    cancelAtPeriodEnd: false,
    revision: new Date(startsAt).toISOString(),
    ...overrides,
  };
}

async function billingDatabase() {
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      name: "billing-test",
      modules: true,
      script: "export default { fetch() { return new Response('ok') } }",
      compatibilityDate: "2026-09-09",
      d1Databases: ["DB"],
    }),
  );
  const db = await mf.getD1Database("DB");
  const files = (await readdir("migrations"))
    .filter((file) => file.endsWith(".sql"))
    .sort();
  for (const file of files) {
    const migration = await readFile(join("migrations", file), "utf8");
    for (const statement of migration.split("--> statement-breakpoint"))
      if (statement.trim()) await db.prepare(statement).run();
  }
  return { mf, db };
}

async function seedBillingOwner(db, { verified = true } = {}) {
  const now = Date.now();
  await db.batch([
    db
      .prepare(
        `INSERT INTO "user"(id,name,email,email_verified,created_at,updated_at)
         VALUES('billing-owner','Owner','billing@example.com',?,?,?)`,
      )
      .bind(verified ? 1 : 0, now, now),
    db
      .prepare(
        `INSERT INTO workspaces(id,owner_user_id,created_at,updated_at)
         VALUES('billing-workspace','billing-owner',?,?)`,
      )
      .bind(now, now),
    db
      .prepare(
        `INSERT INTO sites(id,owner_id,name,origin,created_at,workspace_id)
         VALUES('billing-site','billing-owner','Billing site','https://billing.example',?,'billing-workspace')`,
      )
      .bind(now),
  ]);
}

async function seedBillingViewer(db) {
  const now = Date.now();
  await db.batch([
    db
      .prepare(
        `INSERT INTO "user"(id,name,email,email_verified,created_at,updated_at)
         VALUES('billing-viewer','Viewer','viewer@example.com',1,?,?)`,
      )
      .bind(now, now),
    db
      .prepare(
        `INSERT INTO site_memberships(site_id,user_id,role,created_at,created_by_user_id)
         VALUES('billing-site','billing-viewer','viewer',?,'billing-owner')`,
      )
      .bind(now),
  ]);
}

test("catalog is versioned, ordered and snapshots every commercial limit", () => {
  assert.deepEqual(
    plansModule.BILLING_PLANS.map((plan) => [
      plan.key,
      plan.monthlyPriceCents,
      plan.eventAllowance,
      plan.admissionCeiling,
      plan.version,
      plan.currency,
      plan.interval,
      plan.quantity,
    ]),
    [
      ["hosted_100k_monthly_v1", 900, 100_000, 110_000, 1, "USD", "month", 1],
      ["hosted_500k_monthly_v1", 1_900, 500_000, 550_000, 1, "USD", "month", 1],
      [
        "hosted_1m_monthly_v1",
        2_900,
        1_000_000,
        1_100_000,
        1,
        "USD",
        "month",
        1,
      ],
      [
        "hosted_2m_monthly_v1",
        4_900,
        2_000_000,
        2_200_000,
        1,
        "USD",
        "month",
        1,
      ],
      [
        "hosted_5m_monthly_v1",
        9_900,
        5_000_000,
        5_500_000,
        1,
        "USD",
        "month",
        1,
      ],
      [
        "hosted_10m_monthly_v1",
        14_900,
        10_000_000,
        11_000_000,
        1,
        "USD",
        "month",
        1,
      ],
    ],
  );
  for (const plan of plansModule.BILLING_PLANS)
    assert.equal(
      plan.admissionCeiling,
      plan.eventAllowance + plan.eventAllowance / 10,
    );
});

test("self-hosted mode is the inert default and hosted mode fails closed", () => {
  assert.deepEqual(configModule.billingConfig({}), { mode: "self_hosted" });
  assert.deepEqual(
    configModule.billingConfig({
      YAAP_HOSTING_MODE: "self_hosted",
      POLAR_ENVIRONMENT: "invalid",
    }),
    { mode: "self_hosted" },
  );
  for (const env of [
    { YAAP_HOSTING_MODE: "hosted" },
    { YAAP_HOSTING_MODE: "hosted", POLAR_ENVIRONMENT: "sandbox" },
    {
      YAAP_HOSTING_MODE: "hosted",
      POLAR_ENVIRONMENT: "sandbox",
      POLAR_ACCESS_TOKEN: "token",
      POLAR_WEBHOOK_SECRET: "secret",
      POLAR_PRODUCT_IDS: "{}",
    },
    {
      YAAP_HOSTING_MODE: "hosted",
      POLAR_ENVIRONMENT: "sandbox",
      POLAR_ACCESS_TOKEN: "token",
      POLAR_WEBHOOK_SECRET: "secret",
      POLAR_PRODUCT_IDS: JSON.stringify({
        ...productIds,
        hosted_10m_monthly_v1: productIds.hosted_5m_monthly_v1,
      }),
    },
  ])
    assert.throws(() => configModule.billingConfig(env));

  const hosted = configModule.billingConfig({
    YAAP_HOSTING_MODE: "hosted",
    POLAR_ENVIRONMENT: "sandbox",
    POLAR_ACCESS_TOKEN: "token",
    POLAR_WEBHOOK_SECRET: "secret",
    POLAR_PRODUCT_IDS: JSON.stringify(productIds),
  });
  assert.equal(hosted.mode, "hosted");
  assert.equal(hosted.environment, "sandbox");
  assert.deepEqual(hosted.productIds, productIds);
});

test("Polar customer provisioning binds checkout identity to the workspace", async () => {
  let getCalls = 0;
  let createCalls = 0;
  const client = {
    customers: {
      async getExternal({ externalId }) {
        getCalls += 1;
        if (getCalls === 1)
          throw Object.assign(new Error("missing"), { statusCode: 404 });
        return { id: "polar-customer-1", externalId };
      },
      async create({ externalId, type, email, owner, metadata }) {
        createCalls += 1;
        assert.equal(type, "team");
        assert.equal(email, undefined);
        assert.equal(owner.email, "billing@example.com");
        assert.equal(owner.externalId, "billing-workspace");
        assert.equal(metadata.workspace_id, "billing-workspace");
        // Simulate a lost response after Polar committed the customer.
        throw new Error(`response lost for ${externalId}`);
      },
    },
  };
  const customer = await polarModule.ensurePolarWorkspaceCustomer(client, {
    externalCustomerId: "billing-workspace",
    customerEmail: "billing@example.com",
    customerName: "Owner",
  });
  assert.equal(customer.id, "polar-customer-1");
  assert.equal(getCalls, 2);
  assert.equal(createCalls, 1);

  await assert.rejects(
    polarModule.ensurePolarWorkspaceCustomer(
      {
        customers: {
          async getExternal() {
            return {
              id: "polar-customer-2",
              externalId: "another-workspace",
            };
          },
        },
      },
      {
        externalCustomerId: "billing-workspace",
        customerEmail: "billing@example.com",
        customerName: "Owner",
      },
    ),
    /belongs to another account/,
  );
});

test("Polar portal and upgrade requests use explicit member and proration inputs", async () => {
  const calls = [];
  const subscriptionCalls = [];
  const provider = polarModule.createBillingProvider(
    configModule.billingConfig(hostedConfig),
    {
      customerSessions: {
        async create(input) {
          calls.push(input);
          return {
            customerPortalUrl: "https://sandbox.polar.sh/portal/session",
            expiresAt: new Date(1_800_000_000_000),
            customerId: "polar-customer-1",
          };
        },
      },
      subscriptions: {
        async update(input) {
          subscriptionCalls.push(input);
          return {
            id: input.id,
            status: "active",
            customer: { externalId: "billing-workspace" },
            customerId: "polar-customer-1",
            productId: input.subscriptionUpdate.productId,
            checkoutId: "checkout-1",
            currentPeriodStart: new Date(1_790_000_000_000),
            currentPeriodEnd: new Date(1_800_000_000_000),
            cancelAtPeriodEnd: false,
            modifiedAt: new Date(1_795_000_000_000),
            createdAt: new Date(1_790_000_000_000),
          };
        },
      },
    },
  );

  const session = await provider.createPortalSession(
    "billing-workspace",
    "https://app.example/app/billing?billing=return",
  );

  assert.deepEqual(calls, [
    {
      externalCustomerId: "billing-workspace",
      externalMemberId: "billing-workspace",
      returnUrl: "https://app.example/app/billing?billing=return",
    },
  ]);
  assert.equal(session.url, "https://sandbox.polar.sh/portal/session");
  assert.equal(session.customerId, "polar-customer-1");

  const subscription = await provider.updateSubscription("subscription-1", {
    selectedProductId: productIds.hosted_1m_monthly_v1,
    prorationBehavior: "invoice",
  });
  assert.deepEqual(subscriptionCalls, [
    {
      id: "subscription-1",
      subscriptionUpdate: {
        productId: productIds.hosted_1m_monthly_v1,
        prorationBehavior: "invoice",
      },
    },
  ]);
  assert.equal(subscription.productId, productIds.hosted_1m_monthly_v1);
});

test("entitlements preserve usage across warnings and stop at the ceiling", () => {
  const now = Date.UTC(2026, 8, 12);
  const base = {
    trial: {
      startsAt: now - 1,
      endsAt: now + 10_000,
      graceEndsAt: now + 20_000,
    },
    usage: {
      source: "trial",
      planKey: null,
      startsAt: now - 1,
      endsAt: now + 10_000,
      allowance: 100_000,
      admissionCeiling: 100_000,
      persisted: 79_999,
      reserved: 0,
    },
  };
  const below = entitlementModule.resolveEntitlements("hosted", base, now);
  assert.equal(below.state, "trial_active");
  assert.equal(below.warningThreshold, null);
  const warning = entitlementModule.resolveEntitlements(
    "hosted",
    { ...base, usage: { ...base.usage, reserved: 1 } },
    now,
  );
  assert.equal(warning.warningThreshold, 80);
  assert.equal(warning.canCollect, true);
  const exhausted = entitlementModule.resolveEntitlements(
    "hosted",
    { ...base, usage: { ...base.usage, persisted: 99_999, reserved: 1 } },
    now,
  );
  assert.equal(exhausted.state, "quota_exhausted");
  assert.equal(exhausted.canCollect, false);
  assert.equal(exhausted.canReadRetainedReports, true);
});

test("paid, payment-grace, pending and expired boundaries fail closed", () => {
  const now = 1_000_000;
  const subscription = {
    status: "active",
    planKey: "hosted_1m_monthly_v1",
    currentPeriodStartsAt: now - 10,
    currentPeriodEndsAt: now + 10,
    paidThroughAt: now + 10,
    paymentGraceEndsAt: null,
  };
  const usage = {
    source: "subscription",
    planKey: "hosted_1m_monthly_v1",
    startsAt: now - 10,
    endsAt: now + 10,
    allowance: 1_000_000,
    admissionCeiling: 1_100_000,
    persisted: 1_000_000,
    reserved: 0,
  };
  assert.equal(
    entitlementModule.resolveEntitlements(
      "hosted",
      { subscription, usage },
      now,
    ).state,
    "paid_active",
  );
  assert.equal(
    entitlementModule.resolveEntitlements(
      "hosted",
      {
        subscription: {
          ...subscription,
          status: "past_due",
          paymentGraceEndsAt: now + 1,
        },
        usage,
      },
      now,
    ).state,
    "payment_grace",
  );
  const pending = entitlementModule.resolveEntitlements(
    "hosted",
    { checkoutPending: true },
    now,
  );
  assert.equal(pending.state, "checkout_pending");
  assert.equal(pending.canCollect, false);
  const missingPeriod = entitlementModule.resolveEntitlements(
    "hosted",
    { subscription },
    now,
  );
  assert.equal(missingPeriod.state, "provider_confirmation_required");
  assert.equal(
    missingPeriod.collectionPauseReason,
    "provider_confirmation_required",
  );
  assert.equal(missingPeriod.canCollect, false);
  const expired = entitlementModule.resolveEntitlements(
    "hosted",
    {
      trial: {
        startsAt: now - 10,
        endsAt: now,
        graceEndsAt: now,
      },
    },
    now,
  );
  assert.equal(expired.state, "service_ended");
  assert.equal(expired.collectionPauseReason, "trial_expired");
});

test("a hosted owner trial starts after verification and never resets", async () => {
  const { mf, db } = await billingDatabase();
  try {
    await seedBillingOwner(db, { verified: false });
    const env = { DB: db, ...hostedConfig };
    const startsAt = Date.UTC(2026, 8, 12);
    assert.equal(
      await trialModule.activateHostedTrialForVerifiedOwner(
        env,
        "billing-owner",
        startsAt,
      ),
      null,
    );
    await db
      .prepare('UPDATE "user" SET email_verified=1 WHERE id=?')
      .bind("billing-owner")
      .run();
    const started = await trialModule.activateHostedTrialForVerifiedOwner(
      env,
      "billing-owner",
      startsAt,
    );
    assert.deepEqual(started, {
      workspaceId: "billing-workspace",
      periodId: "trial:sandbox:billing-workspace",
      startsAt,
      endsAt: startsAt + trialModule.TRIAL_DURATION_MS,
      collectionEndsAt:
        startsAt + trialModule.TRIAL_DURATION_MS + trialModule.TRIAL_GRACE_MS,
    });
    assert.deepEqual(
      await trialModule.activateHostedTrialForVerifiedOwner(
        env,
        "billing-owner",
        startsAt + 86400000,
      ),
      started,
    );
    assert.equal(
      (
        await db
          .prepare("SELECT COUNT(*) AS count FROM billing_usage_periods")
          .first()
      ).count,
      1,
    );
    assert.deepEqual(
      await db
        .prepare(
          "SELECT ends_at AS endsAt,allowance,admission_ceiling AS ceiling FROM billing_usage_periods WHERE id=?",
        )
        .bind(started.periodId)
        .first(),
      {
        endsAt: started.collectionEndsAt,
        allowance: trialModule.TRIAL_EVENT_ALLOWANCE,
        ceiling: trialModule.TRIAL_ADMISSION_CEILING,
      },
    );
    await db
      .prepare(
        `INSERT INTO "user"(id,name,email,email_verified,created_at,updated_at)
         VALUES('invited-viewer','Viewer','viewer@example.com',1,?,?)`,
      )
      .bind(startsAt, startsAt)
      .run();
    assert.equal(
      await trialModule.activateHostedTrialForVerifiedOwner(
        env,
        "invited-viewer",
        startsAt,
      ),
      null,
    );
  } finally {
    await mf.dispose();
  }
});

test("trial grace keeps collection active until its exact boundary", () => {
  const now = Date.UTC(2026, 8, 12);
  const usage = {
    source: "trial",
    planKey: null,
    startsAt: now - 14 * 86400000,
    endsAt: now + trialModule.TRIAL_GRACE_MS,
    allowance: trialModule.TRIAL_EVENT_ALLOWANCE,
    admissionCeiling: trialModule.TRIAL_ADMISSION_CEILING,
    persisted: trialModule.TRIAL_EVENT_ALLOWANCE,
    reserved: 0,
  };
  const trial = {
    startsAt: usage.startsAt,
    endsAt: now,
    graceEndsAt: now + trialModule.TRIAL_GRACE_MS,
  };
  const grace = entitlementModule.resolveEntitlements(
    "hosted",
    { trial, usage },
    now,
  );
  assert.equal(grace.state, "trial_grace");
  assert.equal(grace.canCollect, true);
  assert.equal(grace.warningThreshold, 100);
  const ended = entitlementModule.resolveEntitlements(
    "hosted",
    { trial, usage },
    trial.graceEndsAt,
  );
  assert.equal(ended.state, "service_ended");
  assert.equal(ended.canCollect, false);
  assert.equal(ended.collectionPauseReason, "trial_expired");
});

test("billing notices are deduplicated and reach owners and operators", async () => {
  const { mf, db } = await billingDatabase();
  try {
    await seedBillingOwner(db);
    const sent = [];
    const now = Date.UTC(2026, 8, 12);
    const env = {
      DB: db,
      ...hostedConfig,
      BETTER_AUTH_URL: "https://analytics.example",
      BILLING_ALERT_EMAIL: "billing-ops@example.com",
      EMAIL_FROM: "notices@example.com",
      EMAIL: {
        async send(message) {
          sent.push(message);
          return { messageId: `message-${sent.length}` };
        },
      },
    };
    const trial = await trialModule.activateHostedTrialForVerifiedOwner(
      env,
      "billing-owner",
      now - trialModule.TRIAL_DURATION_MS - 1000,
    );
    assert.ok(trial);
    assert.equal(
      await usageModule.canHostedWorkspaceCollect(
        env,
        "billing-workspace",
        now,
      ),
      true,
    );
    assert.equal(
      await usageModule.canHostedWorkspaceCollect(
        env,
        "billing-workspace",
        trial.collectionEndsAt,
      ),
      false,
    );
    await notificationModule.enqueueTrialNotifications(env, now);
    assert.deepEqual(
      await notificationModule.deliverBillingNotifications(env, 25, now),
      { sent: 2, failed: 0 },
    );
    assert.deepEqual(sent.map((message) => message.to).sort(), [
      "billing-ops@example.com",
      "billing@example.com",
    ]);
    assert.ok(sent.every((message) => message.html.includes("three-day")));
    await notificationModule.enqueueTrialNotifications(env, now + 1000);
    assert.deepEqual(
      await notificationModule.deliverBillingNotifications(env, 25, now + 1000),
      { sent: 0, failed: 0 },
    );
    assert.equal(
      (
        await db
          .prepare(
            "SELECT COUNT(*) AS count FROM billing_notification_jobs WHERE state='sent'",
          )
          .first()
      ).count,
      2,
    );
  } finally {
    await mf.dispose();
  }
});

test("hosted admission survives publish failure and counts persisted events once", async () => {
  const { mf, db } = await billingDatabase();
  try {
    await seedBillingOwner(db);
    const published = [];
    const emailSent = [];
    let failPublish = false;
    const env = {
      DB: db,
      ...hostedConfig,
      EVENTS: {
        async send(message) {
          if (failPublish) throw new Error("ambiguous publish");
          published.push(message);
        },
      },
      BETTER_AUTH_URL: "https://analytics.example",
      EMAIL_FROM: "notices@example.com",
      EMAIL: {
        async send(message) {
          emailSent.push(message);
          return { messageId: `usage-message-${emailSent.length}` };
        },
      },
    };
    const now = Date.now();
    const trial = await trialModule.activateHostedTrialForVerifiedOwner(
      env,
      "billing-owner",
      now,
    );
    await db
      .prepare(
        "UPDATE billing_usage_periods SET allowance=2,admission_ceiling=2 WHERE id=?",
      )
      .bind(trial.periodId)
      .run();
    const event = (id) => ({
      version: 1,
      id,
      siteId: "billing-site",
      name: "pageview",
      path: "/metered",
      receivedAt: now,
    });
    const first = await usageModule.admitHostedEvent(
      env,
      event("event-1"),
      "billing-workspace",
      "Billing site",
    );
    const second = await usageModule.admitHostedEvent(
      env,
      event("event-2"),
      "billing-workspace",
      "Billing site",
    );
    assert.equal(first.accepted, true);
    assert.equal(second.accepted, true);
    assert.deepEqual(
      await usageModule.admitHostedEvent(
        env,
        event("event-3"),
        "billing-workspace",
        "Billing site",
      ),
      { accepted: false, reason: "collection_paused", retryable: false },
    );
    assert.equal(
      (
        await usageModule.admitHostedEvent(
          env,
          event("event-1"),
          "billing-workspace",
          "Billing site",
        )
      ).duplicate,
      true,
    );
    assert.equal(
      await usageModule.consumeHostedReceipt(env, first.receiptId),
      "stored",
    );
    assert.equal(
      await usageModule.consumeHostedReceipt(env, first.receiptId),
      "terminal",
    );
    assert.equal(
      await usageModule.consumeHostedReceipt(env, second.receiptId),
      "stored",
    );
    assert.deepEqual(
      await db
        .prepare(
          "SELECT persisted_count AS persisted,reserved_count AS reserved FROM billing_usage_periods WHERE id=?",
        )
        .bind(trial.periodId)
        .first(),
      { persisted: 2, reserved: 0 },
    );
    assert.equal(
      (
        await db
          .prepare("SELECT COUNT(*) AS count FROM billing_notification_jobs")
          .first()
      ).count,
      3,
    );
    assert.deepEqual(
      await notificationModule.deliverBillingNotifications(env),
      { sent: 3, failed: 0 },
    );
    assert.deepEqual(emailSent.map((message) => message.subject).sort(), [
      "Yaap analytics collection is paused",
      "You’ve used 80% of your Yaap events",
      "You’ve used all events included in your Yaap plan",
    ]);

    await db
      .prepare(
        "UPDATE billing_usage_periods SET allowance=3,admission_ceiling=3 WHERE id=?",
      )
      .bind(trial.periodId)
      .run();
    failPublish = true;
    const ambiguous = await usageModule.admitHostedEvent(
      env,
      event("event-4"),
      "billing-workspace",
      "Billing site",
    );
    assert.equal(ambiguous.accepted, true);
    assert.equal(
      (
        await db
          .prepare(
            "SELECT publish_state AS state FROM billing_event_receipts WHERE id=?",
          )
          .bind(ambiguous.receiptId)
          .first()
      ).state,
      "unknown",
    );
    failPublish = false;
    await db
      .prepare("UPDATE billing_event_receipts SET next_publish_at=0 WHERE id=?")
      .bind(ambiguous.receiptId)
      .run();
    assert.equal(await usageModule.repairBillingOutbox(env), 1);
    assert.ok(
      published.some((message) => message.receiptId === ambiguous.receiptId),
    );
    assert.equal(
      await usageModule.consumeHostedReceipt(env, ambiguous.receiptId),
      "stored",
    );
    await db
      .prepare(
        "UPDATE billing_usage_periods SET allowance=4,admission_ceiling=4 WHERE id=?",
      )
      .bind(trial.periodId)
      .run();
    await db
      .prepare(
        `INSERT INTO billing_event_receipts(id,workspace_id,site_id,site_label,event_id,period_id,ingressed_at,state,payload,publish_state,next_publish_at,replay_until,updated_at)
         VALUES('expired-receipt','billing-workspace','billing-site','Billing site','expired-event',?,?,'reserved',?,'published',0,?,?)`,
      )
      .bind(
        trial.periodId,
        now,
        JSON.stringify(event("expired-event")),
        now - 1,
        now,
      )
      .run();
    await usageModule.repairBillingOutbox(env);
    assert.deepEqual(
      await db
        .prepare(
          "SELECT persisted_count AS persisted,reserved_count AS reserved FROM billing_usage_periods WHERE id=?",
        )
        .bind(trial.periodId)
        .first(),
      { persisted: 3, reserved: 0 },
    );
    assert.equal(
      await db
        .prepare(
          "SELECT id FROM billing_event_receipts WHERE id='expired-receipt'",
        )
        .first(),
      null,
    );
  } finally {
    await mf.dispose();
  }
});

test("checkout operations are owner-bound, idempotent and reuse one provider session", async () => {
  const { mf, db } = await billingDatabase();
  try {
    await seedBillingOwner(db);
    await seedBillingViewer(db);
    const env = { DB: db, ...hostedConfig };
    const { state, provider } = fakeProvider();
    await assert.rejects(
      providerServiceModule.createHostedCheckout(
        env,
        "billing-viewer",
        "https://app.example",
        {
          planKey: "hosted_1m_monthly_v1",
          operationKey: "viewer-checkout",
        },
        provider,
      ),
      (error) => error.status === 403,
    );
    assert.equal(state.createCalls, 0);
    const first = await providerServiceModule.createHostedCheckout(
      env,
      "billing-owner",
      "https://app.example",
      {
        planKey: "hosted_1m_monthly_v1",
        operationKey: "checkout-click-1",
      },
      provider,
    );
    const duplicate = await providerServiceModule.createHostedCheckout(
      env,
      "billing-owner",
      "https://app.example",
      {
        planKey: "hosted_1m_monthly_v1",
        operationKey: "checkout-click-1",
      },
      provider,
    );
    assert.equal(first.checkoutUrl, duplicate.checkoutUrl);
    assert.equal(state.createCalls, 1);

    const changed = await providerServiceModule.createHostedCheckout(
      env,
      "billing-owner",
      "https://app.example",
      {
        planKey: "hosted_2m_monthly_v1",
        operationKey: "checkout-click-2",
      },
      provider,
    );
    assert.equal(changed.checkoutUrl, first.checkoutUrl);
    assert.equal(state.createCalls, 1);
    assert.equal(state.updateCalls, 1);
    assert.equal(state.checkouts[0].externalCustomerId, "billing-workspace");
    assert.equal(state.checkouts[0].allowTrial, false);
    assert.equal(state.checkouts[0].productId, productIds.hosted_2m_monthly_v1);
    assert.deepEqual(
      (
        await db
          .prepare(
            "SELECT state,COUNT(*) AS count FROM billing_operations GROUP BY state ORDER BY state",
          )
          .all()
      ).results,
      [
        { state: "failed", count: 1 },
        { state: "pending", count: 1 },
      ],
    );
  } finally {
    await mf.dispose();
  }
});

test("a lost checkout response reconciles without creating a second checkout", async () => {
  const { mf, db } = await billingDatabase();
  try {
    await seedBillingOwner(db);
    const env = { DB: db, ...hostedConfig };
    const { state, provider } = fakeProvider();
    state.failCreateOnce = true;
    await assert.rejects(
      providerServiceModule.createHostedCheckout(
        env,
        "billing-owner",
        "https://app.example",
        {
          planKey: "hosted_500k_monthly_v1",
          operationKey: "ambiguous-checkout",
        },
        provider,
      ),
      (error) => error.status === 503,
    );
    const recovered = await providerServiceModule.createHostedCheckout(
      env,
      "billing-owner",
      "https://app.example",
      {
        planKey: "hosted_500k_monthly_v1",
        operationKey: "ambiguous-checkout",
      },
      provider,
    );
    assert.equal(recovered.checkoutUrl, state.checkouts[0].url);
    assert.equal(state.createCalls, 1);
    assert.equal(
      (
        await db
          .prepare(
            "SELECT state FROM billing_operations WHERE operation_key='ambiguous-checkout'",
          )
          .first()
      ).state,
      "pending",
    );
  } finally {
    await mf.dispose();
  }
});

test("concurrent checkout tabs cannot issue parallel provider creates", async () => {
  const { mf, db } = await billingDatabase();
  try {
    await seedBillingOwner(db);
    const env = { DB: db, ...hostedConfig };
    const { state, provider } = fakeProvider();
    state.createDelay = 50;
    const request = (operationKey) =>
      providerServiceModule.createHostedCheckout(
        env,
        "billing-owner",
        "https://app.example",
        {
          planKey: "hosted_100k_monthly_v1",
          operationKey,
        },
        provider,
      );
    const results = await Promise.allSettled([
      request("tab-one"),
      request("tab-two"),
    ]);
    assert.equal(
      results.filter((result) => result.status === "fulfilled").length,
      1,
    );
    assert.equal(
      results.filter(
        (result) =>
          result.status === "rejected" && result.reason.status === 409,
      ).length,
      1,
    );
    assert.equal(state.createCalls, 1);
    assert.equal(
      (
        await db
          .prepare(
            "SELECT COUNT(*) AS count FROM billing_operations WHERE state IN ('pending','unknown')",
          )
          .first()
      ).count,
      1,
    );
  } finally {
    await mf.dispose();
  }
});

test("subscription upgrades preview proration and preserve current-period usage", async () => {
  const { mf, db } = await billingDatabase();
  try {
    await seedBillingOwner(db);
    await seedBillingViewer(db);
    const env = { DB: db, ...hostedConfig };
    const { state, provider } = fakeProvider();
    const startsAt = Date.UTC(2026, 8, 1);
    const endsAt = startsAt + 30 * 86_400_000;
    const now = startsAt + 15 * 86_400_000;
    state.subscriptions = [
      activeSubscription({
        productId: productIds.hosted_500k_monthly_v1,
        currentPeriodStartsAt: startsAt,
        currentPeriodEndsAt: endsAt,
        revision: new Date(startsAt).toISOString(),
      }),
    ];
    await providerServiceModule.reconcileWorkspace(
      env,
      "billing-workspace",
      provider,
    );
    await db
      .prepare(
        "UPDATE billing_usage_periods SET persisted_count=400000,reserved_count=100000 WHERE workspace_id='billing-workspace' AND source='subscription'",
      )
      .run();

    await assert.rejects(
      providerServiceModule.previewHostedUpgrade(
        env,
        "billing-viewer",
        "hosted_1m_monthly_v1",
        provider,
        now,
      ),
      (error) => error.status === 403,
    );
    const preview = await providerServiceModule.previewHostedUpgrade(
      env,
      "billing-owner",
      "hosted_1m_monthly_v1",
      provider,
      now,
    );
    assert.equal(preview.currentPlan.key, "hosted_500k_monthly_v1");
    assert.equal(preview.targetPlan.key, "hosted_1m_monthly_v1");
    assert.equal(preview.estimatedChargeCents, 500);
    assert.equal(preview.persisted, 400_000);
    assert.equal(preview.reserved, 100_000);
    assert.equal(preview.remainingCapacity, 500_000);
    assert.equal(preview.renewsAt, endsAt);

    const input = {
      planKey: "hosted_1m_monthly_v1",
      operationKey: "upgrade-half-period",
      expectedRevision: preview.expectedRevision,
    };
    const upgraded = await providerServiceModule.executeHostedUpgrade(
      env,
      "billing-owner",
      input,
      provider,
    );
    assert.equal(upgraded.state, "complete");
    assert.equal(upgraded.planKey, "hosted_1m_monthly_v1");
    assert.deepEqual(state.subscriptionUpdateCalls, [
      {
        id: "subscription-1",
        selectedProductId: productIds.hosted_1m_monthly_v1,
        prorationBehavior: "invoice",
      },
    ]);
    assert.deepEqual(
      await db
        .prepare(
          "SELECT plan_key AS planKey,allowance,admission_ceiling AS admissionCeiling,persisted_count AS persisted,reserved_count AS reserved,starts_at AS startsAt,ends_at AS endsAt FROM billing_usage_periods WHERE workspace_id='billing-workspace' AND source='subscription'",
        )
        .first(),
      {
        planKey: "hosted_1m_monthly_v1",
        allowance: 1_000_000,
        admissionCeiling: 1_100_000,
        persisted: 400_000,
        reserved: 100_000,
        startsAt,
        endsAt,
      },
    );

    const duplicate = await providerServiceModule.executeHostedUpgrade(
      env,
      "billing-owner",
      input,
      provider,
    );
    assert.equal(duplicate.state, "complete");
    assert.equal(state.subscriptionUpdateCalls.length, 1);
    assert.equal(
      (
        await db
          .prepare(
            "SELECT state FROM billing_operations WHERE operation_key='upgrade-half-period'",
          )
          .first()
      ).state,
      "complete",
    );
  } finally {
    await mf.dispose();
  }
});

test("failed or stale prorated upgrades leave the current plan unchanged", async () => {
  const { mf, db } = await billingDatabase();
  try {
    await seedBillingOwner(db);
    const env = { DB: db, ...hostedConfig };
    const { state, provider } = fakeProvider();
    state.subscriptions = [
      activeSubscription({
        productId: productIds.hosted_500k_monthly_v1,
      }),
    ];
    const preview = await providerServiceModule.previewHostedUpgrade(
      env,
      "billing-owner",
      "hosted_1m_monthly_v1",
      provider,
    );

    state.subscriptions[0].revision = new Date(
      Date.parse(state.subscriptions[0].revision) + 1,
    ).toISOString();
    await assert.rejects(
      providerServiceModule.executeHostedUpgrade(
        env,
        "billing-owner",
        {
          planKey: "hosted_1m_monthly_v1",
          operationKey: "stale-upgrade",
          expectedRevision: preview.expectedRevision,
        },
        provider,
      ),
      (error) => error.status === 409 && /review/i.test(error.message),
    );
    assert.equal(state.subscriptionUpdateCalls.length, 0);

    const fresh = await providerServiceModule.previewHostedUpgrade(
      env,
      "billing-owner",
      "hosted_1m_monthly_v1",
      provider,
    );
    state.failUpgradeOnce = true;
    await assert.rejects(
      providerServiceModule.executeHostedUpgrade(
        env,
        "billing-owner",
        {
          planKey: "hosted_1m_monthly_v1",
          operationKey: "failed-payment-upgrade",
          expectedRevision: fresh.expectedRevision,
        },
        provider,
      ),
      (error) => error.status === 402,
    );
    assert.equal(
      state.subscriptions[0].productId,
      productIds.hosted_500k_monthly_v1,
    );
    assert.equal(
      (
        await db
          .prepare(
            "SELECT state FROM billing_operations WHERE operation_key='failed-payment-upgrade'",
          )
          .first()
      ).state,
      "failed",
    );
  } finally {
    await mf.dispose();
  }
});

test("authoritative subscription reconciliation ends trial without moving its usage", async () => {
  const { mf, db } = await billingDatabase();
  try {
    await seedBillingOwner(db);
    const env = { DB: db, ...hostedConfig };
    const { state, provider } = fakeProvider();
    const trial = await trialModule.activateHostedTrialForVerifiedOwner(
      env,
      "billing-owner",
      Date.now() - 10_000,
    );
    await db
      .prepare("UPDATE billing_usage_periods SET persisted_count=17 WHERE id=?")
      .bind(trial.periodId)
      .run();
    const paid = activeSubscription();
    state.subscriptions = [paid];
    await providerServiceModule.reconcileWorkspace(
      env,
      "billing-workspace",
      provider,
    );
    const periods = (
      await db
        .prepare(
          `SELECT source,source_id AS sourceId,plan_key AS planKey,starts_at AS startsAt,ends_at AS endsAt,persisted_count AS persisted,allowance
           FROM billing_usage_periods ORDER BY source`,
        )
        .all()
    ).results;
    assert.equal(periods.length, 2);
    assert.deepEqual(periods[0], {
      source: "subscription",
      sourceId: "polar:sandbox:subscription-1",
      planKey: "hosted_1m_monthly_v1",
      startsAt: paid.currentPeriodStartsAt,
      endsAt: paid.currentPeriodEndsAt,
      persisted: 0,
      allowance: 1_000_000,
    });
    assert.equal(periods[1].source, "trial");
    assert.equal(periods[1].persisted, 17);
    assert.equal(periods[1].endsAt, paid.currentPeriodStartsAt);

    state.subscriptions = [
      activeSubscription({ externalCustomerId: "another-workspace" }),
    ];
    await assert.rejects(
      providerServiceModule.reconcileWorkspace(
        env,
        "billing-workspace",
        provider,
      ),
      /another account/,
    );
  } finally {
    await mf.dispose();
  }
});

test("signed webhook receipts activate once and portal sessions stay workspace-bound", async () => {
  const { mf, db } = await billingDatabase();
  try {
    await seedBillingOwner(db);
    await seedBillingViewer(db);
    const env = { DB: db, ...hostedConfig };
    const { state, provider } = fakeProvider();
    state.subscriptions = [activeSubscription()];
    const now = new Date();
    const body = JSON.stringify({
      type: "customer.deleted",
      timestamp: now.toISOString(),
      data: {
        id: "polar-customer-1",
        created_at: now.toISOString(),
        modified_at: null,
        metadata: {},
        external_id: "billing-workspace",
        email: "billing@example.com",
        email_verified: true,
        type: "individual",
        name: "Owner",
        billing_name: null,
        billing_address: null,
        tax_id: null,
        organization_id: "00000000-0000-4000-8000-000000000099",
        deleted_at: now.toISOString(),
        avatar_url: null,
      },
    });
    const eventId = "signed-event-1";
    const signature = new Webhook(
      Buffer.from(hostedConfig.POLAR_WEBHOOK_SECRET).toString("base64"),
    ).sign(eventId, now, body);
    const request = () =>
      new Request("https://app.example/api/billing/webhooks/polar", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "webhook-id": eventId,
          "webhook-timestamp": String(Math.floor(now.getTime() / 1000)),
          "webhook-signature": signature,
        },
        body,
      });
    assert.equal(
      (await webhookModule.polarWebhook(request(), env, provider)).status,
      202,
    );
    assert.equal(
      (await webhookModule.polarWebhook(request(), env, provider)).status,
      202,
    );
    assert.deepEqual(
      await db
        .prepare(
          "SELECT state,attempts,subject_id AS subjectId FROM billing_webhook_receipts WHERE event_id=?",
        )
        .bind(eventId)
        .first(),
      { state: "complete", attempts: 1, subjectId: "billing-workspace" },
    );
    await assert.rejects(
      providerServiceModule.createHostedPortalSession(
        env,
        "billing-viewer",
        "https://app.example",
        provider,
      ),
      (error) => error.status === 403,
    );
    const portal = await providerServiceModule.createHostedPortalSession(
      env,
      "billing-owner",
      "https://app.example",
      provider,
    );
    assert.equal(portal.portalUrl, "https://sandbox.polar.sh/portal/session");
    assert.equal(state.portalCalls, 1);

    const bad = new Request("https://app.example/api/billing/webhooks/polar", {
      method: "POST",
      headers: {
        "webhook-id": "bad-event",
        "webhook-timestamp": String(Math.floor(now.getTime() / 1000)),
        "webhook-signature": "v1,bad",
      },
      body,
    });
    await assert.rejects(
      webhookModule.polarWebhook(bad, env, provider),
      (error) => error.status === 403,
    );
  } finally {
    await mf.dispose();
  }
});

test("webhooks accept the Standard Webhooks signing scheme", async () => {
  const { mf, db } = await billingDatabase();
  try {
    await seedBillingOwner(db);
    const env = { DB: db, ...hostedConfig };
    const { state, provider } = fakeProvider();
    state.subscriptions = [activeSubscription()];
    const now = new Date();
    const body = JSON.stringify({
      type: "subscription.created",
      timestamp: now.toISOString(),
      data: {
        id: "subscription-1",
        customer: { external_id: "billing-workspace" },
      },
    });
    const eventId = "standard-webhook-event-1";
    const signature = new Webhook(hostedConfig.POLAR_WEBHOOK_SECRET).sign(
      eventId,
      now,
      body,
    );
    const response = await webhookModule.polarWebhook(
      new Request("https://app.example/api/billing/webhooks/polar", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "webhook-id": eventId,
          "webhook-timestamp": String(Math.floor(now.getTime() / 1000)),
          "webhook-signature": signature,
        },
        body,
      }),
      env,
      provider,
    );

    assert.equal(response.status, 202);
    assert.deepEqual(
      await db
        .prepare(
          "SELECT state,attempts,subject_id AS subjectId FROM billing_webhook_receipts WHERE event_id=?",
        )
        .bind(eventId)
        .first(),
      { state: "complete", attempts: 1, subjectId: "billing-workspace" },
    );
  } finally {
    await mf.dispose();
  }
});

test("the pinned Polar adapter bundles for a Worker-style fetch runtime", async () => {
  const output = await build({
    entryPoints: ["src/server/billing/polar.ts"],
    bundle: true,
    write: false,
    format: "esm",
    platform: "browser",
    target: "es2022",
  });
  assert.ok(output.outputFiles[0].text.includes("0.49.0"));
});
