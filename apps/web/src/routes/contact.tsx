import { publicSeo } from "@/lib/seo";
import { createFileRoute } from "@tanstack/react-router";
import { ContactPage } from "@/features/landing/trust-pages";
import landingStyles from "@/features/landing/landing.css?url";
import { registrationAvailableFn } from "@/features/dashboard/functions";

export const Route = createFileRoute("/contact")({
  loader: () => registrationAvailableFn(),
  head: ({ match }) => {
    const seo = publicSeo({
      origin: match.context.seoOrigin,
      path: "/contact",
      title: "Contact Yaap \u2014 Support and Product Help",
      description:
        "Get help with Yaap web analytics, self-hosting, billing and integrations. Find setup documentation, report an issue or contact the Yaap team.",
      breadcrumbs: [
        { name: "Home", path: "/" },
        { name: "Contact Yaap", path: "/contact" },
      ],
    });
    return {
      ...seo,
      links: [...seo.links, { rel: "stylesheet", href: landingStyles }],
    };
  },
  component: () => <ContactPage hosted={Route.useLoaderData()} />,
});
