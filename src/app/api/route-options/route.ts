import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getRouteById } from "@/lib/repo";
import { fetchRouteOptions, routeOptionsSimilar, usingMockProvider } from "@/lib/traffic";
import type { RouteOption, RouteOptionsPayload } from "@/lib/types";

type Point = { lat: number; lng: number };

export const dynamic = "force-dynamic";

function parseCoord(value: string | null, min: number, max: number): number | null {
  if (value === null || value.trim() === "") return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) return null;
  return number;
}

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const params = new URL(request.url).searchParams;
  const routeIdRaw = params.get("routeId");
  let origin: Point | null = null;
  let dest: Point | null = null;
  let via: Point | null = null;
  let currentLabel: string | null = null;

  if (routeIdRaw !== null) {
    const routeId = Number(routeIdRaw);
    if (!Number.isFinite(routeId) || routeId <= 0) {
      return NextResponse.json({ error: "Invalid route" }, { status: 400 });
    }
    const route = getRouteById(user.id, routeId);
    if (!route) return NextResponse.json({ error: "Route not found" }, { status: 404 });
    origin = { lat: route.originLat, lng: route.originLng };
    dest = { lat: route.destLat, lng: route.destLng };
    if (route.viaLat !== null && route.viaLng !== null) {
      via = { lat: route.viaLat, lng: route.viaLng };
      currentLabel = route.viaLabel;
    }
  } else {
    const fromLat = parseCoord(params.get("fromLat"), -90, 90);
    const fromLng = parseCoord(params.get("fromLng"), -180, 180);
    const toLat = parseCoord(params.get("toLat"), -90, 90);
    const toLng = parseCoord(params.get("toLng"), -180, 180);
    if (fromLat === null || fromLng === null || toLat === null || toLng === null) {
      return NextResponse.json({ error: "Missing start or destination" }, { status: 400 });
    }
    origin = { lat: fromLat, lng: fromLng };
    dest = { lat: toLat, lng: toLng };
    const viaLat = parseCoord(params.get("viaLat"), -90, 90);
    const viaLng = parseCoord(params.get("viaLng"), -180, 180);
    if (viaLat !== null && viaLng !== null) via = { lat: viaLat, lng: viaLng };
  }

  try {
    const broad = await fetchRouteOptions(origin.lat, origin.lng, dest.lat, dest.lng, null, 2);
    const options: RouteOption[] = broad.map((option, index) => ({
      ...option,
      key: index === 0 ? "fastest" : `alternative-${index}`,
      source: index === 0 ? "fastest" : "alternative",
      selected: false,
    }));

    if (via) {
      const current = await fetchRouteOptions(
        origin.lat,
        origin.lng,
        dest.lat,
        dest.lng,
        via,
        0,
      );
      const currentDraft = current[0];
      if (currentDraft) {
        const currentOption: RouteOption = {
          ...currentDraft,
          key: "current",
          label: currentLabel?.trim() || currentDraft.label,
          source: "current",
          pin: via,
          selected: true,
        };
        const remaining = options.filter(
          (option) => !routeOptionsSimilar(option, currentOption),
        );
        const similar = options.filter((option) =>
          routeOptionsSimilar(option, currentOption),
        );
        options.splice(0, options.length, ...[currentOption, ...remaining, ...similar].slice(0, 3));
      }
    } else if (options[0]) {
      options[0].selected = true;
    }

    const payload: RouteOptionsPayload = { options, mock: usingMockProvider() };
    return NextResponse.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load route options";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
