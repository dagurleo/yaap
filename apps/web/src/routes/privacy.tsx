import { publicSeo } from "@/lib/seo";
import { createFileRoute } from "@tanstack/react-router";
import { PrivacyPage } from "@/features/landing/trust-pages";
import landingStyles from "@/features/landing/landing.css?url";
import { registrationAvailableFn } from "@/features/dashboard/functions";
import { policyDetails } from "@/features/landing/policy-details";

export const Route = createFileRoute("/privacy")({
  loader: () => registrationAvailableFn(),
  head: ({ match }) => {
    const seo = publicSeo({
      origin: match.context.seoOrigin,
      path: "/privacy",
      title: "Privacy Policy \u2014 Yaap",
      description:
        "How Yaap handles account information, analytics data, browser storage and privacy requests.",
      noindex: policyDetails.legalDraft,
      breadcrumbs: [
        { name: "Home", path: "/" },
        { name: "Privacy Policy", path: "/privacy" },
      ],
    });
    return {
      ...seo,
      links: [...seo.links, { rel: "stylesheet", href: landingStyles }],
    };
  },
  component: () => <PrivacyPage hosted={Route.useLoaderData()} />,
});
