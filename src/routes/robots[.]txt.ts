import { createFileRoute } from "@tanstack/react-router";

import { PUBLIC_DISCOVERY_CACHE_CONTROL } from "@/lib/shared/media-cache";
import { absoluteUrl } from "@/lib/shared/seo";

export const Route = createFileRoute("/robots.txt")({
  server: {
    handlers: {
      GET: () =>
        new Response(`User-agent: *\nAllow: /\n\nSitemap: ${absoluteUrl("/sitemap.xml")}\n`, {
          headers: {
            "Cache-Control": PUBLIC_DISCOVERY_CACHE_CONTROL,
            "Content-Type": "text/plain; charset=utf-8",
          },
        }),
    },
  },
});
