"use client";

import { useState } from "react";
import type { DeviceToken } from "@/lib/types";

type Props = {
  initial: DeviceToken[];
};

export function WidgetTokens({ initial }: Props) {
  const [tokens, setTokens] = useState(initial);
  const [label, setLabel] = useState("iPhone widget");
  const [secret, setSecret] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function createToken() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/widget-tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        token?: string;
        tokenId?: number;
        label?: string;
        createdAt?: string;
        error?: string;
      };
      if (!response.ok || !payload.token || !payload.tokenId || !payload.createdAt) {
        throw new Error(payload.error ?? "Could not create widget token");
      }
      setSecret(payload.token);
      setCopied(false);
      setTokens((prev) => [
        {
          id: payload.tokenId as number,
          label: payload.label ?? "iPhone widget",
          createdAt: payload.createdAt as string,
          lastUsedAt: null,
        },
        ...prev,
      ]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create widget token");
    } finally {
      setBusy(false);
    }
  }

  async function revokeToken(id: number) {
    if (!window.confirm("Revoke this widget token? The widget will stop updating.")) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/widget-tokens?id=${id}`, { method: "DELETE" });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Could not revoke token");
      setTokens((prev) => prev.filter((token) => token.id !== id));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not revoke token");
    } finally {
      setBusy(false);
    }
  }

  async function copySecret() {
    if (!secret) return;
    try {
      await navigator.clipboard.writeText(secret);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Could not copy automatically. Select the token and copy it manually.");
    }
  }

  return (
    <section className="mt-10 rounded-xl border border-white/10 bg-white/[0.03] p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Widget access</h2>
          <p className="mt-1 max-w-xl text-xs text-zinc-500">
            Create a read-only token for the iPhone widget. The widget only reads the next
            commute and leave-by time.
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-end gap-2">
        <label className="min-w-0 flex-1 text-xs text-zinc-400">
          <span className="mb-1 block">Token name</span>
          <input
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            maxLength={60}
            className="w-full rounded-md border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-emerald-400/50"
          />
        </label>
        <button
          type="button"
          onClick={createToken}
          disabled={busy}
          className="rounded-md bg-emerald-500 px-3 py-2 text-xs font-semibold text-emerald-950 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? "Working..." : "Create token"}
        </button>
      </div>

      {secret ? (
        <div className="mt-4 rounded-lg border border-emerald-400/30 bg-emerald-400/5 p-3">
          <p className="text-xs font-medium text-emerald-300">
            Copy this token now. It will not be shown again.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 break-all rounded bg-black/40 px-2 py-1.5 font-mono text-[11px] text-zinc-200">
              {secret}
            </code>
            <button
              type="button"
              onClick={copySecret}
              className="rounded-md border border-white/10 px-2.5 py-1.5 text-xs text-zinc-300 hover:border-white/20"
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <p className="mt-2 text-[11px] text-zinc-500">
            Use it in the iPhone app&apos;s widget setup screen.
          </p>
        </div>
      ) : null}

      {error ? <p className="mt-3 text-xs text-rose-300/80">{error}</p> : null}

      {tokens.length === 0 ? (
        <p className="mt-5 text-xs text-zinc-500">No widget tokens yet.</p>
      ) : (
        <ul className="mt-5 divide-y divide-white/5 border-t border-white/5">
          {tokens.map((token) => (
            <li key={token.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
              <div className="min-w-0">
                <p className="truncate text-xs font-medium text-zinc-200">{token.label}</p>
                <p className="mt-0.5 text-[11px] text-zinc-600">
                  Created{" "}
                  {new Date(token.createdAt).toLocaleDateString("en-IN", {
                    timeZone: "Asia/Kolkata",
                  })}
                  {token.lastUsedAt
                    ? ` · last used ${new Date(token.lastUsedAt).toLocaleString("en-IN", {
                        timeZone: "Asia/Kolkata",
                      })}`
                    : " · never used"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => revokeToken(token.id)}
                disabled={busy}
                className="rounded-md border border-white/10 px-2.5 py-1.5 text-[11px] text-zinc-400 hover:border-rose-400/30 hover:text-rose-300 disabled:opacity-50"
              >
                Revoke
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
