import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { WordBody } from "@/features/words/components/ui/WordBody";
import { extractHeadings } from "@/features/words/headings";

it("matches jump labels and IDs to the rendered article for rich Markdown headings", () => {
  const markdown = [
    "## [Guide](https://example.com) &amp; **tips**",
    "",
    "Guide & tips",
    "------------",
    "",
    "```md",
    "# Code, not a heading",
    "`````",
    "",
    "### Guide & tips",
    "",
    "#### A heading below the rail's depth",
  ].join("\n");

  const html = renderToStaticMarkup(createElement(WordBody, { content: markdown }));
  const headings = extractHeadings(markdown);

  expect(headings).toEqual([
    { id: "guide--tips", label: "Guide & tips" },
    { id: "guide--tips-1", label: "Guide & tips" },
    { id: "guide--tips-2", label: "Guide & tips" },
  ]);
  expect(Array.from(html.matchAll(/<h[23] id="([^"]+)"/g), ([, id]) => id)).toEqual(
    headings.map(({ id }) => id),
  );
});
