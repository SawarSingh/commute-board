import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { earliestSnapshotAt, getRouteById, getRouteForUser, snapshotsSince } from "@/lib/repo";
import {
  circularMinuteDistance,
  istDateKey,
  istMinutesOfDay,
  lastSevenISTDays,
} from "@/lib/time";
import type { HistoryPayload, HistoryPoint, ProfileHour, TrendPoint } from "@/lib/types";

export const dynamic = "force-dynamic";

const WINDOW_MINUTES = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

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
  const empty: HistoryPayload = {
    time,
    points: [],
    bestHour: null,
    bestHourDurationS: null,
    totalSamples: 0,
    availableSince: null,
    trend: [],
    profile: [],
  };
  if (!route) return NextResponse.json(empty);

  const [hours, minutes] = time.split(":").map(Number);
  const target = hours * 60 + minutes;
  const rows = snapshotsSince(route.id, new Date(Date.now() - 7 * DAY_MS).toISOString());

  const byDay = new Map<string, { duration: number; freeflow: number; samples: number }>();
  const byHour = Array.from({ length: 24 }, () => ({ duration: 0, samples: 0 }));

  for (const row of rows) {
    const captured = new Date(row.capturedAt);
    const minutesOfDay = istMinutesOfDay(captured);
    const hour = Math.floor(minutesOfDay / 60);
    byHour[hour].duration += row.durationS;
    byHour[hour].samples += 1;

    if (circularMinuteDistance(minutesOfDay, target) <= WINDOW_MINUTES) {
      const key = istDateKey(captured);
      const bucket = byDay.get(key) ?? { duration: 0, freeflow: 0, samples: 0 };
      bucket.duration += row.durationS;
      bucket.freeflow += row.freeflowS;
      bucket.samples += 1;
      byDay.set(key, bucket);
    }
  }

  let bestHour: number | null = null;
  let bestHourDurationS: number | null = null;
  byHour.forEach((bucket, hour) => {
    if (bucket.samples === 0) return;
    const avg = bucket.duration / bucket.samples;
    if (bestHourDurationS === null || avg < bestHourDurationS) {
      bestHourDurationS = avg;
      bestHour = hour;
    }
  });

  const todayKey = istDateKey(new Date());
  const trendBuckets = new Map<
    number,
    { duration: number; freeflow: number; samples: number; capturedAt: string; source: string }
  >();
  for (const row of rows) {
    const captured = new Date(row.capturedAt);
    if (istDateKey(captured) !== todayKey) continue;
    const slot = Math.floor(istMinutesOfDay(captured) / 15);
    const bucket = trendBuckets.get(slot);
    if (bucket) {
      bucket.duration += row.durationS;
      bucket.freeflow += row.freeflowS;
      bucket.samples += 1;
      bucket.capturedAt = row.capturedAt;
    } else {
      trendBuckets.set(slot, {
        duration: row.durationS,
        freeflow: row.freeflowS,
        samples: 1,
        capturedAt: row.capturedAt,
        source: row.source,
      });
    }
  }
  const trend: TrendPoint[] = [...trendBuckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, bucket]) => ({
      capturedAt: bucket.capturedAt,
      durationS: Math.round(bucket.duration / bucket.samples),
      freeflowS: Math.round(bucket.freeflow / bucket.samples),
      source: bucket.source,
    }));

  const profile: ProfileHour[] = byHour.map((bucket, hour) => ({
    hour,
    durationS: bucket.samples > 0 ? Math.round(bucket.duration / bucket.samples) : null,
    samples: bucket.samples,
  }));

  const points: HistoryPoint[] = lastSevenISTDays().map((dateKey) => {
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
  const payload: HistoryPayload = {
    time,
    points,
    bestHour,
    bestHourDurationS: bestHourDurationS === null ? null : Math.round(bestHourDurationS),
    totalSamples: rows.length,
    availableSince: earliest ? istDateKey(new Date(earliest)) : null,
    trend,
    profile,
  };
  return NextResponse.json(payload);
}
