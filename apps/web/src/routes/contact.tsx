import { createFileRoute } from "@tanstack/react-router";
import { ContactPage } from "@/features/landing/trust-pages";
import landingStyles from "@/features/landing/landing.css?url";
import { registrationAvailableFn } from "@/features/dashboard/functions";

export const Route = createFileRoute("/contact")({
  loader: () => registrationAvailableFn(),
  head: () => ({
    meta: [
      { title: "Contact — Yaap" },
      {
        name: "description",
        content:
          "Find Yaap documentation, product support, billing help and privacy contacts.",
      },
    ],
    links: [{ rel: "stylesheet", href: landingStyles }],
  }),
  component: () => <ContactPage hosted={Route.useLoaderData()} />,
});
