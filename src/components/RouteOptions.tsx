"use client";

import { distanceLabel, durationLabel } from "@/lib/format";
import type { RouteOption } from "@/lib/types";
import { RouteMap } from "./RouteMap";

function cardTitle(option: RouteOption): string {
  if (option.source === "current") return "Your route";
  if (option.label.toLowerCase().startsWith("fastest")) return "Fastest";
  return `via ${option.label}`;
}

function cardDetail(option: RouteOption): string {
  if (option.source === "current") return `via ${option.label}`;
  if (option.source === "fastest") return "Fastest";
  return "Alternative";
}

export function RouteOptionCard({
  option,
  onUse,
  busy = false,
}: {
  option: RouteOption;
  onUse?: (option: RouteOption) => void;
  busy?: boolean;
}) {
  return (
    <article
      className={`overflow-hidden rounded-xl border bg-white/[0.03] transition ${
        option.selected ? "border-emerald-400/50" : "border-white/10"
      }`}
    >
      <RouteMap points={option.geometry} selected={option.selected} className="h-36 w-full" />
      <div className="p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{cardTitle(option)}</p>
            <p className="mt-0.5 truncate text-[11px] text-zinc-500">
              {cardDetail(option)} · {durationLabel(option.durationS)} ·{" "}
              {distanceLabel(option.distanceM)}
            </p>
          </div>
          {option.selected ? (
            <span className="shrink-0 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] uppercase tracking-wider text-emerald-300">
              Tracking
            </span>
          ) : (
            <span className="shrink-0 rounded-full border border-white/10 px-2 py-0.5 text-[10px] uppercase tracking-wider text-zinc-500">
              {option.source === "fastest" ? "Fastest" : "Alternative"}
            </span>
          )}
        </div>
        {onUse && !option.selected ? (
          <button
            type="button"
            onClick={() => onUse(option)}
            disabled={busy}
            className="mt-3 w-full rounded-md border border-white/10 px-3 py-1.5 text-xs text-zinc-300 transition hover:border-emerald-400/40 hover:text-emerald-300 disabled:opacity-50"
          >
            {busy
              ? "Switching..."
              : option.pin
                ? "Use this route"
                : "Use fastest"}
          </button>
        ) : null}
      </div>
    </article>
  );
}

export function RouteOptionsGrid({
  options,
  onUse,
  busyKey,
}: {
  options: RouteOption[];
  onUse?: (option: RouteOption) => void;
  busyKey?: string | null;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {options.map((option) => (
        <RouteOptionCard
          key={option.key}
          option={option}
          onUse={onUse}
          busy={busyKey === option.key}
        />
      ))}
    </div>
  );
}
