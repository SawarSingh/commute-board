"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { RouteOptionsGrid } from "@/components/RouteOptions";
import type { Route, RouteOption } from "@/lib/types";
import { PlaceSearch, type PointValue } from "./PlaceSearch";

const inputClass =
  "w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-emerald-400/60";
const REFRESH_OPTIONS = [2, 3, 5, 10, 15];

export function SettingsForm({
  route,
  mode,
  mock,
}: {
  route: Route | null;
  mode: "create" | "edit";
  mock: boolean;
}) {
  const router = useRouter();
  const [name, setName] = useState(route?.name ?? "");
  const [origin, setOrigin] = useState<PointValue>({
    label: route?.originLabel ?? "",
    lat: route ? String(route.originLat) : "",
    lng: route ? String(route.originLng) : "",
  });
  const [dest, setDest] = useState<PointValue>({
    label: route?.destLabel ?? "",
    lat: route ? String(route.destLat) : "",
    lng: route ? String(route.destLng) : "",
  });
  const [via, setVia] = useState<PointValue>({
    label: route?.viaLabel ?? "",
    lat: route?.viaLat != null ? String(route.viaLat) : "",
    lng: route?.viaLng != null ? String(route.viaLng) : "",
  });
  const [arrivalTarget, setArrivalTarget] = useState(route?.arrivalTarget ?? "09:30");
  const [refreshMinutes, setRefreshMinutes] = useState(route?.refreshMinutes ?? 3);
  const [createReturn, setCreateReturn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [options, setOptions] = useState<RouteOption[]>([]);
  const [optionsBusy, setOptionsBusy] = useState(false);
  const [optionsError, setOptionsError] = useState<string | null>(null);

  useEffect(() => {
    const fromLat = Number(origin.lat);
    const fromLng = Number(origin.lng);
    const toLat = Number(dest.lat);
    const toLng = Number(dest.lng);
    if (
      !origin.lat ||
      !origin.lng ||
      !dest.lat ||
      !dest.lng ||
      !Number.isFinite(fromLat) ||
      !Number.isFinite(fromLng) ||
      !Number.isFinite(toLat) ||
      !Number.isFinite(toLng)
    ) {
      setOptions([]);
      setOptionsBusy(false);
      setOptionsError(null);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setOptionsBusy(true);
      setOptionsError(null);
      try {
        const params = new URLSearchParams({
          fromLat: String(fromLat),
          fromLng: String(fromLng),
          toLat: String(toLat),
          toLng: String(toLng),
        });
        const response = await fetch(`/api/route-options?${params.toString()}`, {
          signal: controller.signal,
          cache: "no-store",
        });
        const data = (await response.json().catch(() => ({}))) as {
          options?: RouteOption[];
          error?: string;
        };
        if (!response.ok) throw new Error(data.error ?? "Could not load route options");
        if (!controller.signal.aborted) setOptions(data.options ?? []);
      } catch (cause) {
        if (controller.signal.aborted) return;
        setOptionsError(
          cause instanceof Error ? cause.message : "Could not load route options",
        );
      } finally {
        if (!controller.signal.aborted) setOptionsBusy(false);
      }
    }, 350);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [origin.lat, origin.lng, dest.lat, dest.lng]);

  function chooseOption(option: RouteOption) {
    if (!option.pin) {
      if (option.source === "alternative") return;
      setVia({ label: "", lat: "", lng: "" });
      return;
    }
    setVia({
      label: option.label,
      lat: String(option.pin.lat),
      lng: String(option.pin.lng),
    });
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!origin.lat || !origin.label.trim()) {
      setError("Pick or name the From location before saving.");
      return;
    }
    if (!dest.lat || !dest.label.trim()) {
      setError("Pick the To location from the search suggestions.");
      return;
    }
    const viaFilled = via.label.trim().length > 0 || via.lat.length > 0 || via.lng.length > 0;
    if (viaFilled && (!via.lat || !via.label.trim())) {
      setError("Pick the via point from the suggestions, or clear it.");
      return;
    }
    if (name.trim().length === 0) {
      setError("Give this route a name.");
      return;
    }
    setBusy(true);
    setError(null);
    const response = await fetch("/api/routes", {
      method: mode === "create" ? "POST" : "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: route?.id,
        name,
        origin: { label: origin.label, lat: Number(origin.lat), lng: Number(origin.lng) },
        dest: { label: dest.label, lat: Number(dest.lat), lng: Number(dest.lng) },
        via: viaFilled
          ? { label: via.label, lat: Number(via.lat), lng: Number(via.lng) }
          : null,
        arrivalTarget,
        refreshMinutes,
      }),
    });
    const data = (await response.json().catch(() => ({}))) as {
      error?: string;
      route?: Route;
    };
    if (!response.ok) {
      setError(data.error ?? "Could not save");
      setBusy(false);
      return;
    }
    const saved = data.route;
    if (saved && createReturn && !saved.pairedRouteId) {
      await fetch("/api/routes/pair", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: saved.id }),
      }).catch(() => null);
    }
    router.push(mode === "edit" && route ? `/routes/${route.id}` : "/");
    router.refresh();
  }

  const viaLat = Number(via.lat);
  const viaLng = Number(via.lng);
  const optionList = options.map((option) => ({
    ...option,
    selected:
      via.lat && via.lng
        ? Boolean(
            option.pin &&
              Math.abs(option.pin.lat - viaLat) < 0.001 &&
              Math.abs(option.pin.lng - viaLng) < 0.001,
          )
        : option.source === "fastest",
  }));
  const customVia = Boolean(via.lat) && !optionList.some((option) => option.selected);

  return (
    <form onSubmit={save} className="mt-6 space-y-5">
      {mock ? (
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          TOMTOM_API_KEY is not set. Search and traffic are simulated with a small Delhi list; add a
          key to .env.local for live results.
        </p>
      ) : null}

      <label className="block text-xs text-zinc-400">
        Route name
        <input
          className={`${inputClass} mt-1`}
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Home to office"
          required
        />
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <PlaceSearch
          title="From location"
          placeholder="Search the start point"
          value={origin}
          onChange={setOrigin}
          allowCurrentLocation
        />
        <PlaceSearch
          title="To location"
          placeholder="Search the destination"
          value={dest}
          onChange={setDest}
        />
        <div className="sm:col-span-2">
          <PlaceSearch
            title="Via (optional)"
            placeholder="e.g. IFFCO Chowk or Dwarka Expressway"
            value={via}
            onChange={setVia}
            optional
          />
        </div>
      </div>

      {optionsBusy ? (
        <p className="text-xs text-zinc-500">Finding route options...</p>
      ) : options.length > 0 ? (
        <section className="space-y-2">
          <div>
            <h2 className="text-sm font-semibold">Route options</h2>
            <p className="mt-0.5 text-xs text-zinc-500">
              Pick one to pin the path. Choosing the fastest option clears the Via point.
            </p>
          </div>
          <RouteOptionsGrid options={optionList} onUse={chooseOption} />
          {customVia ? (
            <p className="text-[11px] text-amber-300/80">
              Your saved Via is custom. Pick an option to replace it, or clear Via above.
            </p>
          ) : null}
        </section>
      ) : optionsError ? (
        <p className="text-xs text-rose-400">{optionsError}</p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-xs text-zinc-400">
          Arrive by (IST)
          <input
            className={`${inputClass} mt-1`}
            type="time"
            value={arrivalTarget}
            onChange={(event) => setArrivalTarget(event.target.value)}
            required
          />
        </label>
        <label className="block text-xs text-zinc-400">
          Refresh every
          <select
            className={`${inputClass} mt-1`}
            value={refreshMinutes}
            onChange={(event) => setRefreshMinutes(Number(event.target.value))}
          >
            {REFRESH_OPTIONS.map((minutes) => (
              <option key={minutes} value={minutes}>
                {minutes} minutes
              </option>
            ))}
          </select>
        </label>
      </div>

      {route?.pairedRouteId ? (
        <p className="rounded-lg border border-white/10 bg-white/[0.02] p-3 text-xs text-zinc-400">
          Return trip is linked. From, To, and Via changes sync to it automatically.{" "}
          <Link
            href={`/routes/${route.pairedRouteId}`}
            className="text-emerald-400 hover:underline"
          >
            Open it
          </Link>
        </p>
      ) : (
        <label className="flex items-start gap-2 rounded-lg border border-white/10 bg-white/[0.02] p-3 text-xs text-zinc-300">
          <input
            type="checkbox"
            checked={createReturn}
            onChange={(event) => setCreateReturn(event.target.checked)}
            className="mt-0.5 accent-emerald-500"
          />
          <span>
            Also track the return trip
            {origin.label && dest.label ? ` (${dest.label} → ${origin.label})` : ""}
            <span className="mt-0.5 block text-[11px] text-zinc-500">
              Creates a separate route with its own history, a later arrival target, and the same
              via point.
            </span>
          </span>
        </label>
      )}

      {error ? <p className="text-sm text-rose-400">{error}</p> : null}

      <button
        type="submit"
        disabled={busy}
        className="rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-400 disabled:opacity-50"
      >
        {busy ? "Saving..." : mode === "edit" ? "Update route" : "Save route"}
      </button>
    </form>
  );
}
