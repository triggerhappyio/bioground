import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse, type NextRequest } from "next/server";
import { renderLanding, siteUrl } from "@/lib/site";

// "/" — the customer landing page (public/bioground/index.html, 5 languages).
// Served through this handler instead of as a raw static file so the
// canonical and Open Graph URLs point at the real production domain.
export const runtime = "nodejs";

let template: Promise<string> | null = null;

export async function GET(req: NextRequest) {
  template ??= readFile(path.join(process.cwd(), "public", "bioground", "index.html"), "utf8");
  const html = renderLanding(await template, siteUrl(req.nextUrl.origin));
  return new NextResponse(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      // Same content until the next deploy (Vercel clears its CDN cache on
      // every deploy), so let the edge cache it; browsers revalidate.
      "Cache-Control": "public, max-age=0, s-maxage=300, stale-while-revalidate=86400"
    }
  });
}
