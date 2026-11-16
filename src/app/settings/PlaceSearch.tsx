"use client";

import { useEffect, useState } from "react";
import { getCurrentPosition } from "@/lib/geo";

export type PointValue = { label: string; lat: string; lng: string };

type Suggestion = {
  id: string;
  label: string;
  detail: string;
  lat: number;
  lng: number;
};

export function PlaceSearch({
  title,
  placeholder,
  value,
  onChange,
  allowCurrentLocation = false,
  optional = false,
}: {
  title: string;
  placeholder: string;
  value: PointValue;
  onChange: (next: PointValue) => void;
  allowCurrentLocation?: boolean;
  optional?: boolean;
}) {
  const [query, setQuery] = useState(value.label);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [locating, setLocating] = useState(false);
  const [fromDevice, setFromDevice] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setQuery(value.label);
  }, [value.label]);

  useEffect(() => {
    if (!open) return;
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setSuggestions([]);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setBusy(true);
      setError(null);
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(trimmed)}`, {
          signal: controller.signal,
          cache: "no-store",
        });
        const data = (await response.json().catch(() => ({}))) as {
          suggestions?: Suggestion[];
          error?: string;
        };
        if (!response.ok) throw new Error(data.error ?? "Search failed");
        if (!controller.signal.aborted) setSuggestions(data.suggestions ?? []);
      } catch (cause) {
        if (controller.signal.aborted) return;
        setError(cause instanceof Error ? cause.message : "Search failed");
      } finally {
        if (!controller.signal.aborted) setBusy(false);
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, open]);

  function type(text: string) {
    setQuery(text);
    setOpen(true);
    setFromDevice(false);
    onChange({ label: text, lat: "", lng: "" });
  }

  function select(suggestion: Suggestion) {
    onChange({
      label: suggestion.label,
      lat: String(suggestion.lat),
      lng: String(suggestion.lng),
    });
    setQuery(suggestion.label);
    setFromDevice(false);
    setSuggestions([]);
    setOpen(false);
  }

  function clear() {
    setQuery("");
    setFromDevice(false);
    onChange({ label: "", lat: "", lng: "" });
    setSuggestions([]);
    setOpen(false);
    setError(null);
  }

  async function useCurrentLocation() {    setLocating(true);
    setError(null);
    try {
      const point = await getCurrentPosition();
      const alias = query.trim();
      onChange({
        label: alias,
        lat: String(point.lat),
        lng: String(point.lng),
      });
      setQuery(alias);
      setFromDevice(true);
      setSuggestions([]);
      setOpen(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not get your location");
    } finally {
      setLocating(false);
    }
  }

  const trimmed = query.trim();
  const searching = trimmed.length >= 2;
  const showDropdown = open && searching;

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">{title}</p>
      <div
        className="relative"
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
        }}
      >
        <input
          value={query}
          onChange={(event) => type(event.target.value)}
          onFocus={() => setOpen(true)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && showDropdown && suggestions[0]) {
              event.preventDefault();
              select(suggestions[0]);
            }
            if (event.key === "Escape") setOpen(false);
          }}
          placeholder={placeholder}
          className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-emerald-400/60"
          autoComplete="off"
        />
        {showDropdown ? (
          <div className="absolute left-0 right-0 z-20 mt-1 overflow-hidden rounded-lg border border-white/10 bg-[#0d1219] shadow-2xl">
            {suggestions.map((suggestion) => (
              <button
                key={suggestion.id}
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => select(suggestion)}
                className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left transition hover:bg-white/5"
              >
                <span className="text-sm text-zinc-100">{suggestion.label}</span>
                {suggestion.detail ? (
                  <span className="text-xs text-zinc-500">{suggestion.detail}</span>
                ) : null}
              </button>
            ))}
            {searching && busy ? (
              <p className="px-3 py-2 text-xs text-zinc-500">Searching...</p>
            ) : null}
            {searching && !busy && suggestions.length === 0 ? (
              <p className="px-3 py-2 text-xs text-zinc-500">
                No matches. Try an area, landmark, or metro station.
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
      {allowCurrentLocation || (optional && (value.lat || value.label)) ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {allowCurrentLocation ? (
            <button
              type="button"
              onClick={() => void useCurrentLocation()}
              disabled={locating}
              className="inline-flex items-center gap-1.5 rounded-md border border-emerald-400/30 bg-emerald-500/10 px-2.5 py-1.5 text-xs text-emerald-300 transition hover:border-emerald-400/60 disabled:opacity-50"
            >
              <span aria-hidden>⌖</span>
              {locating ? "Getting your location..." : "Use current location"}
            </button>
          ) : null}
          {optional && (value.lat || value.label) ? (
            <button
              type="button"
              onClick={clear}
              className="rounded-md border border-white/10 px-2.5 py-1.5 text-xs text-zinc-400 transition hover:border-white/20 hover:text-zinc-200"
            >
              Clear
            </button>
          ) : null}
        </div>
      ) : null}
      <p className="mt-2 text-xs">
        {value.lat ? (
          <span className="tabular text-zinc-500">
            {Number(value.lat).toFixed(5)}, {Number(value.lng).toFixed(5)}
          </span>
        ) : (
          <span className={optional ? "text-zinc-500" : "text-amber-300/80"}>
            {optional
              ? "Optional — leave blank to use the fastest path"
              : "Pick a place from the suggestions"}
          </span>
        )}
      </p>
      {allowCurrentLocation && fromDevice && !value.label.trim() ? (
        <p className="mt-1 text-[11px] text-amber-300/80">
          Type a name for this start point (e.g. Home), then tap Use current location again.
        </p>
      ) : null}
      {allowCurrentLocation && fromDevice && value.label.trim() ? (
        <p className="mt-1 text-[11px] text-zinc-500">
          Saved as this route&apos;s fixed start. Use the board toggle to start from your live
          location later.
        </p>
      ) : null}
      {error ? <p className="mt-1 text-xs text-rose-400">{error}</p> : null}
    </div>
  );
}
