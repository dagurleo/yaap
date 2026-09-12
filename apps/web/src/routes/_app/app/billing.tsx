import { BillingPage } from "@/features/dashboard/billing-page";
import { billingQuery } from "@/features/dashboard/queries";
import { createFileRoute, redirect } from "@tanstack/react-router";

type BillingSearch = {
  billing?: "pending" | "cancelled" | "return";
};

export const Route = createFileRoute("/_app/app/billing")({
  beforeLoad: ({ context }) => {
    if (!context.access.user?.ownsAccount) throw redirect({ to: "/app" });
  },
  validateSearch: (search: Record<string, unknown>): BillingSearch => ({
    billing:
      search.billing === "pending" ||
      search.billing === "cancelled" ||
      search.billing === "return"
        ? search.billing
        : undefined,
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(billingQuery()),
  head: () => ({ meta: [{ title: "Billing · Yaap" }] }),
  component: BillingRoute,
});

function BillingRoute() {
  return <BillingPage search={Route.useSearch()} />;
}
