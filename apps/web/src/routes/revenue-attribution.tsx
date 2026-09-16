import { createFileRoute } from "@tanstack/react-router";
import { registrationAvailableFn } from "@/features/dashboard/functions";
import {
  ProductGuidePage,
  productGuides,
} from "@/features/landing/product-pages";
import landingStyles from "@/features/landing/landing.css?url";
import { publicSeo } from "@/lib/seo";

const guide = productGuides.revenue;
export const Route = createFileRoute("/revenue-attribution")({
  loader: () => registrationAvailableFn(),
  head: ({ match }) => {
    const seo = publicSeo({
      origin: match.context.seoOrigin,
      path: guide.path,
      title: `${guide.title} — Yaap`,
      description: guide.description,
      breadcrumbs: [
        { name: "Home", path: "/" },
        { name: guide.title, path: guide.path },
      ],
    });
    return {
      ...seo,
      links: [...seo.links, { rel: "stylesheet", href: landingStyles }],
    };
  },
  component: () => (
    <ProductGuidePage guide={guide} hosted={Route.useLoaderData()} />
  ),
});
