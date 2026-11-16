"use client";

import { useState } from "react";

export function LogoutButton() {
  const [busy, setBusy] = useState(false);

  async function logout() {
    setBusy(true);
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.assign("/login");
  }

  return (
    <button
      onClick={logout}
      disabled={busy}
      className="rounded-md border border-white/10 px-2.5 py-1.5 text-xs text-zinc-400 transition hover:border-white/20 hover:text-zinc-200 disabled:opacity-50"
    >
      {busy ? "..." : "Sign out"}
    </button>
  );
}
