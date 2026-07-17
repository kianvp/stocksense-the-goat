import type { MetadataRoute } from "next";
import { GATED_ROUTES, SITE_URL } from "@/lib/site";

// Metadata routes are Route Handlers, so `output: "export"` requires them to be
// explicitly static — otherwise the build refuses to collect them.
export const dynamic = "force-static";

// Only the marketing landing page is public; every app route sits behind the
// Worker's sign-in gate and answers 401, so keep crawlers off them.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: GATED_ROUTES.map((r) => `${r}/`),
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
