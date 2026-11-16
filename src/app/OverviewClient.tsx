"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { clockTime, deltaLabel, distanceLabel, durationLabel } from "@/lib/format";
import { getCurrentPosition } from "@/lib/geo";
import type { CurrentPayload, GeoPoint, OverviewPayload, RouteOverview } from "@/lib/types";

const POLL_MS = 60_000;

type LiveState = {
  point: GeoPoint | null;
  data: CurrentPayload | null;
  locating: boolean;
  error: string | null;
};

function sourceNote(source: string | null): string {
  if (source === "week") return "predicted from last 7 days";
  if (source === "year") return "predicted from last year";
  if (source === "current") return "current ETA";
  return "";
}

function RouteCard({
  item,
  live,
  onToggle,
}: {
  item: RouteOverview;
  live: LiveState | undefined;
  onToggle: (id: number) => void;
}) {
  const { route } = item;
  const liveData = live?.data ?? null;
  const snapshot = liveData?.snapshot ?? item.snapshot;
  const leaveBy = liveData ? liveData.leaveBy : item.timing.leaveBy;
  const leaveBySource = liveData ? liveData.leaveBySource : item.timing.leaveBySource;
  const arriveByNow =
    liveData?.snapshot && liveData.now
      ? new Date(new Date(liveData.now).getTime() + liveData.snapshot.durationS * 1000).toISOString()
      : item.timing.arriveByNow;
  const warning = liveData?.warning ?? item.warning;
  const usingLive = Boolean(liveData);
  const active = Boolean(live?.point);
  const delay = snapshot ? snapshot.durationS - snapshot.freeflowS : 0;
  const leaveByPast = leaveBy ? new Date(leaveBy).getTime() <= Date.now() : false;

  return (
    <div className="relative flex flex-col rounded-2xl border border-white/10 bg-white/[0.03] p-5 transition hover:border-emerald-400/40 hover:bg-white/[0.05]">
      <Link
        href={`/routes/${route.id}`}
        className="absolute inset-0 rounded-2xl"
        aria-label={`Open ${route.name}`}
      />
      <div className="pointer-events-none relative flex flex-1 flex-col">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold">{route.name}</h2>
            <p className="mt-1 truncate text-xs text-zinc-500">
              {usingLive ? "Current location" : route.originLabel}{" "}
              <span className="text-emerald-400">→</span> {route.destLabel}
              {route.viaLabel ? (
                <span className="text-zinc-600"> · via {route.viaLabel}</span>
              ) : null}
            </p>
          </div>
          <span className="tabular shrink-0 rounded-full border border-white/10 px-2 py-0.5 text-[10px] uppercase tracking-wider text-zinc-400">
            {snapshot ? snapshot.source : "—"}
          </span>
        </div>

        <div className="mt-4 flex items-end justify-between gap-2">
          <p className="tabular font-mono text-4xl font-semibold leading-none">
            {snapshot ? durationLabel(snapshot.durationS) : "—"}
          </p>
          {snapshot ? (
            <p className={`text-xs ${delay > 60 ? "text-rose-400" : "text-emerald-400"}`}>
              {deltaLabel(delay)} vs free flow
            </p>
          ) : (
            <p className="text-xs text-zinc-500">Waiting for first reading</p>
          )}
        </div>

        <dl className="mt-4 space-y-2 border-t border-white/5 pt-3 text-xs">
          <div className="flex items-baseline justify-between gap-2">
            <dt className="text-zinc-500">Leave now → arrive</dt>
            <dd className="tabular text-zinc-200">
              {arriveByNow ? clockTime(arriveByNow) : "—"}
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-2">
            <dt className="text-zinc-500">Arrive by {route.arrivalTarget} → leave</dt>
            <dd className="tabular text-zinc-200">
              {leaveBy ? (leaveByPast ? "Now" : clockTime(leaveBy)) : "—"}
            </dd>
          </div>
        </dl>

        <p className="mt-auto pt-3 text-[11px] text-zinc-600">
          {snapshot
            ? `${distanceLabel(snapshot.distanceM)} · ${
                usingLive
                  ? "live from your location · not saved to history"
                  : `reading ${clockTime(snapshot.capturedAt)} IST`
              }`
            : "No readings yet"}
          {!usingLive && leaveBySource ? ` · ${sourceNote(leaveBySource)}` : ""}
        </p>
        {warning ? <p className="pt-1 text-[11px] text-rose-300/80">{warning}</p> : null}
      </div>

      <div className="relative z-10 mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-white/5 pt-3">
        <span className="text-[11px] text-zinc-500">Start</span>
        <button
          type="button"
          onClick={() => onToggle(route.id)}
          aria-pressed={active}
          className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[11px] transition ${
            active
              ? "border-emerald-400/40 text-emerald-300"
              : "border-white/10 text-zinc-400 hover:border-white/20"
          }`}
        >
          <span
            className={`relative h-3 w-5 rounded-full transition ${
              active ? "bg-emerald-500" : "bg-zinc-600"
            }`}
          >
            <span
              className={`absolute top-0.5 h-2 w-2 rounded-full bg-white transition-all ${
                active ? "left-2.5" : "left-0.5"
              }`}
            />
          </span>
          {live?.locating ? "Locating..." : active ? "Current location" : "Fixed place"}
        </button>
      </div>
      {live?.error ? (
        <p className="relative z-10 pt-1 text-right text-[11px] text-rose-300/80">{live.error}</p>
      ) : null}
    </div>
  );
}

export function OverviewClient({ initial }: { initial: OverviewPayload }) {
  const [data, setData] = useState(initial);
  const [live, setLive] = useState<Record<number, LiveState>>({});
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const liveRef = useRef(live);

  useEffect(() => {
    liveRef.current = live;
  }, [live]);

  const refreshFixed = useCallback(async () => {
    const response = await fetch("/api/routes?refresh=1", { cache: "no-store" });
    const payload = (await response.json().catch(() => ({}))) as Partial<OverviewPayload> & {
      error?: string;
    };
    if (!response.ok) throw new Error(payload.error ?? "Could not refresh");
    setData(payload as OverviewPayload);
  }, []);

  const refreshLive = useCallback(async (routeId: number, point: GeoPoint) => {
    try {
      const params = new URLSearchParams({
        routeId: String(routeId),
        fromLat: String(point.lat),
        fromLng: String(point.lng),
      });
      const response = await fetch(`/api/current?${params.toString()}`, { cache: "no-store" });
      const payload = (await response.json().catch(() => ({}))) as Partial<CurrentPayload> & {
        error?: string;
      };
      if (!response.ok) throw new Error(payload.error ?? "Could not refresh live time");
      setLive((prev) => ({
        ...prev,
        [routeId]: { point, data: payload as CurrentPayload, locating: false, error: null },
      }));
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Could not refresh live time";
      setLive((prev) => ({
        ...prev,
        [routeId]: {
          point,
          data: prev[routeId]?.data ?? null,
          locating: false,
          error: message,
        },
      }));
    }
  }, []);

  const refreshAll = useCallback(async () => {
    setRefreshing(true);
    try {
      await refreshFixed();
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not refresh");
    }
    await Promise.all(
      Object.entries(liveRef.current).map(([id, entry]) =>
        entry.point ? refreshLive(Number(id), entry.point) : Promise.resolve(),
      ),
    );
    setRefreshing(false);
  }, [refreshFixed, refreshLive]);

  useEffect(() => {
    void refreshAll();
    const id = setInterval(() => void refreshAll(), POLL_MS);
    return () => clearInterval(id);
  }, [refreshAll]);

  const toggleLive = useCallback(
    async (routeId: number) => {
      if (liveRef.current[routeId]) {
        setLive((prev) => {
          const next = { ...prev };
          delete next[routeId];
          return next;
        });
        return;
      }
      setLive((prev) => ({
        ...prev,
        [routeId]: { point: null, data: null, locating: true, error: null },
      }));
      try {
        const point = await getCurrentPosition();
        setLive((prev) => ({
          ...prev,
          [routeId]: { point, data: prev[routeId]?.data ?? null, locating: true, error: null },
        }));
        await refreshLive(routeId, point);
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : "Could not get your location";
        setLive((prev) => ({
          ...prev,
          [routeId]: { point: null, data: null, locating: false, error: message },
        }));
      }
    },
    [refreshLive],
  );

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      {data.mock ? (
        <div className="mb-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          Demo mode: add TOMTOM_API_KEY to .env.local for real Delhi traffic. Times are simulated.
        </div>
      ) : null}
      {error ? (
        <div className="mb-3 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
          {error}
        </div>
      ) : null}

      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Your routes</h1>
          <p className="mt-1 text-sm text-zinc-400">
            Live drive times for every commute you track. Tap a route for history.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => void refreshAll()}
            disabled={refreshing}
            className="rounded-md border border-white/10 px-3 py-1.5 text-xs text-zinc-300 hover:border-white/20 disabled:opacity-50"
          >
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>
          <Link
            href="/routes/new"
            className="rounded-md bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-emerald-950 hover:bg-emerald-400"
          >
            Add route
          </Link>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {data.routes.map((item) => (
          <RouteCard
            key={item.route.id}
            item={item}
            live={live[item.route.id]}
            onToggle={toggleLive}
          />
        ))}
      </div>

      <p className="mt-5 text-[11px] text-zinc-600">
        Overview refreshes every minute. Leave-by uses predicted traffic at the departure time.
        Switch a route to start from your current location for a one-off live estimate.
      </p>
    </div>
  );
}
