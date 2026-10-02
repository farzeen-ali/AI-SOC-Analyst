import type { Metadata, Viewport } from "next";
import { Inter, Inter_Tight, JetBrains_Mono } from "next/font/google";

import { ThemeProvider } from "@/components/theme-provider";
import { StructuredData } from "@/components/seo/structured-data";
import { env } from "@/lib/env";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

/**
 * Type system: Inter for UI text, Inter Tight for display headings (same
 * skeleton, tighter fit so large sizes hold together), JetBrains Mono for
 * telemetry — log lines, IDs, and severity chips.
 */
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const interTight = Inter_Tight({
  variable: "--font-inter-tight",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  display: "swap",
});

const SITE_NAME = "GuardAI";
const SITE_DESCRIPTION =
  "GuardAI is an AI-powered SOC analyst. It ingests your security logs, " +
  "detects threats with retrieval-augmented analysis, and returns ranked " +
  "incidents with remediation already drafted — cutting MTTD and MTTR for " +
  "enterprise security teams.";

export const metadata: Metadata = {
  // Makes every relative OG/canonical URL below resolve correctly.
  metadataBase: new URL(env.siteUrl),
  title: {
    default: "GuardAI — AI SOC Analyst for Automated Threat Detection",
    template: "%s · GuardAI",
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  generator: null,
  referrer: "strict-origin-when-cross-origin",
  authors: [{ name: SITE_NAME }],
  creator: SITE_NAME,
  publisher: SITE_NAME,
  /*
   * Keywords carry little weight with classic search engines, but answer
   * engines do read them as topical hints. These mirror the questions the
   * product actually answers rather than stuffing volume terms.
   */
  keywords: [
    "AI SOC analyst",
    "automated threat detection",
    "security log analysis",
    "SIEM alternative",
    "incident response automation",
    "MTTD MTTR reduction",
    "RAG threat intelligence",
    "multi-tenant security platform",
    "SOC automation software",
    "log ingestion and triage",
  ],
  category: "Security Software",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    title: "GuardAI — AI SOC Analyst for Automated Threat Detection",
    description: SITE_DESCRIPTION,
    url: "/",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "GuardAI — AI SOC Analyst",
    description: SITE_DESCRIPTION,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  formatDetection: { telephone: false, address: false, email: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbfafa" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0707" },
  ],
  colorScheme: "dark light",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      data-scroll-behavior="smooth"
      className={`${inter.variable} ${interTight.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <head>
        {/* Warms the TLS handshake to Supabase before the first auth call. */}
        <link rel="preconnect" href={env.supabaseOrigin} crossOrigin="" />
        <link rel="dns-prefetch" href={env.supabaseOrigin} />
        {/*
          JSON-LD lives in <head> rather than <body>. Both are valid for
          crawlers, but React warns about a <script> rendered inside the body
          tree on every page load, and the warning buries real errors.
        */}
        <StructuredData />
      </head>
      <body className="flex min-h-full flex-col bg-background text-foreground">
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem
          disableTransitionOnChange
        >
          {children}
          <Toaster position="top-center" richColors closeButton />
        </ThemeProvider>
      </body>
    </html>
  );
}
