import { createFileRoute } from "@tanstack/react-router";
import { PricingPage } from "@/features/landing/pricing";
import landingStyles from "@/features/landing/landing.css?url";
import { registrationAvailableFn } from "@/features/dashboard/functions";

export const Route = createFileRoute("/pricing")({
  loader: () => registrationAvailableFn(),
  head: () => ({
    meta: [
      { title: "Pricing — Yaap" },
      {
        name: "description",
        content:
          "One plan, unlimited websites, every core feature. Explore Yaap hosted pricing from $9 per month for 100,000 events, or self-host on your own infrastructure.",
      },
    ],
    links: [{ rel: "stylesheet", href: landingStyles }],
  }),
  component: () => <PricingPage hosted={Route.useLoaderData()} />,
});
