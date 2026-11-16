import Link from "next/link";
import { redirect } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { getSessionUser } from "@/lib/auth";
import { computeRouteTiming, upcomingSortKey } from "@/lib/leaveby";
import { latestSnapshot, listRoutesForUser } from "@/lib/repo";
import { usingMockProvider } from "@/lib/traffic";
import type { CurrentPayload, OverviewPayload } from "@/lib/types";
import { HomePager } from "./HomePager";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const now = new Date();
  const mock = usingMockProvider();
  const routes = listRoutesForUser(user.id);
  const items = routes.map((route) => {
    const snapshot = latestSnapshot(route.id);
    return {
      route,
      snapshot,
      timing: computeRouteTiming(route, snapshot, now),
      warning: null,
    };
  });
  items.sort(
    (a, b) =>
      upcomingSortKey(a.route, a.timing, now) - upcomingSortKey(b.route, b.timing, now) ||
      a.route.id - b.route.id,
  );

  const overview: OverviewPayload = {
    routes: items,
    now: now.toISOString(),
    mock,
  };
  const details = items.map((item) => {
    const initial: CurrentPayload = {
      route: item.route,
      snapshot: item.snapshot,
      leaveBy: item.timing.leaveBy,
      leaveByDurationS: item.timing.leaveByDurationS,
      leaveBySource: item.timing.leaveBySource,
      arriveByNow: item.timing.arriveByNow,
      originOverride: null,
      now: now.toISOString(),
      mock,
      warning: item.warning,
    };
    return { routeId: item.route.id, name: item.route.name, initial };
  });

  return (
    <>
      <AppHeader email={user.email} />
      {routes.length === 0 ? (
        <main className="mx-auto max-w-3xl px-4 py-16">
          <h1 className="text-xl font-semibold">No routes yet</h1>
          <p className="mt-2 text-sm text-zinc-400">
            Add the trips you care about — home to office, home to gym, office to home — and the
            board will track each one.
          </p>
          <Link
            href="/routes/new"
            className="mt-6 inline-block rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-emerald-950 hover:bg-emerald-400"
          >
            Add your first route
          </Link>
        </main>
      ) : (
        <HomePager overview={overview} details={details} />
      )}
    </>
  );
}
