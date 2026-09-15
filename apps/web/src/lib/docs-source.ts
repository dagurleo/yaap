import { defineDocs } from "fumadocs-mdx/macro";
import { loader } from "fumadocs-core/source";

export const docs = defineDocs({
  dir: "content/docs",
  docs: { async: true, postprocess: { includeProcessedMarkdown: true } },
});
export const source = loader({
  baseUrl: "/docs",
  source: docs.toFumadocsSource(),
});
