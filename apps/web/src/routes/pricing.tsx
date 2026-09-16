import { publicSeo } from "@/lib/seo";
import { createFileRoute } from "@tanstack/react-router";
import { PricingPage } from "@/features/landing/pricing";
import landingStyles from "@/features/landing/landing.css?url";
import { registrationAvailableFn } from "@/features/dashboard/functions";

export const Route = createFileRoute("/pricing")({
  loader: () => registrationAvailableFn(),
  head: ({ match }) => {
    const seo = publicSeo({
      origin: match.context.seoOrigin,
      path: "/pricing",
      title: "Web Analytics Pricing \u2014 From $9/month | Yaap",
      description:
        "Hosted web analytics from $9/month for 100,000 events. Unlimited websites, conversion funnels and revenue attribution. Try free for 14 days or self-host.",
      breadcrumbs: [
        { name: "Home", path: "/" },
        { name: "Web Analytics Pricing", path: "/pricing" },
      ],
    });
    return {
      ...seo,
      links: [...seo.links, { rel: "stylesheet", href: landingStyles }],
    };
  },
  component: () => <PricingPage hosted={Route.useLoaderData()} />,
});
