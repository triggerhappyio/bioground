import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";

// One public page: the landing page (language is switched on the page).
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: `${siteUrl()}/`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1
    }
  ];
}
