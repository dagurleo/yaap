const publicPages = new Set([
  "/",
  "/pricing",
  "/privacy",
  "/terms",
  "/security",
  "/contact",
]);

export function publicPagePath(path: string): string | null {
  const normalized = path.length > 1 ? path.replace(/\/$/, "") : path;
  if (publicPages.has(normalized)) return normalized;
  if (normalized === "/index.md") return "/";
  const htmlPath = normalized.replace(/\.md$/, "");
  return normalized.endsWith(".md") && publicPages.has(htmlPath)
    ? htmlPath
    : null;
}

export function wantsMarkdown(request: Request): boolean {
  if (!publicPagePath(new URL(request.url).pathname)) return false;
  if (new URL(request.url).pathname.endsWith(".md")) return true;
  const accepted = (request.headers.get("Accept") ?? "")
    .toLowerCase()
    .split(",")
    .map((part) => {
      const [type, ...params] = part.trim().split(";");
      const q = params.find((p) => p.trim().startsWith("q="));
      const quality = q ? Number(q.trim().slice(2)) : 1;
      return {
        type: type.trim(),
        quality: quality >= 0 && quality <= 1 ? quality : 0,
      };
    });
  const markdown =
    accepted.find((a) => a.type === "text/markdown")?.quality ?? 0;
  const html =
    accepted.find((a) => a.type === "text/html")?.quality ??
    accepted.find((a) => a.type === "text/*")?.quality ??
    accepted.find((a) => a.type === "*/*")?.quality ??
    0;
  return markdown > 0 && markdown >= html;
}

function decodeEntities(text: string): string {
  const named: Record<string, string> = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: " ",
  };
  return text.replace(
    /&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi,
    (raw, entity: string) => {
      if (!entity.startsWith("#")) return named[entity.toLowerCase()] ?? raw;
      const point =
        entity[1].toLowerCase() === "x"
          ? parseInt(entity.slice(2), 16)
          : Number(entity.slice(1));
      return point > 0 &&
        point <= 0x10ffff &&
        !(point >= 0xd800 && point <= 0xdfff)
        ? String.fromCodePoint(point)
        : "\uFFFD";
    },
  );
}

// Convert only the public <main>. The same SSR copy supplies HTML and Markdown;
// scripts, navigation, decorative mockups and hidden content are never included.
export async function publicMarkdown(
  response: Response,
  url: URL,
): Promise<Response> {
  if (
    !response.ok ||
    !response.headers.get("Content-Type")?.includes("text/html")
  )
    return response;
  let mainDepth = 0;
  let skipped = 0;
  let inHeading = false;
  const chunks: string[] = [];
  const rewriter = new HTMLRewriter()
    .on("main", {
      element(element) {
        mainDepth++;
        element.onEndTag(() => {
          mainDepth--;
        });
      },
      text(chunk) {
        if (mainDepth && !skipped) chunks.push(chunk.text);
      },
    })
    .on("main *", {
      element(element) {
        if (!mainDepth) return;
        const tag = element.tagName;
        const replacement = element.getAttribute("data-markdown");
        if (!skipped && replacement !== null)
          chunks.push(`\n\n${replacement}\n\n`);
        const skip =
          ["script", "style", "svg", "nav", "aside"].includes(tag) ||
          element.getAttribute("aria-hidden") === "true" ||
          element.hasAttribute("hidden") ||
          element.hasAttribute("data-markdown-skip") ||
          replacement !== null;
        // Void elements cannot have descendants or an end-tag callback.
        if (
          [
            "img",
            "input",
            "br",
            "hr",
            "wbr",
            "source",
            "area",
            "embed",
            "link",
            "meta",
            "param",
            "track",
            "col",
            "base",
          ].includes(tag)
        ) {
          if (!skipped && !skip && ["br", "hr"].includes(tag))
            chunks.push(inHeading ? " " : "\n");
          return;
        }
        if (skip) {
          skipped++;
          element.onEndTag(() => {
            skipped--;
          });
          return;
        }
        if (skipped) return;
        let end = "";
        if (/^h[1-6]$/.test(tag)) {
          inHeading = true;
          chunks.push(`\n\n${"#".repeat(Number(tag[1]))} `);
          end = "\n\n";
        } else if (
          [
            "p",
            "section",
            "div",
            "ul",
            "ol",
            "dl",
            "details",
            "table",
            "tr",
          ].includes(tag)
        ) {
          chunks.push("\n\n");
          end = "\n\n";
        } else if (tag === "li") {
          chunks.push("\n- ");
          end = "\n";
        } else if (["dt", "dd", "summary"].includes(tag)) {
          chunks.push("\n");
          end = "\n";
        } else if (tag === "a") {
          const href = element.getAttribute("href");
          if (href) {
            const target = new URL(decodeEntities(href), url);
            if (["https:", "http:", "mailto:"].includes(target.protocol)) {
              chunks.push("[");
              end = `](<${target.href}>)`;
            }
          }
        } else if (["td", "th"].includes(tag)) end = " | ";
        if (end)
          element.onEndTag(() => {
            chunks.push(end);
            if (/^h[1-6]$/.test(tag)) inHeading = false;
          });
      },
    });
  await rewriter.transform(response).text();
  const body = decodeEntities(chunks.join(""))
    .replace(/[\t ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  const headers = new Headers(response.headers);
  for (const name of [
    "Content-Length",
    "Content-Encoding",
    "ETag",
    "Last-Modified",
  ])
    headers.delete(name);
  headers.set("Content-Type", "text/markdown; charset=utf-8");
  headers.set("Content-Location", url.href);
  return new Response(`${body}\n`, { status: response.status, headers });
}
