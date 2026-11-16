"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DashboardClient } from "@/app/dashboard/DashboardClient";
import { OverviewClient } from "@/app/OverviewClient";
import type { CurrentPayload, OverviewPayload } from "@/lib/types";

type DetailPage = { routeId: number; name: string; initial: CurrentPayload };

export function HomePager({
  overview,
  details,
}: {
  overview: OverviewPayload;
  details: DetailPage[];
}) {
  const scrollerRef = useRef<HTMLElement>(null);
  const [active, setActive] = useState(0);
  const pageCount = details.length + 1;

  const goTo = useCallback((index: number) => {
    const element = scrollerRef.current;
    if (!element) return;
    element.scrollTo({ left: index * element.clientWidth, behavior: "smooth" });
  }, []);

  useEffect(() => {
    const element = scrollerRef.current;
    if (!element) return;
    let frame = 0;
    function onScroll() {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const node = scrollerRef.current;
        if (!node) return;
        const width = node.clientWidth;
        if (width === 0) return;
        setActive(Math.max(0, Math.min(pageCount - 1, Math.round(node.scrollLeft / width))));
      });
    }
    element.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      element.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(frame);
    };
  }, [pageCount]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
      const next = active + (event.key === "ArrowRight" ? 1 : -1);
      goTo(Math.max(0, Math.min(pageCount - 1, next)));
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, goTo, pageCount]);

  const labels = ["Overview", ...details.map((detail) => detail.name)];

  return (
    <div>
      <div className="sticky top-0 z-30 border-b border-white/5 bg-[#070b10]/95 backdrop-blur">
        <div className="mx-auto grid max-w-6xl grid-cols-[1fr_auto_1fr] items-center gap-2 px-4 py-2">
          <div aria-hidden="true" />
          <div className="flex min-w-0 items-center gap-1 overflow-x-auto">
            {labels.map((label, index) => (
              <button
                key={`${index}-${label}`}
                type="button"
                onClick={() => goTo(index)}
                aria-label={index === 0 ? "Overview" : `${label} details`}
                aria-current={active === index ? "page" : undefined}
                className="group shrink-0 rounded-full p-1.5"
              >
                <span
                  className={`block h-2 w-2 rounded-full transition ${
                    active === index
                      ? "bg-emerald-400"
                      : "bg-zinc-600 group-hover:bg-zinc-400"
                  }`}
                />
              </button>
            ))}
          </div>
          <div className="flex items-center justify-end gap-1">
            <button
              type="button"
              onClick={() => goTo(active - 1)}
              disabled={active === 0}
              aria-label="Previous page"
              className="rounded-md border border-white/10 px-2 py-1 text-sm text-zinc-300 hover:border-white/20 disabled:opacity-30"
            >
              ‹
            </button>
            <button
              type="button"
              onClick={() => goTo(active + 1)}
              disabled={active === pageCount - 1}
              aria-label="Next page"
              className="rounded-md border border-white/10 px-2 py-1 text-sm text-zinc-300 hover:border-white/20 disabled:opacity-30"
            >
              ›
            </button>
          </div>
        </div>
      </div>

      <main
        ref={scrollerRef}
        className="flex snap-x snap-mandatory overflow-x-auto scroll-smooth"
      >
        <section className="w-full min-w-full shrink-0 snap-start">
          <OverviewClient initial={overview} />
        </section>
        {details.map((detail) => (
          <section
            key={detail.routeId}
            className="w-full min-w-full shrink-0 snap-start"
            aria-label={`${detail.name} details`}
          >
            <DashboardClient initial={detail.initial} routeId={detail.routeId} />
          </section>
        ))}
      </main>
    </div>
  );
}
