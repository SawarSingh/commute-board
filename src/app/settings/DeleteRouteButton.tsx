"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function DeleteRouteButton({ id, name }: { id: number; name: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    if (!window.confirm(`Delete "${name}" and its history?`)) return;
    setBusy(true);
    setError(null);
    const response = await fetch(`/api/routes?id=${id}`, { method: "DELETE" });
    setBusy(false);
    if (!response.ok) {
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      setError(data.error ?? "Could not delete");
      return;
    }
    router.refresh();
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={() => void remove()}
        disabled={busy}
        className="rounded-md border border-rose-500/30 px-3 py-1.5 text-xs text-rose-300 hover:border-rose-400/60 disabled:opacity-50"
      >
        {busy ? "Deleting..." : "Delete"}
      </button>
      {error ? <span className="text-[11px] text-rose-400">{error}</span> : null}
    </span>
  );
}
