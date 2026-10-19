// The public site URL used in canonical / Open Graph tags, robots.txt and
// sitemap.xml. NEXT_PUBLIC_APP_URL wins (set it to the custom domain);
// on Vercel it falls back to the project's production domain; locally to
// the request origin (or localhost).
export function siteUrl(requestOrigin?: string): string {
  const explicit = (process.env.NEXT_PUBLIC_APP_URL || "").trim().replace(/\/+$/, "");
  if (explicit) return explicit;
  const prod = (process.env.VERCEL_PROJECT_PRODUCTION_URL || "").trim().replace(/\/+$/, "");
  if (prod) return `https://${prod}`;
  return (requestOrigin || "http://localhost:3000").replace(/\/+$/, "");
}

export const SITE_URL_PLACEHOLDER = "__SITE_URL__";

/** Fills the landing page template's site-URL placeholders. */
export function renderLanding(template: string, site: string): string {
  return template.split(SITE_URL_PLACEHOLDER).join(site);
}
