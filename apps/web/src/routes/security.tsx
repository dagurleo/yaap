import { publicSeo } from "@/lib/seo";
import { createFileRoute } from "@tanstack/react-router";
import { SecurityPage } from "@/features/landing/trust-pages";
import landingStyles from "@/features/landing/landing.css?url";
import { registrationAvailableFn } from "@/features/dashboard/functions";

export const Route = createFileRoute("/security")({
  loader: () => registrationAvailableFn(),
  head: ({ match }) => {
    const seo = publicSeo({
      origin: match.context.seoOrigin,
      path: "/security",
      title: "Security and Data Controls \u2014 Yaap",
      description:
        "Explore Yaap security controls for website access, event collection, payment integrations and self-hosted analytics infrastructure.",
      breadcrumbs: [
        { name: "Home", path: "/" },
        { name: "Security and Data Controls", path: "/security" },
      ],
    });
    return {
      ...seo,
      links: [...seo.links, { rel: "stylesheet", href: landingStyles }],
    };
  },
  component: () => <SecurityPage hosted={Route.useLoaderData()} />,
});
