import { NextResponse } from "next/server";
import { getDeviceUser } from "@/lib/auth";
import { computeRouteTiming, upcomingSortKey } from "@/lib/leaveby";
import {
  getRouteById,
  insertSnapshot,
  isStale,
  latestSnapshot,
  listRoutesForUser,
  viaPoint,
} from "@/lib/repo";
import { fetchTraffic, usingMockProvider } from "@/lib/traffic";
import type { RouteOverview, WidgetPayload } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = getDeviceUser(request);
  if (!user) {
    return NextResponse.json({ error: "Invalid widget token" }, { status: 401 });
  }

  const now = new Date();
  const routes = listRoutesForUser(user.id);
  if (routes.length === 0) {
    const payload: WidgetPayload = {
      route: null,
      snapshot: null,
      leaveBy: null,
      leaveByDurationS: null,
      leaveBySource: null,
      arriveByNow: null,
      nowDurationS: null,
      now: now.toISOString(),
      mock: usingMockProvider(),
      warning: null,
    };
    return NextResponse.json(payload, { headers: { "Cache-Control": "no-store" } });
  }

  const requestedId = Number(new URL(request.url).searchParams.get("routeId"));
  let route =
    Number.isFinite(requestedId) && requestedId > 0
      ? getRouteById(user.id, requestedId)
      : null;

  if (!route) {
    const items: RouteOverview[] = routes.map((candidate) => {
      const snapshot = latestSnapshot(candidate.id);
      return {
        route: candidate,
        snapshot,
        timing: computeRouteTiming(candidate, snapshot, now),
        warning: null,
      };
    });
    items.sort(
      (a, b) =>
        upcomingSortKey(a.route, a.timing, now) - upcomingSortKey(b.route, b.timing, now) ||
        a.route.id - b.route.id,
    );
    route = items[0].route;
  }

  let snapshot = latestSnapshot(route.id);
  let warning: string | null = null;

  if (isStale(snapshot, route.refreshMinutes)) {
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

  const timing = computeRouteTiming(route, snapshot, now);
  const payload: WidgetPayload = {
    route,
    snapshot,
    leaveBy: timing.leaveBy,
    leaveByDurationS: timing.leaveByDurationS,
    leaveBySource: timing.leaveBySource,
    arriveByNow: timing.arriveByNow,
    nowDurationS: timing.nowDurationS,
    now: now.toISOString(),
    mock: usingMockProvider(),
    warning,
  };

  return NextResponse.json(payload, { headers: { "Cache-Control": "no-store" } });
}
