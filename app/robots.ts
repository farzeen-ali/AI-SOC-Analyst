import type { MetadataRoute } from "next";

import { env } from "@/lib/env";

/**
 * Crawl rules.
 *
 * The private surface is disallowed explicitly as well as being `noindex`,
 * so a crawler does not waste budget on routes that will only redirect it to
 * the sign-in page. AI answer engines are allowed on the marketing pages —
 * being quotable is the point of the security and pricing copy.
 */
export default function robots(): MetadataRoute.Robots {
  const disallow = [
    "/dashboard",
    "/dashboard/",
    "/settings",
    "/settings/",
    "/super-admin",
    "/super-admin/",
    "/api/",
    "/auth/",
    "/mfa",
    "/reset-password",
    "/verify-otp",
    "/check-email",
    "/auth-error",
  ];

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow,
      },
    ],
    sitemap: `${env.siteUrl}/sitemap.xml`,
    host: env.siteUrl,
  };
}
