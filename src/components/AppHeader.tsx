import Link from "next/link";
import { LogoutButton } from "./LogoutButton";

export function AppHeader({ email }: { email: string }) {
  return (
    <header className="border-b border-white/5 bg-black/20">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
        <div className="flex items-center gap-5">
          <Link href="/" className="font-mono text-sm font-semibold tracking-tight">
            <span className="text-emerald-400">◉</span> commute<span className="text-zinc-500">board</span>
          </Link>
          <nav className="flex gap-3 text-xs text-zinc-400">
            <Link href="/" className="hover:text-zinc-100">
              Overview
            </Link>
            <Link href="/settings" className="hover:text-zinc-100">
              Routes
            </Link>
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden max-w-[180px] truncate text-xs text-zinc-500 sm:block">{email}</span>
          <LogoutButton />
        </div>
      </div>
    </header>
  );
}
