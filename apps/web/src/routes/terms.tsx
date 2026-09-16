import { publicSeo } from "@/lib/seo";
import { createFileRoute } from "@tanstack/react-router";
import { TermsPage } from "@/features/landing/trust-pages";
import landingStyles from "@/features/landing/landing.css?url";
import { registrationAvailableFn } from "@/features/dashboard/functions";
import { policyDetails } from "@/features/landing/policy-details";

export const Route = createFileRoute("/terms")({
  loader: () => registrationAvailableFn(),
  head: ({ match }) => {
    const seo = publicSeo({
      origin: match.context.seoOrigin,
      path: "/terms",
      title: "Terms of Service \u2014 Yaap",
      description:
        "Terms for hosted Yaap, including accounts, billing, usage and the self-hosted software license.",
      noindex: policyDetails.legalDraft,
      breadcrumbs: [
        { name: "Home", path: "/" },
        { name: "Terms of Service", path: "/terms" },
      ],
    });
    return {
      ...seo,
      links: [...seo.links, { rel: "stylesheet", href: landingStyles }],
    };
  },
  component: () => <TermsPage hosted={Route.useLoaderData()} />,
});
