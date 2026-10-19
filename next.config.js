/** @type {import('next').NextConfig} */
const nextConfig = {
  // The customer-facing landing page is one static HTML file
  // (public/bioground/index.html, 5 languages). Serve it at the site root.
  async rewrites() {
    return [
      { source: "/", destination: "/bioground/index.html" },
      { source: "/bioground", destination: "/bioground/index.html" }
    ];
  },
  async headers() {
    return [
      {
        source: "/admin/:path*",
        headers: [
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
          { key: "Cache-Control", value: "no-store" }
        ]
      }
    ];
  }
};

module.exports = nextConfig;
