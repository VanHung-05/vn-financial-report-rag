"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ReactNode, useEffect, useState } from "react";
import { api, API_BASE } from "@/lib/api";

const NAV = [
  { href: "/chat", label: "Hỏi đáp", icon: "💬" },
  { href: "/documents", label: "Báo cáo", icon: "📊" },
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [apiOk, setApiOk] = useState<boolean | null>(null);

  useEffect(() => {
    api
      .health()
      .then(() => setApiOk(true))
      .catch(() => setApiOk(false));
  }, []);

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-56 shrink-0 flex-col border-r border-ink-800 bg-ink-950/80 p-4 md:flex">
        <div className="mb-8">
          <p className="text-xs font-medium uppercase tracking-widest text-brand-400">
            VN FinRAG
          </p>
          <h1 className="mt-1 text-lg font-semibold text-white">Báo cáo tài chính</h1>
        </div>
        <nav className="flex flex-1 flex-col gap-1">
          {NAV.map((item) => {
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm transition ${
                  active
                    ? "bg-brand-600/20 text-brand-300 ring-1 ring-brand-500/30"
                    : "text-ink-300 hover:bg-ink-800/80 hover:text-white"
                }`}
              >
                <span aria-hidden>{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto rounded-lg border border-ink-800 bg-ink-900/50 p-3 text-xs text-ink-400">
          <p className="font-medium text-ink-300">API</p>
          <p className="mt-1 truncate font-mono text-[10px]">{API_BASE}</p>
          <p className="mt-2 flex items-center gap-1.5">
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                apiOk === null
                  ? "animate-pulse bg-ink-500"
                  : apiOk
                    ? "bg-emerald-400"
                    : "bg-red-400"
              }`}
            />
            {apiOk === null ? "Đang kiểm tra…" : apiOk ? "Đã kết nối" : "Không kết nối"}
          </p>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-ink-800 bg-ink-950/60 px-4 py-3 backdrop-blur md:hidden">
          <p className="font-semibold text-white">VN FinRAG</p>
          <nav className="flex gap-2">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-lg px-3 py-1.5 text-sm ${
                  pathname.startsWith(item.href)
                    ? "bg-brand-600/20 text-brand-300"
                    : "text-ink-400"
                }`}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </header>
        <main className="flex flex-1 flex-col overflow-hidden">{children}</main>
      </div>
    </div>
  );
}
