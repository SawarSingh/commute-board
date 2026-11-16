import Link from "next/link";
import { redirect } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { getSessionUser } from "@/lib/auth";
import { listRoutesForUser } from "@/lib/repo";
import { DeleteRouteButton } from "./DeleteRouteButton";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const routes = listRoutesForUser(user.id);

  return (
    <>
      <AppHeader email={user.email} />
      <main className="mx-auto max-w-3xl px-4 py-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">Your routes</h1>
            <p className="mt-1 text-sm text-zinc-400">
              Each route tracks its own live time and history.
            </p>
          </div>
          <Link
            href="/routes/new"
            className="rounded-md bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-emerald-950 hover:bg-emerald-400"
          >
            Add route
          </Link>
        </div>

        {routes.length === 0 ? (
          <p className="mt-6 rounded-xl border border-white/10 bg-white/[0.03] p-5 text-sm text-zinc-400">
            No routes yet.{" "}
            <Link href="/routes/new" className="text-emerald-400 hover:underline">
              Add your first route
            </Link>
            .
          </p>
        ) : (
          <ul className="mt-5 space-y-3">
            {routes.map((route) => (
              <li
                key={route.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-4"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{route.name}</p>
                  <p className="mt-0.5 truncate text-xs text-zinc-500">
                    {route.originLabel} <span className="text-emerald-400">→</span>{" "}
                    {route.destLabel}
                    {route.viaLabel ? (
                      <span className="text-zinc-600"> · via {route.viaLabel}</span>
                    ) : null}
                  </p>
                  <p className="mt-1 text-[11px] text-zinc-600">
                    Arrive by {route.arrivalTarget} · refresh every {route.refreshMinutes} min
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href={`/routes/${route.id}`}
                    className="rounded-md border border-white/10 px-3 py-1.5 text-xs text-zinc-300 hover:border-white/20"
                  >
                    Open
                  </Link>
                  <Link
                    href={`/routes/${route.id}/edit`}
                    className="rounded-md border border-white/10 px-3 py-1.5 text-xs text-zinc-300 hover:border-white/20"
                  >
                    Edit
                  </Link>
                  <DeleteRouteButton id={route.id} name={route.name} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
}
