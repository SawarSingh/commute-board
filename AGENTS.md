# commute-board

Live Delhi commute dashboard. Next.js App Router, TypeScript, Tailwind v4, SQLite via `node:sqlite`.

## Commands

- `npm run dev` — dev server on http://localhost:3000
- `npm run worker` — snapshot worker (separate terminal)
- `npm run backfill` — one-off historical import via TomTom Traffic Stats (`--route <id>`, `--dry-run`)
- `npm run typecheck` — `tsc --noEmit`
- `npm run build` — production build

## Environment

`.env.local`:

```
TOMTOM_API_KEY=
TOMTOM_STATS_API_KEY=
```

Empty `TOMTOM_API_KEY` = mock provider (simulated Delhi traffic). `TOMTOM_STATS_API_KEY` is the
separate Traffic Stats key (30-day trial from move.tomtom.com) used only by the backfill script.
Each user can have multiple named routes; snapshots are stored per route in `data/commute.db`
(gitignored, created automatically).

Next.js loads `.env.local` itself; the worker loads it via `tsx --env-file-if-exists=.env.local`.
Restart both after changing the key.

## Structure

- `src/app/api/auth/*` — signup, login, logout (scrypt hashes, DB sessions, httpOnly cookie)
- `src/app/api/current` — latest snapshot for `?routeId=`, refreshes when stale (`?force=1` skips the cache); `?fromLat=&fromLng=` returns an unsaved live estimate from a custom start point; payload includes leave-by and arrive-now times
- `src/app/api/history` — last 7 days for a chosen clock time (±30 min), plus best hour, today's intraday trend (15-min buckets), and a 24-hour average profile
- `src/app/api/year` — same week last year for a chosen clock time (±30 min)
- `src/app/api/routes` — GET overview for all routes (`?refresh=1`), POST create, PATCH edit/settings, DELETE `?id=`
- `src/app/api/routes/pair` — POST `{ id }` creates or links the reverse route (`paired_route_id` both ways)
- `src/app/api/route-options` — GET up to three route alternatives with geometry and pin points, for `?routeId=` or `?fromLat=&fromLng=&toLat=&toLng=` (optional `viaLat/viaLng`); cached for 120 s
- `src/app/api/reverse` — GET `?routeId=` one-off live estimate for the reversed trip, not saved
- `src/app/api/search` — TomTom typeahead place search (mock fallback)
- `src/lib/` — db, repo, auth, tokens, traffic adapter, IST time helpers, formatting
- `src/lib/predict.ts`, `src/lib/leaveby.ts` — departure-time ETA prediction and leave-by solver
- `src/lib/geo.ts` — browser geolocation helper for the current-location start toggle
- `scripts/backfill-traffic-stats.ts` — Traffic Stats import: last 7 days + same week last year, hourly
- `src/app/page.tsx` + `HomePager.tsx` — paged board: overview slide first, then one detail slide per route, ordered by next leave-by
- `src/app/OverviewClient.tsx` — overview slide: one card per route with current times
- `src/app/routes/[id]` — standalone route detail page (same board component)
- `src/app/routes/new`, `src/app/routes/[id]/edit` — create/edit route (with an optional via point); `src/app/settings` — route manager
- `src/components/RouteMap.tsx` — Leaflet + CARTO dark map preview (client-only, no interactions)
- `src/components/RouteOptions.tsx` — route option cards/grid used by the detail page and route form
- `src/app/dashboard` — redirects to `/` (kept for old links)

## Scope

The current feature set is the MVP. Deferred functionality and the mobile plan (PWA, Capacitor,
widgets) are written down in `ROADMAP.md`; do not implement them until the MVP is stable.

## Conventions

- Times are Asia/Kolkata (fixed +05:30 offset, no DST).
- Traffic provider lives behind `fetchTraffic`/`searchPlaces` in `src/lib/traffic.ts`; keep sources outside UI.
- No paid APIs beyond TomTom free tier. Do not add Uber/Ola/Rapido fare calls.
- Keep `node:sqlite` (no native deps). Do not introduce Prisma.
- Comments are omitted by project convention.
- Moving the route (lat/lng change) deletes its snapshots; history restarts on a new route.
- History panels only show data that has been recorded or backfilled; surface `availableSince` instead of implying a full week/year.
- Leave-by is solved from the historical duration at the departure clock time (last 7 days, then same week last year, then current ETA); `leaveBySource` says which was used.
- Current-location start is a client-side toggle on the overview cards and route detail page. It uses browser geolocation, is never persisted, and its live estimate is not added to route history. The add/edit form's From field can also capture the current location once and save it as the route's fixed start; it keeps the typed alias, and boards always display that alias rather than "Current location". Geolocation requires HTTPS outside localhost.
- Routes are ordered by next leave-by (soonest upcoming departure first) on the overview and in the pager, so the most urgent commute is the first detail slide after Overview.
- The route detail board shows arrive-now ETA, now vs typical (7-day median at the selected time, TomTom historic fallback), 7-day fastest/typical/slowest with an on-time rate, today's intraday trend, and a 24-hour best-time profile.
- Return trips are separate routes linked via `paired_route_id`. Pairing creates the swapped route (name `<dest> to <origin>`, arrival target +9 hours); deleting one clears the other's link. The detail page shows a live "Return trip now" estimate and "Track return trip" when unpaired.
- A route can have an optional via point (`via_label`/`via_lat`/`via_lng`) sent to TomTom as an intermediate waypoint; this pins the corridor (e.g. IFFCO Chowk) so the ETA matches the intended path instead of TomTom's own fastest route. Via is copied to the paired return route, and editing From, To, or Via updates the pair (swapped origin/dest, derived name, same via); moving either route wipes both histories.
- Route options show three cards with Leaflet map previews: the currently tracked route (if a via is set), the fastest broad TomTom route, and up to two alternatives. Selecting a pinned option saves its pin as the route's via; selecting the no-pin fastest option clears via. Switching resets history for the route and its pair. Option labels are derived from TomTom guidance (longest named road, fallback Fastest/Alternative), and geometry is simplified to at most 120 points for the previews.
