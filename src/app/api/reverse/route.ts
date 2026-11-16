import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getRouteById, getRouteForUser, viaPoint } from "@/lib/repo";
import { fetchTraffic } from "@/lib/traffic";
import type { Snapshot } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const requestedId = Number(new URL(request.url).searchParams.get("routeId"));
  const route =
    Number.isFinite(requestedId) && requestedId > 0
      ? getRouteById(user.id, requestedId)
      : getRouteForUser(user.id);
  if (!route) return NextResponse.json({ error: "Route not found" }, { status: 404 });

  try {
    const traffic = await fetchTraffic(
      route.destLat,
      route.destLng,
      route.originLat,
      route.originLng,
      viaPoint(route),
    );
    const snapshot: Snapshot = {
      id: 0,
      routeId: route.id,
      capturedAt: new Date().toISOString(),
      ...traffic,
    };
    return NextResponse.json({ snapshot });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Traffic lookup failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
