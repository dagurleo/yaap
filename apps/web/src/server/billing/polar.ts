import { Polar } from "@polar-sh/sdk";
import type { BillingConfig } from "./config";

export const POLAR_SDK_VERSION = "0.49.0" as const;

export type HostedBillingConfig = Extract<BillingConfig, { mode: "hosted" }>;

export type ProviderCheckout = {
  id: string;
  status: string;
  url: string;
  expiresAt: number;
  externalCustomerId: string | null;
  customerId: string | null;
  productId: string | null;
  subscriptionId: string | null;
  amount: number;
  currency: string;
  allowTrial: boolean | null;
  metadata: Record<string, unknown>;
};

export type ProviderSubscription = {
  id: string;
  status: string;
  externalCustomerId: string | null;
  customerId: string;
  productId: string;
  checkoutId: string | null;
  currentPeriodStartsAt: number;
  currentPeriodEndsAt: number;
  cancelAtPeriodEnd: boolean;
  revision: string;
};

export type ProviderProrationBehavior = "invoice" | "next_period";

export interface BillingProvider {
  createCheckout(input: {
    externalCustomerId: string;
    customerEmail: string;
    customerName: string;
    productIds: string[];
    selectedProductId: string;
    successUrl: string;
    returnUrl: string;
    metadata: Record<string, string | number | boolean>;
  }): Promise<ProviderCheckout>;
  getCheckout(id: string): Promise<ProviderCheckout>;
  listOpenCheckouts(externalCustomerId: string): Promise<ProviderCheckout[]>;
  updateCheckout(
    id: string,
    input: {
      selectedProductId: string;
      metadata: Record<string, string | number | boolean>;
    },
  ): Promise<ProviderCheckout>;
  listSubscriptions(
    externalCustomerId: string,
  ): Promise<ProviderSubscription[]>;
  updateSubscription(
    id: string,
    input: {
      selectedProductId: string;
      prorationBehavior: ProviderProrationBehavior;
    },
  ): Promise<ProviderSubscription>;
  createPortalSession(
    externalCustomerId: string,
    returnUrl: string,
  ): Promise<{ url: string; expiresAt: number; customerId: string }>;
}

/**
 * Provider construction stays behind this server-only boundary. Remote mutation
 * retries are coordinated by billing_operations, not hidden inside request code.
 */
export function createPolarClient(config: HostedBillingConfig) {
  return new Polar({
    accessToken: config.accessToken,
    server: config.environment,
    retryConfig: { strategy: "none" },
  });
}

function polarStatus(error: unknown) {
  if (!error || typeof error !== "object" || !("statusCode" in error))
    return null;
  return typeof error.statusCode === "number" ? error.statusCode : null;
}

function workspaceCustomer<
  T extends { id: string; externalId?: string | null },
>(customer: T, externalCustomerId: string): T {
  if (customer.externalId !== externalCustomerId)
    throw new Error("Provider customer belongs to another account");
  return customer;
}

/**
 * Resolve the workspace before checkout so an organization-wide email match
 * cannot silently attach a purchase to another product's Polar customer.
 */
export async function ensurePolarWorkspaceCustomer(
  client: Polar,
  input: {
    externalCustomerId: string;
    customerEmail: string;
    customerName: string;
  },
) {
  try {
    return workspaceCustomer(
      await client.customers.getExternal({
        externalId: input.externalCustomerId,
      }),
      input.externalCustomerId,
    );
  } catch (error) {
    if (polarStatus(error) !== 404) throw error;
  }

  try {
    return workspaceCustomer(
      await client.customers.create({
        type: "team",
        externalId: input.externalCustomerId,
        name: input.customerName,
        owner: {
          email: input.customerEmail,
          name: input.customerName,
          externalId: input.externalCustomerId,
        },
        metadata: {
          app: "yaap",
          workspace_id: input.externalCustomerId,
        },
      }),
      input.externalCustomerId,
    );
  } catch (creationError) {
    // A concurrent request or lost create response may still have committed.
    try {
      return workspaceCustomer(
        await client.customers.getExternal({
          externalId: input.externalCustomerId,
        }),
        input.externalCustomerId,
      );
    } catch {
      throw creationError;
    }
  }
}

function checkout(
  value: Awaited<ReturnType<Polar["checkouts"]["get"]>>,
  externalCustomerId = value.externalCustomerId,
) {
  return {
    id: value.id,
    status: value.status,
    url: value.url,
    expiresAt: value.expiresAt.getTime(),
    externalCustomerId,
    customerId: value.customerId,
    productId: value.productId,
    subscriptionId: value.subscriptionId,
    amount: value.amount,
    currency: value.currency,
    allowTrial: value.allowTrial,
    metadata: value.metadata,
  } satisfies ProviderCheckout;
}

function subscription(
  value: Awaited<ReturnType<Polar["subscriptions"]["get"]>>,
): ProviderSubscription {
  return {
    id: value.id,
    status: value.status,
    externalCustomerId: value.customer.externalId ?? null,
    customerId: value.customerId,
    productId: value.productId,
    checkoutId: value.checkoutId,
    currentPeriodStartsAt: value.currentPeriodStart.getTime(),
    currentPeriodEndsAt: value.currentPeriodEnd.getTime(),
    cancelAtPeriodEnd: value.cancelAtPeriodEnd,
    revision: (value.modifiedAt ?? value.createdAt).toISOString(),
  };
}

/** The only production adapter allowed to make Polar API calls. */
export function createBillingProvider(
  config: HostedBillingConfig,
  injectedClient?: Polar,
): BillingProvider {
  const client = injectedClient ?? createPolarClient(config);

  async function checkoutWithCustomer(
    value: Awaited<ReturnType<Polar["checkouts"]["get"]>>,
  ) {
    if (value.externalCustomerId || !value.customerId) return checkout(value);
    const customer = await client.customers.get({ id: value.customerId });
    return checkout(value, customer.externalId ?? null);
  }

  return {
    async createCheckout(input) {
      const customer = await ensurePolarWorkspaceCustomer(client, input);
      const value = await client.checkouts.create({
        products: input.productIds,
        customerId: customer.id,
        allowTrial: false,
        allowDiscountCodes: true,
        successUrl: input.successUrl,
        returnUrl: input.returnUrl,
        metadata: input.metadata,
      });
      if (value.customerId !== customer.id)
        throw new Error("Provider checkout belongs to another customer");
      return checkout(value, input.externalCustomerId);
    },
    async getCheckout(id) {
      return checkoutWithCustomer(await client.checkouts.get({ id }));
    },
    async listOpenCheckouts(externalCustomerId) {
      let customer: Awaited<ReturnType<Polar["customers"]["getExternal"]>>;
      try {
        customer = workspaceCustomer(
          await client.customers.getExternal({
            externalId: externalCustomerId,
          }),
          externalCustomerId,
        );
      } catch (error) {
        if (polarStatus(error) === 404) return [];
        throw error;
      }
      const page = await client.checkouts.list({
        customerId: customer.id,
        status: "open",
        sorting: ["-created_at"],
        limit: 100,
      });
      if (page.result.pagination.totalCount > 100)
        throw new Error("Provider checkout result exceeds recovery bound");
      return page.result.items.map((value) =>
        checkout(value, externalCustomerId),
      );
    },
    async updateCheckout(id, input) {
      return checkoutWithCustomer(
        await client.checkouts.update({
          id,
          checkoutUpdate: {
            productId: input.selectedProductId,
            allowTrial: false,
            metadata: input.metadata,
          },
        }),
      );
    },
    async listSubscriptions(externalCustomerId) {
      const page = await client.subscriptions.list({
        externalCustomerId,
        limit: 100,
        sorting: ["-current_period_end"],
      });
      if (page.result.pagination.totalCount > 100)
        throw new Error("Provider subscription result exceeds recovery bound");
      return page.result.items.map(subscription);
    },
    async updateSubscription(id, input) {
      return subscription(
        await client.subscriptions.update({
          id,
          subscriptionUpdate: {
            productId: input.selectedProductId,
            prorationBehavior: input.prorationBehavior,
          },
        }),
      );
    },
    async createPortalSession(externalCustomerId, returnUrl) {
      const session = await client.customerSessions.create({
        externalCustomerId,
        externalMemberId: externalCustomerId,
        returnUrl,
      });
      return {
        url: session.customerPortalUrl,
        expiresAt: session.expiresAt.getTime(),
        customerId: session.customerId,
      };
    },
  };
}
