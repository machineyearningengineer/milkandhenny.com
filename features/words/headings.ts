import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";
import { assignHeadingIds } from "@/lib/markdown/rehype-slug";

const parser = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkRehype, { allowDangerousHtml: true });

export function extractHeadings(content: string) {
  return assignHeadingIds(parser.runSync(parser.parse(content)));
}
