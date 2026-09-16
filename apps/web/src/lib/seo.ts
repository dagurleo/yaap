import { repositoryUrl } from "../features/landing/policy-details";

export const productPages = [
  "/self-hosted-web-analytics",
  "/conversion-tracking",
  "/revenue-attribution",
];

// Escape HTML delimiters before embedding JSON in a script element.
export function serializeJsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

export function publicSeo({
  origin,
  path,
  title,
  description,
  noindex = false,
  breadcrumbs,
}: {
  origin: string;
  path: string;
  title: string;
  description: string;
  noindex?: boolean;
  breadcrumbs?: { name: string; path: string }[];
}) {
  const url = new URL(path, origin).href;
  const image = new URL("/brand/social-card.png", origin).href;
  const graph: Record<string, unknown>[] = [
    {
      "@type": "WebPage",
      "@id": `${url}#webpage`,
      url,
      name: title,
      description,
      inLanguage: "en",
      isPartOf: { "@id": `${origin}/#website` },
      ...(breadcrumbs ? { breadcrumb: { "@id": `${url}#breadcrumbs` } } : {}),
    },
  ];
  if (path === "/") {
    graph.push(
      {
        "@type": "Organization",
        "@id": `${origin}/#organization`,
        name: "Yaap",
        url: origin,
        logo: `${origin}/brand/apple-touch-icon.png`,
        sameAs: [repositoryUrl],
      },
      {
        "@type": "WebSite",
        "@id": `${origin}/#website`,
        name: "Yaap",
        alternateName: "Yet another analytics platform",
        url: `${origin}/`,
        publisher: { "@id": `${origin}/#organization` },
        inLanguage: "en",
      },
    );
  }
  if (breadcrumbs) {
    graph.push({
      "@type": "BreadcrumbList",
      "@id": `${url}#breadcrumbs`,
      itemListElement: breadcrumbs.map((item, index) => ({
        "@type": "ListItem",
        position: index + 1,
        name: item.name,
        item: new URL(item.path, origin).href,
      })),
    });
  }
  return {
    meta: [
      { title },
      { name: "description", content: description },
      {
        name: "robots",
        content: noindex
          ? "noindex, follow"
          : "index, follow, max-image-preview:large",
      },
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: "Yaap" },
      { property: "og:locale", content: "en_US" },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:url", content: url },
      { property: "og:image", content: image },
      { property: "og:image:type", content: "image/png" },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      {
        property: "og:image:alt",
        content: "Yaap — Web analytics, from first visit to revenue.",
      },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: title },
      { name: "twitter:description", content: description },
      { name: "twitter:image", content: image },
      {
        name: "twitter:image:alt",
        content: "Yaap — Web analytics, from first visit to revenue.",
      },
    ],
    links: [{ rel: "canonical", href: url }],
    scripts: [
      {
        type: "application/ld+json",
        children: serializeJsonLd({
          "@context": "https://schema.org",
          "@graph": graph,
        }),
      },
    ],
  };
}
