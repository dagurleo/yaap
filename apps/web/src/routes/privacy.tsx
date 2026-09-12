import { createFileRoute } from "@tanstack/react-router";
import { PrivacyPage } from "@/features/landing/trust-pages";
import landingStyles from "@/features/landing/landing.css?url";
import { registrationAvailableFn } from "@/features/dashboard/functions";
import { policyDetails } from "@/features/landing/policy-details";

export const Route = createFileRoute("/privacy")({
  loader: () => registrationAvailableFn(),
  head: () => ({
    meta: [
      { title: "Privacy Policy — Yaap" },
      {
        name: "description",
        content:
          "How Yaap handles account information, analytics data, browser storage and privacy requests.",
      },
      ...(policyDetails.legalDraft
        ? [{ name: "robots", content: "noindex, nofollow" }]
        : []),
    ],
    links: [{ rel: "stylesheet", href: landingStyles }],
  }),
  component: () => <PrivacyPage hosted={Route.useLoaderData()} />,
});
