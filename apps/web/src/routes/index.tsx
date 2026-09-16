import { publicSeo } from "@/lib/seo";
import { demoAvailableFn } from "@/features/dashboard/public-functions";
import { createFileRoute } from "@tanstack/react-router";
import { LandingPage } from "@/features/landing/landing-page";
import landingStyles from "@/features/landing/landing.css?url";
import { registrationAvailableFn } from "@/features/dashboard/functions";

export const Route = createFileRoute("/")({
  loader: async () => {
    const [hosted, demoAvailable] = await Promise.all([
      registrationAvailableFn(),
      demoAvailableFn(),
    ]);
    return { hosted, demoAvailable };
  },
  head: ({ match }) => {
    const seo = publicSeo({
      origin: match.context.seoOrigin,
      path: "/",
      title: "Web Analytics, from First Visit to Revenue \u2014 Yaap",
      description:
        "Track website traffic, conversion funnels and revenue attribution with Yaap. Source-available web analytics, hosted or self-hosted on Cloudflare.",
    });
    return {
      ...seo,
      links: [...seo.links, { rel: "stylesheet", href: landingStyles }],
    };
  },
  component: () => <LandingPage {...Route.useLoaderData()} />,
});
