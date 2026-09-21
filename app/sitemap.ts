import type { MetadataRoute } from "next";

import { env } from "@/lib/env";

/**
 * Only the public marketing surface belongs in the sitemap.
 *
 * Authenticated routes are deliberately absent — they are already `noindex`
 * and behind the route guard, and listing them would just publish a map of
 * the application's private surface.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = env.siteUrl;
  const lastModified = new Date();

  return [
    { url: base, lastModified, changeFrequency: "weekly", priority: 1 },
    {
      url: `${base}/pricing`,
      lastModified,
      changeFrequency: "monthly",
      priority: 0.9,
    },
    {
      url: `${base}/security`,
      lastModified,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${base}/signup`,
      lastModified,
      changeFrequency: "monthly",
      priority: 0.7,
    },
    {
      url: `${base}/login`,
      lastModified,
      changeFrequency: "yearly",
      priority: 0.4,
    },
    {
      url: `${base}/privacy`,
      lastModified,
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${base}/terms`,
      lastModified,
      changeFrequency: "yearly",
      priority: 0.3,
    },
  ];
}
