/** @type {import('next').NextConfig} */

const isDev = process.env.NODE_ENV === "development";
// Vercel Toolbar (comments/feedback) runs on preview deployments only.
const toolbar = !!process.env.VERCEL_ENV && process.env.VERCEL_ENV !== "production";
const onVercel = !!process.env.VERCEL;

// The landing page is one static file with inline <script>/<style>, and the
// admin is Next.js (inline hydration scripts), so 'unsafe-inline' is needed
// for scripts and styles. Everything else is locked to this origin plus
// Google Fonts and Vercel Analytics / Speed Insights (served from
// /_vercel/* on this origin; vitals.vercel-insights.com is the legacy
// collector). 'unsafe-eval' only in `next dev` (React debugging).
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}${toolbar ? " https://vercel.live" : ""}`,
  `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com${toolbar ? " https://vercel.live" : ""}`,
  `font-src 'self' data: https://fonts.gstatic.com${toolbar ? " https://vercel.live https://assets.vercel.com" : ""}`,
  `img-src 'self' data: blob:${toolbar ? " https://vercel.live https://vercel.com" : ""}`,
  `connect-src 'self' https://vitals.vercel-insights.com${toolbar ? " https://vercel.live wss://ws-us3.pusher.com" : ""}`,
  `frame-src ${toolbar ? "https://vercel.live" : "'none'"}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  // Only over real HTTPS — on http://localhost it would break `next start`.
  onVercel ? "upgrade-insecure-requests" : ""
]
  .filter(Boolean)
  .join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), browsing-topics=()" }
];

const nextConfig = {
  // "/" is served by app/route.ts, which reads the landing page file and
  // fills in the site URL for canonical / Open Graph tags. Make sure that
  // file ships with the serverless function.
  outputFileTracingIncludes: {
    "/": ["./public/bioground/index.html"]
  },
  async rewrites() {
    return [{ source: "/bioground", destination: "/" }];
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      {
        source: "/admin/:path*",
        headers: [
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
          { key: "Cache-Control", value: "no-store" }
        ]
      },
      {
        // Raw template (unfilled __SITE_URL__ placeholders) — the real page is "/".
        source: "/bioground/index.html",
        headers: [{ key: "X-Robots-Tag", value: "noindex" }]
      }
    ];
  }
};

module.exports = nextConfig;
