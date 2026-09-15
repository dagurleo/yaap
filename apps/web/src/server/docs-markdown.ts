import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkStringify from "remark-stringify";

export interface PublicDoc {
  url: string;
  title: string;
  description: string;
  getMarkdown: () => Promise<string>;
}

const markdown = unified().use(remarkParse).use(remarkGfm).use(remarkStringify);

// Rewrite link/image/definition destinations in the syntax tree, never code examples.
export function absoluteMarkdown(content: string, url: string): string {
  const tree = markdown.parse(content);
  function walk(node: {
    type: string;
    url?: string;
    children?: typeof tree.children;
  }) {
    if (["link", "image", "definition"].includes(node.type) && node.url) {
      const target = new URL(node.url, url);
      if (["http:", "https:", "mailto:"].includes(target.protocol))
        node.url = target.href;
    }
    for (const child of node.children ?? []) walk(child);
  }
  walk(tree);
  return markdown.stringify(tree);
}

export async function renderDoc(
  doc: PublicDoc,
  origin: string,
): Promise<string> {
  const url = origin + doc.url;
  return `# ${doc.title}\n\n> ${doc.description}\n\nSource: ${url}\nMarkdown: ${url}.md\n\n${absoluteMarkdown(await doc.getMarkdown(), url)}`;
}
