import { createFileRoute } from "@tanstack/react-router";
import { SecurityPage } from "@/features/landing/trust-pages";
import landingStyles from "@/features/landing/landing.css?url";
import { registrationAvailableFn } from "@/features/dashboard/functions";

export const Route = createFileRoute("/security")({
  loader: () => registrationAvailableFn(),
  head: () => ({
    meta: [
      { title: "Security — Yaap" },
      {
        name: "description",
        content:
          "Learn how Yaap handles website access, collection controls and infrastructure security.",
      },
    ],
    links: [{ rel: "stylesheet", href: landingStyles }],
  }),
  component: () => <SecurityPage hosted={Route.useLoaderData()} />,
});
