"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { RouteOptionsGrid } from "@/components/RouteOptions";
import {
  clockTime,
  dayLabel,
  deltaLabel,
  distanceLabel,
  durationLabel,
  hourLabel,
  nowHHMM,
} from "@/lib/format";
import type {
  CurrentPayload,
  GeoPoint,
  HistoryPayload,
  HistoryPoint,
  ProfileHour,
  RouteOption,
  RouteOptionsPayload,
  Snapshot,
  TrendPoint,
  YearPayload,
} from "@/lib/types";
import { getCurrentPosition } from "@/lib/geo";
import { istDateKey } from "@/lib/time";

const REFRESH_OPTIONS = [2, 3, 5, 10, 15];

function BarChart({ points }: { points: HistoryPoint[] }) {
  const max = Math.max(1, ...points.map((point) => point.durationS ?? 0));
  return (
    <div className="flex items-end gap-2">
      {points.map((point) => {
        const value = point.durationS;
        const height = value ? Math.max(8, Math.round((value / max) * 120)) : 4;
        return (
          <div key={point.dateKey} className="flex flex-1 flex-col items-center gap-1">
            <span className="tabular text-[10px] text-zinc-500">
              {value ? Math.round(value / 60) : "–"}
            </span>
            <div className="flex h-[120px] w-full items-end">
              <div
                style={{ height }}
                title={
                  value
                    ? `${dayLabel(point.dateKey)} · ${durationLabel(value)} · ${point.samples} readings`
                    : `${dayLabel(point.dateKey)} · no readings`
                }
                className={`w-full rounded-sm ${value ? "bg-emerald-500/70" : "bg-white/5"}`}
              />
            </div>
            <span className="text-[10px] text-zinc-500">{dayLabel(point.dateKey)}</span>
          </div>
        );
      })}
    </div>
  );
}

function HourProfile({
  hours,
  bestHour,
  selectedHour,
}: {
  hours: ProfileHour[];
  bestHour: number | null;
  selectedHour: number | null;
}) {
  const max = Math.max(1, ...hours.map((hour) => hour.durationS ?? 0));
  return (
    <div className="flex items-end gap-[3px]">
      {hours.map((hour) => {
        const value = hour.durationS;
        const height = value ? Math.max(6, Math.round((value / max) * 80)) : 3;
        const isBest = hour.hour === bestHour && value !== null;
        const isSelected = hour.hour === selectedHour;
        return (
          <div key={hour.hour} className="flex flex-1 flex-col items-center gap-1">
            <div className="flex h-[80px] w-full items-end">
              <div
                style={{ height }}
                title={
                  value
                    ? `${hourLabel(hour.hour)} · ${durationLabel(value)} average · ${hour.samples} readings`
                    : `${hourLabel(hour.hour)} · no readings`
                }
                className={`w-full rounded-sm ${
                  isBest ? "bg-emerald-400" : value ? "bg-emerald-500/40" : "bg-white/5"
                } ${isSelected ? "ring-1 ring-white/40" : ""}`}
              />
            </div>
            <span className={`text-[9px] ${isSelected ? "text-zinc-300" : "text-zinc-600"}`}>
              {hour.hour % 6 === 0 ? hourLabel(hour.hour).slice(0, 2) : ""}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function Sparkline({ points }: { points: TrendPoint[] }) {
  const max = Math.max(1, ...points.map((point) => point.durationS));
  return (
    <div className="flex h-[96px] items-end gap-[2px]">
      {points.map((point) => (
        <div
          key={point.capturedAt}
          style={{ height: Math.max(6, Math.round((point.durationS / max) * 88)) }}
          title={`${clockTime(point.capturedAt)} · ${durationLabel(point.durationS)}`}
          className="flex-1 rounded-sm bg-emerald-500/60"
        />
      ))}
    </div>
  );
}

export function DashboardClient({
  initial,
  routeId,
}: {
  initial: CurrentPayload;
  routeId: number;
}) {
  const [data, setData] = useState(initial);
  const [history, setHistory] = useState<HistoryPayload | null>(null);
  const [year, setYear] = useState<YearPayload | null>(null);
  const [time, setTime] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [override, setOverride] = useState<{ point: GeoPoint; data: CurrentPayload } | null>(null);
  const [locating, setLocating] = useState(false);
  const [reverse, setReverse] = useState<Snapshot | null>(null);
  const [reverseBusy, setReverseBusy] = useState(false);
  const [pairing, setPairing] = useState(false);
  const [options, setOptions] = useState<RouteOption[]>([]);
  const [optionsBusy, setOptionsBusy] = useState(true);
  const [optionsError, setOptionsError] = useState<string | null>(null);
  const [switching, setSwitching] = useState<string | null>(null);
  const [historyVersion, setHistoryVersion] = useState(0);

  const route = data.route;
  const refreshMinutes = route?.refreshMinutes ?? 3;

  const refresh = useCallback(
    async (force = false, ignoreOverride = false) => {
      setRefreshing(true);
      try {
        const params = new URLSearchParams({ routeId: String(routeId) });
        if (override && !ignoreOverride) {
          params.set("fromLat", String(override.point.lat));
          params.set("fromLng", String(override.point.lng));
        } else if (force) {
          params.set("force", "1");
        }
        const response = await fetch(`/api/current?${params.toString()}`, {
          cache: "no-store",
        });
        const payload = (await response.json().catch(() => ({}))) as Partial<CurrentPayload> & {
          error?: string;
        };
        if (!response.ok) throw new Error(payload.error ?? "Could not refresh");
        if (override && !ignoreOverride) {
          setOverride({ point: override.point, data: payload as CurrentPayload });
        } else {
          setData(payload as CurrentPayload);
        }
        setError(null);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Could not refresh");
      } finally {
        setRefreshing(false);
      }
    },
    [override, routeId],
  );

  const loadOptions = useCallback(async () => {
    setOptionsBusy(true);
    setOptionsError(null);
    try {
      const response = await fetch(`/api/route-options?routeId=${routeId}`, {
        cache: "no-store",
      });
      const payload = (await response.json().catch(() => ({}))) as Partial<RouteOptionsPayload> & {
        error?: string;
      };
      if (!response.ok) throw new Error(payload.error ?? "Could not load route options");
      setOptions(payload.options ?? []);
    } catch (cause) {
      setOptionsError(
        cause instanceof Error ? cause.message : "Could not load route options",
      );
    } finally {
      setOptionsBusy(false);
    }
  }, [routeId]);

  useEffect(() => {
    setTime(nowHHMM());
  }, []);

  useEffect(() => {
    void loadOptions();
  }, [
    loadOptions,
    data.route?.originLat,
    data.route?.originLng,
    data.route?.destLat,
    data.route?.destLng,
    data.route?.viaLat,
    data.route?.viaLng,
  ]);

  useEffect(() => {
    void refresh();
    const id = setInterval(() => void refresh(), refreshMinutes * 60 * 1000);
    return () => clearInterval(id);
  }, [refresh, refreshMinutes]);

  useEffect(() => {
    if (time.length === 0) return;
    if (override) return;
    let cancelled = false;
    async function load() {
      const [historyResponse, yearResponse] = await Promise.all([
        fetch(`/api/history?routeId=${routeId}&time=${encodeURIComponent(time)}`, {
          cache: "no-store",
        }),
        fetch(`/api/year?routeId=${routeId}&time=${encodeURIComponent(time)}`, {
          cache: "no-store",
        }),
      ]);
      const historyPayload = (await historyResponse.json().catch(() => null)) as
        | HistoryPayload
        | null;
      const yearPayload = (await yearResponse.json().catch(() => null)) as YearPayload | null;
      if (cancelled) return;
      if (historyResponse.ok && historyPayload) setHistory(historyPayload);
      if (yearResponse.ok && yearPayload) setYear(yearPayload);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [override, routeId, time, historyVersion]);

  async function toggleOverride() {
    if (override) {
      setOverride(null);
      return;
    }
    setLocating(true);
    setError(null);
    try {
      const point = await getCurrentPosition();
      const params = new URLSearchParams({
        routeId: String(routeId),
        fromLat: String(point.lat),
        fromLng: String(point.lng),
      });
      const response = await fetch(`/api/current?${params.toString()}`, { cache: "no-store" });
      const payload = (await response.json().catch(() => ({}))) as Partial<CurrentPayload> & {
        error?: string;
      };
      if (!response.ok) throw new Error(payload.error ?? "Could not use your location");
      setOverride({ point, data: payload as CurrentPayload });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not use your location");
    } finally {
      setLocating(false);
    }
  }

  async function loadReverse() {
    setReverseBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/reverse?routeId=${routeId}`, { cache: "no-store" });
      const payload = (await response.json().catch(() => ({}))) as {
        snapshot?: Snapshot;
        error?: string;
      };
      if (!response.ok || !payload.snapshot) {
        throw new Error(payload.error ?? "Could not get the return estimate");
      }
      setReverse(payload.snapshot);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not get the return estimate");
    } finally {
      setReverseBusy(false);
    }
  }

  async function trackReturn() {
    setPairing(true);
    setError(null);
    try {
      const response = await fetch("/api/routes/pair", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: routeId }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        pairedRoute?: { id: number };
        error?: string;
      };
      if (!response.ok || !payload.pairedRoute) {
        throw new Error(payload.error ?? "Could not create the return trip");
      }
      window.location.assign(`/routes/${payload.pairedRoute.id}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create the return trip");
      setPairing(false);
    }
  }

  async function changeRefresh(minutes: number) {
    const response = await fetch("/api/routes", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: routeId, refreshMinutes: minutes }),
    });
    if (response.ok) {
      const payload = (await response.json()) as { route: CurrentPayload["route"] };
      setData((current) => ({ ...current, route: payload.route }));
    }
  }

  async function useRouteOption(option: RouteOption) {
    if (!route || option.selected || switching) return;
    if (option.source === "alternative" && !option.pin) {
      setError("This route has no pin point to track.");
      return;
    }
    const confirmed = window.confirm(
      option.pin
        ? `Switch to "${option.label}"? This resets history for this route and its return trip.`
        : "Switch back to the fastest route? This resets history for this route and its return trip.",
    );
    if (!confirmed) return;
    setSwitching(option.key);
    setError(null);
    setOptions((current) =>
      current.map((item) => ({ ...item, selected: item.key === option.key })),
    );
    try {
      const response = await fetch("/api/routes", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: route.id,
          name: route.name,
          origin: {
            label: route.originLabel,
            lat: route.originLat,
            lng: route.originLng,
          },
          dest: {
            label: route.destLabel,
            lat: route.destLat,
            lng: route.destLng,
          },
          via: option.pin
            ? { label: option.label, lat: option.pin.lat, lng: option.pin.lng }
            : null,
          arrivalTarget: route.arrivalTarget,
          refreshMinutes: route.refreshMinutes,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        route?: CurrentPayload["route"];
        error?: string;
      };
      if (!response.ok || !payload.route) {
        throw new Error(payload.error ?? "Could not switch routes");
      }
      setData((current) => ({
        ...current,
        route: payload.route ?? current.route,
        snapshot: null,
        leaveBy: null,
        leaveByDurationS: null,
        leaveBySource: null,
        arriveByNow: null,
      }));
      setOverride(null);
      setReverse(null);
      setHistoryVersion((value) => value + 1);
      await refresh(true, true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not switch routes");
      void loadOptions();
    } finally {
      setSwitching(null);
    }
  }

  if (!route) return null;

  const view = override?.data ?? data;
  const usingLive = Boolean(override);
  const snapshot = view.snapshot;
  const delay = snapshot ? snapshot.durationS - snapshot.freeflowS : 0;
  const leaveByPast = view.leaveBy ? new Date(view.leaveBy).getTime() <= Date.now() : false;
  const leaveByTomorrow = view.leaveBy
    ? istDateKey(new Date(view.leaveBy)) !== istDateKey(new Date())
    : false;
  const bestHour = history?.bestHour ?? null;
  const historyDurations = (history?.points ?? [])
    .map((point) => point.durationS)
    .filter((value): value is number => value !== null)
    .sort((a, b) => a - b);
  const fastestS = historyDurations.length > 0 ? historyDurations[0] : null;
  const slowestS =
    historyDurations.length > 0 ? historyDurations[historyDurations.length - 1] : null;
  const typicalS =
    historyDurations.length > 0 ? historyDurations[Math.floor(historyDurations.length / 2)] : null;
  const selectedHour = time ? Number(time.slice(0, 2)) : null;
  const targetMinutes =
    Number(route.arrivalTarget.slice(0, 2)) * 60 + Number(route.arrivalTarget.slice(3, 5));
  const selectedMinutes = time
    ? Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5))
    : null;
  const budgetS = selectedMinutes === null ? null : (targetMinutes - selectedMinutes) * 60;
  const onTimeDays =
    budgetS !== null && budgetS > 0 && historyDurations.length > 0
      ? historyDurations.filter((duration) => duration <= budgetS).length
      : null;
  const typicalForNowS = typicalS ?? snapshot?.historicS ?? null;
  const typicalLabelText =
    typicalS !== null ? (time ? `Typical at ${time}` : "7-day typical") : "TomTom typical";

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      {view.mock ? (
        <div className="mb-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          Demo mode: add TOMTOM_API_KEY to .env.local for real Delhi traffic. Times are simulated.
        </div>
      ) : null}
      {view.warning ? (
        <div className="mb-3 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
          {view.warning}
        </div>
      ) : null}
      {error ? (
        <div className="mb-3 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
          {error}
        </div>
      ) : null}

      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-zinc-500">{route.name}</p>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-zinc-300">
            <span className="truncate">
              {usingLive ? "Current location" : route.originLabel}
            </span>
            <span className="text-emerald-400">→</span>
            <span className="truncate">{route.destLabel}</span>
          </div>
          {route.viaLabel ? (
            <p className="mt-1 text-[11px] text-zinc-500">via {route.viaLabel}</p>
          ) : null}
          {usingLive ? (
            <p className="mt-1 text-[11px] text-zinc-500">
              One-off estimate from your current location. Not saved to this route&apos;s history.
            </p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => void toggleOverride()}
          disabled={locating}
          aria-pressed={usingLive}
          className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition ${
            usingLive
              ? "border-emerald-400/40 text-emerald-300"
              : "border-white/10 text-zinc-300 hover:border-white/20"
          } disabled:opacity-50`}
        >
          <span
            className={`relative h-3 w-5 rounded-full transition ${
              usingLive ? "bg-emerald-500" : "bg-zinc-600"
            }`}
          >
            <span
              className={`absolute top-0.5 h-2 w-2 rounded-full bg-white transition-all ${
                usingLive ? "left-2.5" : "left-0.5"
              }`}
            />
          </span>
          {locating
            ? "Locating..."
            : usingLive
              ? "Starting from current location"
              : "Start from current location"}
        </button>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2 text-xs">
        {route.pairedRouteId ? (
          <Link
            href={`/routes/${route.pairedRouteId}`}
            className="rounded-full border border-white/10 px-3 py-1.5 text-zinc-300 hover:border-white/20"
          >
            Return trip →
          </Link>
        ) : (
          <>
            <button
              type="button"
              onClick={() => void loadReverse()}
              disabled={reverseBusy}
              title={`${route.destLabel} → ${route.originLabel}`}
              className="rounded-full border border-white/10 px-3 py-1.5 text-zinc-300 hover:border-white/20 disabled:opacity-50"
            >
              {reverse
                ? `Return trip now · ${durationLabel(reverse.durationS)}`
                : reverseBusy
                  ? "Checking return trip..."
                  : "Return trip now"}
            </button>
            <button
              type="button"
              onClick={() => void trackReturn()}
              disabled={pairing}
              className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-3 py-1.5 text-emerald-300 hover:border-emerald-400/60 disabled:opacity-50"
            >
              {pairing ? "Creating..." : "Track return trip"}
            </button>
          </>
        )}
      </div>

      <section className="mb-4 rounded-2xl border border-white/10 bg-white/[0.02] p-4">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold">Route options</h2>
            <p className="mt-0.5 text-xs text-zinc-500">
              Three ways to drive this route. Pick one to track it; switching resets history.
            </p>
          </div>
          {optionsBusy ? (
            <span className="text-[11px] text-zinc-500">Loading maps...</span>
          ) : null}
        </div>
        <div className="mt-3">
          {options.length > 0 ? (
            <RouteOptionsGrid options={options} onUse={useRouteOption} busyKey={switching} />
          ) : optionsBusy ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {[0, 1, 2].map((index) => (
                <div
                  key={index}
                  className="h-56 animate-pulse rounded-xl border border-white/5 bg-white/[0.02]"
                />
              ))}
            </div>
          ) : optionsError ? (
            <p className="text-xs text-rose-400">{optionsError}</p>
          ) : null}
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="flex min-h-[260px] flex-col rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <div className="flex items-start justify-between">
            <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">Drive time now</p>
            <span className="tabular rounded-full border border-white/10 px-2 py-0.5 text-[10px] uppercase tracking-wider text-zinc-400">
              {snapshot ? snapshot.source : "—"}
            </span>
          </div>
          <p className="tabular mt-3 font-mono text-6xl font-semibold leading-none">
            {snapshot ? durationLabel(snapshot.durationS) : "—"}
          </p>
          {snapshot ? (
            <p className={`mt-2 text-sm ${delay > 60 ? "text-rose-400" : "text-emerald-400"}`}>
              {deltaLabel(delay)} vs free flow
            </p>
          ) : (
            <p className="mt-2 text-sm text-zinc-500">Waiting for the first reading</p>
          )}
          {snapshot && typicalForNowS !== null ? (
            <p className="mt-1 text-xs text-zinc-500">
              {typicalLabelText}: <span className="text-zinc-300">{durationLabel(typicalForNowS)}</span>{" "}
              <span
                className={
                  snapshot.durationS > typicalForNowS ? "text-rose-400" : "text-emerald-400"
                }
              >
                {deltaLabel(snapshot.durationS - typicalForNowS)}
              </span>
            </p>
          ) : null}
          {view.arriveByNow ? (
            <p className="mt-1 text-xs text-zinc-500">
              Leave now → arrive{" "}
              <span className="tabular text-zinc-300">{clockTime(view.arriveByNow)}</span>
            </p>
          ) : null}

          <div className="mt-auto grid grid-cols-2 gap-3 border-t border-white/5 pt-4">
            <div>
              <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">Leave by</p>
              <p className="tabular mt-1 font-mono text-2xl font-semibold">
                {view.leaveBy ? (leaveByPast ? "Now" : clockTime(view.leaveBy)) : "—"}
              </p>
              <p className="mt-0.5 text-[10px] text-zinc-500">
                to arrive by {route.arrivalTarget}
                {leaveByTomorrow ? " tomorrow" : ""}
                {view.leaveBySource === "week"
                  ? ` · predicted ${durationLabel(view.leaveByDurationS ?? 0)} (last 7 days)`
                  : view.leaveBySource === "year"
                    ? ` · predicted ${durationLabel(view.leaveByDurationS ?? 0)} (last year)`
                    : view.leaveBySource === "current"
                      ? " · current ETA"
                      : ""}
              </p>
            </div>
            <div className="text-right">
              <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">Distance</p>
              <p className="tabular mt-1 font-mono text-2xl font-semibold">
                {snapshot ? distanceLabel(snapshot.distanceM) : "—"}
              </p>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[11px] text-zinc-500">
            <span>
              {snapshot
                ? `Reading at ${clockTime(snapshot.capturedAt)} IST${
                    usingLive ? " · live from your location" : ""
                  }`
                : "No data yet"}
              {refreshing ? " · refreshing" : ""}
            </span>
            <div className="flex items-center gap-2">
              <select
                value={refreshMinutes}
                onChange={(event) => void changeRefresh(Number(event.target.value))}
                className="rounded-md border border-white/10 bg-[#0d1219] px-2 py-1 text-[11px] text-zinc-200"
              >
                {REFRESH_OPTIONS.map((minutes) => (
                  <option key={minutes} value={minutes}>
                    every {minutes} min
                  </option>
                ))}
              </select>
              <button
                onClick={() => void refresh(true)}
                disabled={refreshing}
                className="rounded-md border border-white/10 px-2 py-1 text-[11px] text-zinc-300 hover:border-white/20 disabled:opacity-50"
              >
                Refresh
              </button>
            </div>
          </div>
        </section>

        {usingLive ? (
          <section className="flex min-h-[260px] flex-col rounded-2xl border border-dashed border-white/10 bg-white/[0.01] p-5 lg:col-span-2">
            <div>
              <h2 className="text-sm font-semibold">History paused</h2>
              <p className="mt-1 text-xs text-zinc-500">
                This estimate starts from your current location, so it is not part of the route
                history. Switch back to the fixed start to see the 7-day and last-year panels.
              </p>
            </div>
            <p className="mt-auto pt-4 text-[11px] text-zinc-600">
              Live estimate only · not saved to history
            </p>
          </section>
        ) : (
          <>
        <section className="flex min-h-[260px] flex-col rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold">Last 7 days</h2>
              <p className="mt-0.5 text-xs text-zinc-500">At the selected clock time.</p>
            </div>
            <input
              type="time"
              value={time}
              onChange={(event) => setTime(event.target.value)}
              className="rounded-md border border-white/10 bg-[#0d1219] px-2 py-1.5 text-xs text-zinc-200"
            />
          </div>
          {fastestS !== null ? (
            <div className="mt-4 grid grid-cols-3 gap-2 text-center">
              <div>
                <p className="text-[10px] uppercase tracking-[0.15em] text-zinc-600">Fastest</p>
                <p className="tabular mt-0.5 text-sm text-emerald-300">
                  {durationLabel(fastestS)}
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-[0.15em] text-zinc-600">Typical</p>
                <p className="tabular mt-0.5 text-sm text-zinc-200">
                  {typicalS !== null ? durationLabel(typicalS) : "—"}
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-[0.15em] text-zinc-600">Slowest</p>
                <p className="tabular mt-0.5 text-sm text-rose-300">
                  {slowestS !== null ? durationLabel(slowestS) : "—"}
                </p>
              </div>
            </div>
          ) : null}
          <div className="mt-5">
            {history && history.totalSamples > 0 ? (
              <BarChart points={history.points} />
            ) : (
              <p className="text-xs text-zinc-500">
                No readings yet. Keep the app open or run the worker, then come back.
              </p>
            )}
          </div>
          <p className="mt-auto pt-4 text-xs text-zinc-400">
            {budgetS !== null && budgetS <= 0
              ? `Pick a time before ${route.arrivalTarget} to see the on-time rate.`
              : onTimeDays !== null
                ? `On time ${onTimeDays} of ${historyDurations.length} days leaving at ${time}.`
                : "On-time rate appears once there is a day of data."}
          </p>
          {history?.availableSince ? (
            <p className="pt-1 text-[11px] text-zinc-600">
              Data since {history.availableSince}
              {history.totalSamples > 0 ? ` · ${history.totalSamples} readings` : ""}
            </p>
          ) : null}
        </section>

        <section className="flex min-h-[260px] flex-col rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <div>
            <h2 className="text-sm font-semibold">Today</h2>
            <p className="mt-0.5 text-xs text-zinc-500">Drive time through the day.</p>
          </div>
          <div className="mt-5">
            {history && history.trend.length > 0 ? (
              <Sparkline points={history.trend} />
            ) : (
              <p className="text-xs text-zinc-500">No readings yet today.</p>
            )}
          </div>
          {history && history.trend.length > 0 ? (
            <div className="mt-auto flex items-center justify-between pt-3 text-[10px] text-zinc-600">
              <span>{clockTime(history.trend[0].capturedAt)}</span>
              <span>{history.trend.length} slots</span>
              <span>{clockTime(history.trend[history.trend.length - 1].capturedAt)}</span>
            </div>
          ) : null}
        </section>

        <section className="flex min-h-[260px] flex-col rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <div>
            <h2 className="text-sm font-semibold">Best time to leave</h2>
            <p className="mt-0.5 text-xs text-zinc-500">Average by hour over the last 7 days.</p>
          </div>
          <div className="mt-5">
            {history && history.profile.some((hour) => hour.samples > 0) ? (
              <HourProfile
                hours={history.profile}
                bestHour={bestHour}
                selectedHour={selectedHour}
              />
            ) : (
              <p className="text-xs text-zinc-500">Hourly pattern appears once there is data.</p>
            )}
          </div>
          <p className="mt-auto pt-4 text-xs text-zinc-400">
            {bestHour !== null && history?.bestHourDurationS
              ? `Least traffic usually around ${hourLabel(bestHour)} (~${durationLabel(
                  history.bestHourDurationS,
                )}).`
              : "Best hour will appear once there is a day of data."}
          </p>
        </section>

        <section className="flex min-h-[260px] flex-col rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <div>
            <h2 className="text-sm font-semibold">Same week last year</h2>
            <p className="mt-0.5 text-xs text-zinc-500">
              {time ? `Average around ${time} IST, one year back.` : "One year back, same week."}
            </p>
          </div>
          <div className="mt-5">
            {year ? <BarChart points={year.points} /> : <p className="text-xs text-zinc-500">Loading...</p>}
          </div>
          <p className="mt-auto pt-4 text-xs text-zinc-400">
            {year && year.totalSamples > 0
              ? `${year.totalSamples} readings from the same week last year.`
              : year?.availableSince
                ? `Data since ${year.availableSince}. This panel fills in once the route has a full year of history.`
                : "No readings yet. The worker starts the year-over-year record."}
          </p>
        </section>

        <section className="flex min-h-[260px] flex-col rounded-2xl border border-dashed border-white/10 bg-white/[0.01] p-5">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-zinc-600">Reserved</p>
            <h2 className="mt-1 text-sm font-semibold text-zinc-400">Coming later</h2>
          </div>
          <ul className="mt-3 space-y-1.5 text-xs text-zinc-500">
            <li>Rideshare fare estimates with Uber / Ola deep links</li>
            <li>Metro and bus comparison for the same route</li>
            <li>Leave-by push alerts before the peak builds up</li>
          </ul>
          <p className="mt-auto pt-4 text-[11px] text-zinc-600">v2</p>
        </section>
          </>
        )}
      </div>
    </div>
  );
}
