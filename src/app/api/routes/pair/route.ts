import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import {
  createReverseRoute,
  getRouteById,
  listRoutesForUser,
  setRoutePair,
} from "@/lib/repo";

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as { id?: unknown } | null;
  const id = Number(body?.id);
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ error: "Missing route id" }, { status: 400 });
  }

  const route = getRouteById(user.id, id);
  if (!route) return NextResponse.json({ error: "Route not found" }, { status: 404 });

  if (route.pairedRouteId) {
    return NextResponse.json({
      route,
      pairedRoute: getRouteById(user.id, route.pairedRouteId),
    });
  }

  const existing = listRoutesForUser(user.id).find(
    (candidate) =>
      candidate.id !== route.id &&
      candidate.originLat === route.destLat &&
      candidate.originLng === route.destLng &&
      candidate.destLat === route.originLat &&
      candidate.destLng === route.originLng,
  );

  let pairedRoute;
  if (existing) {
    setRoutePair(user.id, route.id, existing.id);
    setRoutePair(user.id, existing.id, route.id);
    pairedRoute = getRouteById(user.id, existing.id);
  } else {
    pairedRoute = createReverseRoute(user.id, route);
  }

  return NextResponse.json({
    route: getRouteById(user.id, route.id),
    pairedRoute,
  });
}
