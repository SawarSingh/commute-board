import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { DashboardClient } from "@/app/dashboard/DashboardClient";
import { AppHeader } from "@/components/AppHeader";
import { getSessionUser } from "@/lib/auth";
import { computeRouteTiming } from "@/lib/leaveby";
import { getRouteById, latestSnapshot } from "@/lib/repo";
import { usingMockProvider } from "@/lib/traffic";
import type { CurrentPayload } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function RouteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const { id } = await params;
  const route = getRouteById(user.id, Number(id));
  if (!route) notFound();

  const snapshot = latestSnapshot(route.id);
  const timing = computeRouteTiming(route, snapshot);
  const initial: CurrentPayload = {
    route,
    snapshot,
    leaveBy: timing.leaveBy,
    leaveByDurationS: timing.leaveByDurationS,
    leaveBySource: timing.leaveBySource,
    arriveByNow: timing.arriveByNow,
    originOverride: null,
    now: new Date().toISOString(),
    mock: usingMockProvider(),
    warning: null,
  };

  return (
    <>
      <AppHeader email={user.email} />
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 pt-4">
        <Link href="/" className="text-xs text-zinc-500 hover:text-zinc-200">
          ← All routes
        </Link>
        <Link
          href={`/routes/${route.id}/edit`}
          className="rounded-md border border-white/10 px-3 py-1.5 text-xs text-zinc-300 hover:border-white/20"
        >
          Edit route
        </Link>
      </div>
      <main>
        <DashboardClient initial={initial} routeId={route.id} />
      </main>
    </>
  );
}
