import "./globals.css";

export const metadata = {
  title: "BioGround Staff",
  robots: { index: false, follow: false }
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          href="https://fonts.googleapis.com/css2?family=Hahmlet:wght@500;700&family=IBM+Plex+Sans+KR:wght@400;600&family=IBM+Plex+Sans:wght@400;600&display=swap"
          rel="stylesheet"
        />
        {/* Vercel Web Analytics + Speed Insights (enable both in the Vercel dashboard). */}
        <script defer src="/_vercel/insights/script.js" />
        <script defer src="/_vercel/speed-insights/script.js" />
      </head>
      <body>{children}</body>
    </html>
  );
}
