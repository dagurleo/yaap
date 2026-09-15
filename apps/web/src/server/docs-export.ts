import { source } from "../lib/docs-source";
import type { PublicDoc } from "./docs-markdown";

// Content is compiled into the Worker; never read the source filesystem at runtime.
export function getPublicDocs(): PublicDoc[] {
  return source.getPages().map((page) => ({
    url: page.url,
    title: page.data.title,
    description: page.data.description ?? "",
    getMarkdown: () => page.data.getText("processed"),
  }));
}
