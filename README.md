# BioGround × JGP — foot-check booking site

A free 15-minute in-store foot structure and balance check: customers find
it, take a 3-minute self-check, and book. Staff work the bookings in an
admin. Everything here was built for BioGround (formerly le bál) and nothing
else.

```
Customer ─▶ /  (public/bioground/index.html — Korean, English, Spanish, Vietnamese, Chinese)
              │  Hook → 3-minute self-check (11 questions) → at-a-glance result → offer → booking
              ▼
          POST /api/bookings ──▶ Postgres (Booking)
                                   ├─▶ /admin/bookings       day view, status, phone/walk-in, 5-month rescans
                                   ├─▶ /admin/bookings/[id]  self-check result, returning-customer info, notes
                                   └─▶ /api/admin/bookings/export  JSON for the claude.ai store dashboard
```

## What's in the repo

| Path | What it is |
|---|---|
| `public/bioground/index.html` | The customer landing page (single file, 5 languages). Brunson-style funnel, Hormozi-style offer, objective self-check (wet footprint test, Manchester Scale, heel alignment, single-leg heel raise, CDC 4-stage balance), new **and** returning-customer booking, separate health-data consent. |
| `app/api/bookings/route.ts` | Public booking endpoint: idempotent, slot capacity under concurrency, rate-limited, Origin allowlist, consent-gated health data. |
| `app/admin/` | Staff sign-in and the bookings admin. |
| `lib/bookings.ts` | The single definition of a valid booking, stores, time slots, the 5-month rescan rule, and the export format. |
| `prisma/` | `Booking` and `StaffUser` tables + migration. |
| `artifacts/` | Source of the two claude.ai artifacts this site came from: the landing page (bookings stay in the browser) and the store visit dashboard (balance test, footprints, purchases, CRM). |
| `docs/BOOKINGS.md` | How bookings work, the health-data rule, configuration, and what isn't built yet. |

## Run it locally

```bash
nvm use                       # Node 24
npm install
cp .env.example .env.local    # fill DATABASE_URL, DATABASE_URL_UNPOOLED, AUTH_SECRET
npx prisma migrate deploy
npm run staff:create -- you@example.com "Your Name" ADMIN
npm run dev                   # http://localhost:3000 (landing) and /admin
```

## Go live (Vercel)

1. **Vercel → Add New → Project** → import this repo. Before deploying, add
   `AUTH_SECRET` (`openssl rand -base64 32`). Optional: `BOOKING_NOTIFY_EMAIL`,
   `RESEND_API_KEY`, `EMAIL_FROM`, `BOOKING_SLOT_CAPACITY` (default 2),
   `NEXT_PUBLIC_APP_URL` (defaults to the Vercel production domain).
2. **Storage → Neon** (Create database, connect to this project). It sets
   `DATABASE_URL` and `DATABASE_URL_UNPOOLED`; `vercel.json` runs
   `prisma migrate deploy` before each build, so tables are created on deploy.
3. **Storage → Upstash for Redis** (connect to this project). It sets
   `KV_REST_API_URL` / `KV_REST_API_TOKEN`, which the rate limiter reads. The
   booking API refuses traffic in production without it.
4. **Redeploy** so the build sees the new variables.
5. Create staff logins: `npm run staff:create` with `DATABASE_URL` pointing at
   the production database.
6. Point the domain at Vercel and make one real test booking end to end.

## Checks

`npx tsc --noEmit`, `npm run lint`, `npm test` (unit tests always; the
booking API integration test runs when `DATABASE_URL` points at a real
Postgres, as it does in CI), `npm run build`.

## Not built yet

Automated confirmation/reminder messages (SMS, KakaoTalk, WhatsApp), a staff
management screen, per-store hours, and footprint images in this admin — see
`docs/BOOKINGS.md`.
