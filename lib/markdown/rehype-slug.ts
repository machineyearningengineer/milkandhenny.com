import { uniqueHeadingIds } from "./slug";

type HastNode = {
  type: string;
  tagName?: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
};

type Heading = { label: string; properties: Record<string, unknown> };

const HEADING_TAGS = new Set(["h1", "h2", "h3"]);

function getTextContent(node: HastNode): string {
  if (node.type === "text") return node.value ?? "";
  return node.children?.map(getTextContent).join("") ?? "";
}

function collectHeadings(node: HastNode, headings: Heading[]): void {
  if (node.type === "element" && node.properties && HEADING_TAGS.has(node.tagName ?? "")) {
    headings.push({ label: getTextContent(node).trim(), properties: node.properties });
    return;
  }

  for (const child of node.children ?? []) collectHeadings(child, headings);
}

export function assignHeadingIds(tree: HastNode) {
  const headings: Heading[] = [];
  collectHeadings(tree, headings);
  const items = uniqueHeadingIds(headings.map(({ label }) => label));
  headings.forEach(({ properties }, index) => {
    properties.id = items[index].id;
  });
  return items;
}

export function rehypeSlug() {
  return (tree: HastNode) => {
    assignHeadingIds(tree);
  };
}
