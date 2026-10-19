# Foot-check bookings (BioGround)

Customers book a free 15-minute in-store foot structure and balance check on
the BioGround landing page. Bookings land in Postgres and staff work them in
`/admin/bookings`.

```
Customer ─▶ / (public/bioground/index.html, 5 languages)
              │  3-minute self-check (optional) → booking form
              ▼
          POST /api/bookings ──▶ Booking row (Postgres)
              │                    │
              │                    ├─▶ /admin/bookings        (staff: today, status, rescans)
              │                    ├─▶ /admin/bookings/[id]   (self-check, returning info, notes)
              │                    └─▶ /api/admin/bookings/export (JSON for the claude.ai dashboard)
              └─▶ staff email alert (no health details), if BOOKING_NOTIFY_EMAIL is set
```

## What the customer can book

- **New customer** — free 15-minute check. If they took the self-check and
  ticked the separate health-information consent, the self-check summary
  comes with the booking.
- **Returning customer** (already wears JGP Arch Built-in) — the regular
  **5-month rescan** (new footprint compared with the first one), an
  **early check** before 5 months (new footprint printed and explained), or a
  **wearing consult**. They give their last scan month; the server computes
  the next regular rescan month.

## Health-data rule (enforced in code, not by convention)

`lib/bookings.ts` `parseBookingInput()` discards the self-check and the
"see a clinician first" flag unless the request carries
`healthConsent: true`. Unknown flag names are dropped, never stored. The
staff email never contains health details. The export endpoint is
staff-only and only includes a self-check when consent was given. Self-check
answers are wellness screening, not a diagnosis — never use them for
marketing.

## Guarantees in `POST /api/bookings`

| Concern | How |
|---|---|
| Double submit / retry | `clientBookingId` is `UNIQUE`; a repeat returns the original code (200) |
| Overbooking a slot | count + insert inside one transaction holding `pg_advisory_xact_lock(hashtext('booking:STORE:DATE:TIME'))`; capacity `BOOKING_SLOT_CAPACITY` (default 2) |
| Abuse | 10 requests/hour/IP (Upstash in production — fails closed without it), 20 KB body cap, honeypot field, Origin allowlist |
| Time zones | dates/times are store-local (America/Los_Angeles) text; "today" and "already passed" are computed in that zone, not the server's |

The landing page sends `Content-Type: text/plain` so a cross-origin POST is a
CORS "simple request" (no preflight); the route parses the raw text as JSON.

## Configuration

| Variable | Purpose |
|---|---|
| `BOOKING_ALLOWED_ORIGINS` | Comma-separated extra origins allowed to POST (e.g. `https://bioground.com`). The site itself (same origin) always works. |
| `BOOKING_NOTIFY_EMAIL` | Where new-booking alerts go (uses the existing Resend setup). Unset = no alert. |
| `BOOKING_SLOT_CAPACITY` | Bookings per store per hourly slot. Default 2. |
| `UPSTASH_REDIS_REST_URL` / `_TOKEN` | Required in production (rate limiting). `KV_REST_API_URL` / `KV_REST_API_TOKEN` from Vercel's Upstash integration also work. |

Stores and time slots live in `lib/bookings.ts` (`BOOKING_STORES`,
`BOOKING_SLOTS`). Adding a franchise store = one entry there plus the
landing page's `STORES` list.

## Updating the landing page

The page is designed and reviewed as a claude.ai artifact, then copied here.
`/` is served by `app/route.ts`, which reads `public/bioground/index.html`
and replaces `__SITE_URL__` (canonical, `og:url`, `og:image`) with
`NEXT_PUBLIC_APP_URL`, else the Vercel production domain. To update:

1. Replace `public/bioground/index.html` with the new version. Keep the
   `<head>` block from the current file (social tags, canonical, fonts,
   Vercel Analytics / Speed Insights scripts) and make sure it still says
   `var BOOKING_ENDPOINT = "/api/bookings";` (the artifact copy has it empty,
   which keeps bookings in the browser only).
2. Re-bake the crawler copy: `node scripts/prerender-landing.mjs` (needs
   `npm i --no-save playwright && npx playwright install chromium` once).
   It renders the default Korean first screen into the HTML so KakaoTalk,
   Naver and iMessage previews see real text; the page script replaces it on
   load.
3. If the headline changes, update `scripts/og-image.html` and re-export
   `public/og/bioground-og.png` (1200×630).

With the endpoint set, the page hides its "demo" notes, waits for the server,
shows the server's `BK-` code, and shows translated errors for a full slot,
a passed time, or a network failure. Chinese fonts load only when Chinese is
selected (`ensureFonts`).

## Security

- **Headers** (all routes, `next.config.js`): CSP (`frame-ancestors 'none'`;
  scripts/styles `'self' 'unsafe-inline'`; Google Fonts; Vercel Analytics),
  HSTS (2 years, includeSubDomains, preload), `X-Frame-Options: DENY`,
  `nosniff`, `strict-origin-when-cross-origin`, and a Permissions-Policy that
  turns off camera, microphone and location.
- **Staff sign-in** (`lib/login-guard.ts`): 5 failed attempts per IP + email
  and 30 per IP within 15 minutes, then HTTP 429 and a "sign-in paused"
  message until the window passes. A successful sign-in clears the IP +
  email counter. Uses the same Upstash limiter as bookings (fails closed in
  production without it).
- **Email alert health:** the admin shows a banner when `RESEND_API_KEY`,
  `EMAIL_FROM` or `BOOKING_NOTIFY_EMAIL` is missing.

## Not built yet

- **Confirmation and reminder messages to the customer.** The landing page
  says the store confirms the booking and reminds the day before and 2 hours
  before. Today staff do this by hand from `/admin/bookings`. Automating it
  needs an SMS provider (e.g. Twilio) plus KakaoTalk/WhatsApp business
  accounts for those contact choices.
- **Customer profiles.** Bookings are grouped by phone number (history on
  the detail page, rescan list); there is no separate customer record yet.
- **Footprint images and the full visit record.** The claude.ai store
  dashboard (`artifacts/store-dashboard.html`) records balance scores,
  footprint photos, and purchases; this admin records bookings only.
- **Staff management UI.** Staff logins are created (and passwords reset)
  with `npm run staff:create`.
- **Per-store hours and holidays.** All stores share `BOOKING_SLOTS`.
