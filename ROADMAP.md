# Roadmap

Status: post-MVP backlog. Do not start these until the current MVP is stable and verified.
MVP = multiple named routes, overview board, per-route detail with live drive time, route
alternatives with map previews, leave-by prediction, 7-day chart, same-week-last-year panel,
route management, snapshot worker, Traffic Stats backfill. Everything below is deferred.

## Web functionality

### Trips & routes
- Weekday schedule: different targets Mon-Fri, weekends off (S, high)
- Multiple via points / multi-stop commute (M, med)
- Skip holidays / WFH days (S, med)

### Live & prediction
- Departure planner: ETA curve for the next 2 hours (S, high)
- Leave-now alert at the right moment (M, high; needs hosted worker + push)
- Traffic incidents / roadworks on the route (TomTom Incidents, free-tier quota) (S, high)
- Weather impact (Open-Meteo, free) (S, med)
- Segment-level bottleneck breakdown (M, med)
- Prediction accuracy tracking: log predicted vs actual (S, med)
- "Best window to leave" for a given arrival target (S, med)

### History & insights
- Typical-week heatmap (weekday x hour) (M, high)
- Reliability: p15/p50/p85, "% of days over 45 min" (S, high)
- 30/90-day trends, week-over-week change (S, med)
- Time lost vs free flow, totalled per month (S, med)
- Fuel/CO2 estimate per trip (S, low)
- Weekly digest (email or CSV export) (S, med)

### Notifications
- Morning digest: "leave by 08:47" (M, high)
- Drive-time spike / incident alert (M, med)
- Quiet hours and weekend suppression (S, med)

### Platform & polish
- 24/7 hosted worker + DB backups (M, high; prerequisite for alerts and widgets)
- Device-token auth for native clients and widgets (S, high; prerequisite)
- Dark/light theme, km/mi, 12/24h (S, low)
- Export data / delete account (S, low)
- Calendar integration to set the arrival target from the first meeting (M, med)
- Share ETA link with someone (S, low)

## Mobile

Order: web product first, then wrap it. Do not rewrite the UI before the web MVP is settled.

1. PWA: manifest, icons, installable on iPad/iPhone/Android, offline shell, web push (iOS 16.4+).
   No widgets from a pure web app.
2. Hosted worker + database (Fly.io / Railway / VPS) so data is always fresh.
3. Device-token auth alongside cookies for native clients and widgets.
4. Phone layout: stack the 2x2 grid into one column, live card first.
5. Capacitor shell reusing the existing web UI for App Store / Play Store; add native push.
6. Native widgets: iOS WidgetKit (Swift, App Group + backend API), Android Glance. A widget shows
   drive time and leave-by from `/api/current`.
7. Zero-native quick win before Capacitor: iOS Scriptable widget or Shortcut hitting
   `/api/current` with a device token.

Caveats:
- App Store guideline 4.2: a bare website wrapper can be rejected; widgets, push and offline
  support are what justify a native listing.
- iOS background refresh is limited; widgets refresh on a system schedule, so push plus a hosted
  worker is the reliable path.
- Expo/React Native is only worth it if a full native rewrite is wanted later; API and shared
  types can be reused either way.

## Suggested sequence (web)

1. Weekday schedule
2. Typical-week heatmap + reliability stats
3. Departure planner + incidents
4. Hosted worker + leave-now push
5. Prediction accuracy tracking
6. Then mobile: PWA -> Capacitor -> widgets
