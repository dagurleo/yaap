import { createFileRoute } from "@tanstack/react-router";
import { LandingPage } from "@/features/landing/landing-page";
import landingStyles from "@/features/landing/landing.css?url";
import { registrationAvailableFn } from "@/features/dashboard/functions";

export const Route = createFileRoute("/")({
  loader: () => registrationAvailableFn(),
  head: () => ({
    meta: [
      { title: "Yaap — Yet another analytics platform" },
      {
        name: "description",
        content:
          "Open-source web analytics, from first visit to revenue. Self-host Yaap in your own Cloudflare account.",
      },
    ],
    links: [{ rel: "stylesheet", href: landingStyles }],
  }),
  component: () => <LandingPage hosted={Route.useLoaderData()} />,
});
