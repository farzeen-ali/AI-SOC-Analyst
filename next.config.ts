import type { NextConfig } from "next";

/**
 * Supabase project host, derived from the public URL so `connect-src` can be
 * pinned to this project rather than opened to every subdomain on the
 * internet. Falls back to a wildcard only when the URL is not configured yet.
 */
const supabaseOrigin = (() => {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!raw) return "https://*.supabase.co wss://*.supabase.co";
  try {
    const { host } = new URL(raw);
    return `https://${host} wss://${host}`;
  } catch {
    return "https://*.supabase.co wss://*.supabase.co";
  }
})();

const isDev = process.env.NODE_ENV === "development";

/**
 * Content Security Policy.
 *
 * Everything that can be locked down, is. The one deliberate loosening is
 * `script-src 'unsafe-inline'`:
 *
 *   Next inlines the RSC payload as `self.__next_f.push(...)` <script> tags.
 *   Allowing those with a nonce instead would force every page — including the
 *   statically prerendered marketing pages — into dynamic rendering, which
 *   costs exactly the load-time win those pages exist for. The XSS surface
 *   here is already minimal: no route renders user- or model-supplied HTML.
 *   The single `dangerouslySetInnerHTML` in the codebase emits the JSON-LD
 *   block, whose payload is a server-built constant with no external input.
 *
 *   To upgrade to a nonce CSP, generate one per request in `proxy.ts`, set it
 *   on both the request and response headers, and accept dynamic rendering.
 *
 * `style-src 'unsafe-inline'` is required by Next's critical-CSS inlining.
 * It does not cover CSSOM writes, so Framer Motion is unaffected either way.
 */
const contentSecurityPolicy = [
  `default-src 'self'`,
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  `style-src 'self' 'unsafe-inline'`,
  // Avatars come from Google/Gravatar; blob: is used by the upload preview.
  `img-src 'self' data: blob: https:`,
  // next/font self-hosts, so no external font origin is needed.
  `font-src 'self' data:`,
  `connect-src 'self' ${supabaseOrigin}${isDev ? " ws://localhost:* http://localhost:*" : ""}`,
  `media-src 'self'`,
  `worker-src 'self' blob:`,
  `manifest-src 'self'`,
  `object-src 'none'`,
  `base-uri 'self'`,
  `form-action 'self'`,
  `frame-ancestors 'none'`,
  `frame-src 'none'`,
  `upgrade-insecure-requests`,
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  // Belt-and-braces alongside frame-ancestors, for older browsers.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    // WebAuthn needs publickey-credentials-get/create on our own origin.
    value: [
      "camera=()",
      "microphone=()",
      "geolocation=()",
      "browsing-topics=()",
      "interest-cohort=()",
      "payment=()",
      "usb=()",
      "publickey-credentials-get=(self)",
      "publickey-credentials-create=(self)",
    ].join(", "),
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  { key: "X-DNS-Prefetch-Control", value: "on" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
];

const nextConfig: NextConfig = {
  // Do not advertise the framework version to scanners.
  poweredByHeader: false,
  reactStrictMode: true,

  // Smaller client bundles: only the icons actually imported are shipped.
  experimental: {
    optimizePackageImports: ["lucide-react", "framer-motion"],
  },

  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
      /*
       * Production build assets carry a content hash, so they can be cached
       * forever. This must NOT apply in development: Turbopack reuses chunk
       * URLs across rebuilds, and a year-long immutable cache makes the
       * browser keep serving a stale bundle after every edit.
       */
      ...(isDev
        ? []
        : [
            {
              source: "/_next/static/:path*",
              headers: [
                {
                  key: "Cache-Control",
                  value: "public, max-age=31536000, immutable",
                },
              ],
            },
          ]),
      {
        // Never let an intermediary cache an authenticated API response.
        source: "/api/:path*",
        headers: [{ key: "Cache-Control", value: "no-store" }],
      },
    ];
  },
};

export default nextConfig;
