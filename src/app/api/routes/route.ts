import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { computeRouteTiming, upcomingSortKey } from "@/lib/leaveby";
import {
  createRoute,
  deleteRoute,
  getRouteById,
  insertSnapshot,
  isStale,
  latestSnapshot,
  listRoutesForUser,
  updateRoute,
  updateRouteSettings,
  viaPoint,
} from "@/lib/repo";
import { fetchTraffic, usingMockProvider } from "@/lib/traffic";
import type { OverviewPayload, RouteOverview } from "@/lib/types";

type Point = { label?: unknown; lat?: unknown; lng?: unknown };

function parsePoint(value: unknown): { label: string; lat: number; lng: number } | null {
  if (typeof value !== "object" || value === null) return null;
  const point = value as Point;
  const lat = Number(point.lat);
  const lng = Number(point.lng);
  const label = typeof point.label === "string" ? point.label.trim() : "";
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || label.length === 0) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { label, lat, lng };
}

function parseArrival(value: unknown): string | null {
  if (typeof value !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return null;
  return value;
}

function parseVia(
  value: unknown,
): { label: string; lat: number; lng: number } | null | "invalid" {
  if (value === undefined || value === null) return null;
  return parsePoint(value) ?? "invalid";
}

function parseRefresh(value: unknown): number | null {
  const minutes = Number(value);
  if (![2, 3, 5, 10, 15].includes(minutes)) return null;
  return minutes;
}

function parseId(value: unknown): number | null {
  const id = Number(value);
  return Number.isFinite(id) && id > 0 ? id : null;
}

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const refresh = new URL(request.url).searchParams.get("refresh") === "1";
  const now = new Date();
  const routes = listRoutesForUser(user.id);

  const items: RouteOverview[] = await Promise.all(
    routes.map(async (route) => {
      let snapshot = latestSnapshot(route.id);
      let warning: string | null = null;
      if (refresh && isStale(snapshot, route.refreshMinutes)) {
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
          warning = error instanceof Error ? error.message : "Traffic lookup failed";
        }
      }
      return { route, snapshot, timing: computeRouteTiming(route, snapshot, now), warning };
    }),
  );

  items.sort(
    (a, b) =>
      upcomingSortKey(a.route, a.timing, now) - upcomingSortKey(b.route, b.timing, now) ||
      a.route.id - b.route.id,
  );

  const payload: OverviewPayload = {
    routes: items,
    now: now.toISOString(),
    mock: usingMockProvider(),
  };
  return NextResponse.json(payload);
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const origin = parsePoint(body?.origin);
  const dest = parsePoint(body?.dest);
  const via = parseVia(body?.via);
  const arrivalTarget = parseArrival(body?.arrivalTarget);
  const refreshMinutes = parseRefresh(body?.refreshMinutes);

  if (
    name.length === 0 ||
    !origin ||
    !dest ||
    via === "invalid" ||
    !arrivalTarget ||
    !refreshMinutes
  ) {
    return NextResponse.json({ error: "Some fields are missing or invalid" }, { status: 400 });
  }
  if (origin.lat === dest.lat && origin.lng === dest.lng) {
    return NextResponse.json({ error: "Start and destination must be different" }, { status: 400 });
  }

  const route = createRoute(user.id, {
    name,
    originLabel: origin.label,
    originLat: origin.lat,
    originLng: origin.lng,
    destLabel: dest.label,
    destLat: dest.lat,
    destLng: dest.lng,
    viaLabel: via?.label ?? null,
    viaLat: via?.lat ?? null,
    viaLng: via?.lng ?? null,
    arrivalTarget,
    refreshMinutes,
  });
  return NextResponse.json({ route });
}

export async function PATCH(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const id = parseId(body?.id);
  if (!id) return NextResponse.json({ error: "Missing route id" }, { status: 400 });

  const isFullEdit =
    body?.name !== undefined || body?.origin !== undefined || body?.dest !== undefined;

  if (isFullEdit) {
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    const origin = parsePoint(body?.origin);
    const dest = parsePoint(body?.dest);
    const via = parseVia(body?.via);
    const arrivalTarget = parseArrival(body?.arrivalTarget);
    const refreshMinutes = parseRefresh(body?.refreshMinutes);
    if (
      name.length === 0 ||
      !origin ||
      !dest ||
      via === "invalid" ||
      !arrivalTarget ||
      !refreshMinutes
    ) {
      return NextResponse.json({ error: "Some fields are missing or invalid" }, { status: 400 });
    }
    if (origin.lat === dest.lat && origin.lng === dest.lng) {
      return NextResponse.json(
        { error: "Start and destination must be different" },
        { status: 400 },
      );
    }
    const route = updateRoute(user.id, id, {
      name,
      originLabel: origin.label,
      originLat: origin.lat,
      originLng: origin.lng,
      destLabel: dest.label,
      destLat: dest.lat,
      destLng: dest.lng,
      viaLabel: via?.label ?? null,
      viaLat: via?.lat ?? null,
      viaLng: via?.lng ?? null,
      arrivalTarget,
      refreshMinutes,
    });
    if (!route) return NextResponse.json({ error: "Route not found" }, { status: 404 });
    return NextResponse.json({ route });
  }

  const arrivalTarget =
    body?.arrivalTarget === undefined ? undefined : parseArrival(body.arrivalTarget);
  const refreshMinutes =
    body?.refreshMinutes === undefined ? undefined : parseRefresh(body.refreshMinutes);
  if (arrivalTarget === null || refreshMinutes === null) {
    return NextResponse.json({ error: "Invalid settings" }, { status: 400 });
  }
  if (!arrivalTarget && !refreshMinutes) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const route = updateRouteSettings(user.id, id, { arrivalTarget, refreshMinutes });
  if (!route) return NextResponse.json({ error: "Route not found" }, { status: 404 });
  return NextResponse.json({ route });
}

export async function DELETE(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const id = parseId(new URL(request.url).searchParams.get("id"));
  if (!id) return NextResponse.json({ error: "Missing route id" }, { status: 400 });

  const route = getRouteById(user.id, id);
  if (!route) return NextResponse.json({ error: "Route not found" }, { status: 404 });
  deleteRoute(user.id, id);
  return NextResponse.json({ ok: true });
}
