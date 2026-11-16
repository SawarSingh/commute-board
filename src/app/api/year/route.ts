import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { earliestSnapshotAt, getRouteById, getRouteForUser, snapshotsBetween } from "@/lib/repo";
import {
  circularMinuteDistance,
  istDateKey,
  istMinutesOfDay,
  lastSevenISTDays,
  minusOneYear,
} from "@/lib/time";
import type { HistoryPoint, YearPayload } from "@/lib/types";

export const dynamic = "force-dynamic";

const DAY_MS = 24 * 60 * 60 * 1000;
const WINDOW_MINUTES = 30;
const LOOKBACK_DAYS = 373;
const LOOKAHEAD_DAYS = 300;

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const params = new URL(request.url).searchParams;
  const time = params.get("time") ?? "";
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
    return NextResponse.json({ error: "Pick a time like 09:30" }, { status: 400 });
  }

  const requestedId = Number(params.get("routeId"));
  const route =
    Number.isFinite(requestedId) && requestedId > 0
      ? getRouteById(user.id, requestedId)
      : getRouteForUser(user.id);
  const empty: YearPayload = { time, points: [], totalSamples: 0, availableSince: null };
  if (!route) return NextResponse.json(empty);

  const [hours, minutes] = time.split(":").map(Number);
  const target = hours * 60 + minutes;
  const targets = lastSevenISTDays().map(minusOneYear);
  const wanted = new Set(targets);

  const now = Date.now();
  const rows = snapshotsBetween(
    route.id,
    new Date(now - LOOKBACK_DAYS * DAY_MS).toISOString(),
    new Date(now - LOOKAHEAD_DAYS * DAY_MS).toISOString(),
  );

  const byDay = new Map<string, { duration: number; freeflow: number; samples: number }>();
  for (const row of rows) {
    const captured = new Date(row.capturedAt);
    const key = istDateKey(captured);
    if (!wanted.has(key)) continue;
    if (circularMinuteDistance(istMinutesOfDay(captured), target) > WINDOW_MINUTES) continue;
    const bucket = byDay.get(key) ?? { duration: 0, freeflow: 0, samples: 0 };
    bucket.duration += row.durationS;
    bucket.freeflow += row.freeflowS;
    bucket.samples += 1;
    byDay.set(key, bucket);
  }

  const points: HistoryPoint[] = targets.map((dateKey) => {
    const bucket = byDay.get(dateKey);
    return {
      dateKey,
      day: dateKey,
      durationS: bucket ? Math.round(bucket.duration / bucket.samples) : null,
      freeflowS: bucket ? Math.round(bucket.freeflow / bucket.samples) : null,
      samples: bucket ? bucket.samples : 0,
    };
  });

  const earliest = earliestSnapshotAt(route.id);
  const payload: YearPayload = {
    time,
    points,
    totalSamples: rows.filter((row) => wanted.has(istDateKey(new Date(row.capturedAt)))).length,
    availableSince: earliest ? istDateKey(new Date(earliest)) : null,
  };
  return NextResponse.json(payload);
}
