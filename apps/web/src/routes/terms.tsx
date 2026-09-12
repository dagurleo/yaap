import { createFileRoute } from "@tanstack/react-router";
import { TermsPage } from "@/features/landing/trust-pages";
import landingStyles from "@/features/landing/landing.css?url";
import { registrationAvailableFn } from "@/features/dashboard/functions";
import { policyDetails } from "@/features/landing/policy-details";

export const Route = createFileRoute("/terms")({
  loader: () => registrationAvailableFn(),
  head: () => ({
    meta: [
      { title: "Terms of Service — Yaap" },
      {
        name: "description",
        content:
          "Terms for hosted Yaap, including accounts, billing, usage and the self-hosted software license.",
      },
      ...(policyDetails.legalDraft
        ? [{ name: "robots", content: "noindex, nofollow" }]
        : []),
    ],
    links: [{ rel: "stylesheet", href: landingStyles }],
  }),
  component: () => <TermsPage hosted={Route.useLoaderData()} />,
});
