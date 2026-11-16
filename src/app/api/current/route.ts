import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { computeLiveTiming, computeRouteTiming } from "@/lib/leaveby";
import {
  getRouteById,
  getRouteForUser,
  insertSnapshot,
  isStale,
  latestSnapshot,
  viaPoint,
} from "@/lib/repo";
import { fetchTraffic, usingMockProvider } from "@/lib/traffic";
import type { CurrentPayload, Snapshot } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const params = new URL(request.url).searchParams;
  const force = params.get("force") === "1";
  const requestedId = Number(params.get("routeId"));
  const route = Number.isFinite(requestedId) && requestedId > 0
    ? getRouteById(user.id, requestedId)
    : getRouteForUser(user.id);
  const now = new Date().toISOString();

  const fromLatRaw = params.get("fromLat");
  const fromLngRaw = params.get("fromLng");
  const hasOverride = fromLatRaw !== null || fromLngRaw !== null;
  const fromLat = fromLatRaw ? Number(fromLatRaw) : Number.NaN;
  const fromLng = fromLngRaw ? Number(fromLngRaw) : Number.NaN;
  const validOverride =
    hasOverride &&
    Number.isFinite(fromLat) &&
    Number.isFinite(fromLng) &&
    Math.abs(fromLat) <= 90 &&
    Math.abs(fromLng) <= 180;
  if (hasOverride && !validOverride) {
    return NextResponse.json({ error: "Invalid current location" }, { status: 400 });
  }

  if (!route) {
    const payload: CurrentPayload = {
      route: null,
      snapshot: null,
      leaveBy: null,
      leaveByDurationS: null,
      leaveBySource: null,
      arriveByNow: null,
      originOverride: null,
      now,
      mock: usingMockProvider(),
      warning: null,
    };
    return NextResponse.json(payload);
  }

  if (validOverride) {
    try {
      const traffic = await fetchTraffic(
        fromLat,
        fromLng,
        route.destLat,
        route.destLng,
        viaPoint(route),
      );
      const snapshot: Snapshot = {
        id: 0,
        routeId: route.id,
        capturedAt: new Date().toISOString(),
        ...traffic,
      };
      const timing = computeLiveTiming(route, snapshot);
      const payload: CurrentPayload = {
        route,
        snapshot,
        leaveBy: timing.leaveBy,
        leaveByDurationS: timing.leaveByDurationS,
        leaveBySource: timing.leaveBySource,
        arriveByNow: timing.arriveByNow,
        originOverride: { lat: fromLat, lng: fromLng },
        now: new Date().toISOString(),
        mock: usingMockProvider(),
        warning: null,
      };
      return NextResponse.json(payload);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Traffic lookup failed";
      return NextResponse.json({ error: message }, { status: 502 });
    }
  }

  let snapshot = latestSnapshot(route.id);
  let warning: string | null = null;

  if (force || isStale(snapshot, route.refreshMinutes)) {
    try {
      const traffic = await fetchTraffic(
        route.originLat,
        route.originLng,
        route.destLat,
        route.destLng,
        viaPoint(route),
      );
      snapshot = insertSnapshot(route.id, traffic);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Traffic lookup failed";
      if (!snapshot) {
        return NextResponse.json({ error: message }, { status: 502 });
      }
      warning = `${message}. Showing the last reading.`;
    }
  }

  const timing = computeRouteTiming(route, snapshot);

  const payload: CurrentPayload = {
    route,
    snapshot,
    leaveBy: timing.leaveBy,
    leaveByDurationS: timing.leaveByDurationS,
    leaveBySource: timing.leaveBySource,
    arriveByNow: timing.arriveByNow,
    originOverride: null,
    now: new Date().toISOString(),
    mock: usingMockProvider(),
    warning,
  };
  return NextResponse.json(payload);
}
