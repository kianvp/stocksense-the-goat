import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

// Required for `output: "export"` — see the note in robots.ts.
export const dynamic = "force-static";

// The landing page is the only publicly reachable URL — everything else is
// gated, so listing it here would just advertise 401s.
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: `${SITE_URL}/`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1,
    },
  ];
}
