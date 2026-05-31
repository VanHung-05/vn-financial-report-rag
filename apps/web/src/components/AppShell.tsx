"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ReactNode, useEffect, useState } from "react";
import { api, API_BASE } from "@/lib/api";

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [apiOk, setApiOk] = useState<boolean | null>(null);

  useEffect(() => {
    api
      .health()
      .then(() => setApiOk(true))
      .catch(() => setApiOk(false));
  }, []);

  // Root Page (Landing Page): Full Screen
  if (pathname === "/") {
    return <div className="flex min-h-screen flex-col w-full bg-ink-950">{children}</div>;
  }

  // Chat Page: Full Screen (ChatPanel will render its own local sidebar)
  if (pathname === "/chat") {
    return <div className="flex h-screen overflow-hidden flex-col w-full bg-ink-950">{children}</div>;
  }

  // Admin/Documents Page: Custom Admin Sidebar Layout (Screenshot 3)
  return (
    <div className="flex h-screen overflow-hidden bg-ink-950 text-ink-100">
      <aside className="hidden w-56 shrink-0 flex-col border-r border-ink-800 bg-ink-950/80 p-4 md:flex justify-between">
        <div>
          {/* Admin Header */}
          <div className="mb-8 flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-tr from-brand-600 to-emerald-500 shadow-md">
              <span className="text-sm">⚙</span>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-emerald-400">
                FinRAG Admin
              </p>
              <h1 className="text-xs text-ink-400">Quản trị hệ thống</h1>
            </div>
          </div>

          {/* Admin Menu */}
          <nav className="flex flex-col gap-1">
            {[
              { label: "Tổng quan", icon: "📊", active: true },
              { label: "Kho báo cáo", icon: "📁", active: false },
              { label: "Debug truy xuất", icon: "🔍", active: false },
              { label: "Tải lên tài liệu", icon: "📤", active: false },
            ].map((item, idx) => (
              <button
                key={idx}
                type="button"
                className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium transition ${
                  item.active
                    ? "bg-brand-600/20 text-brand-300 ring-1 ring-brand-500/20"
                    : "text-ink-400 hover:bg-ink-900/40 hover:text-white"
                }`}
              >
                <span>{item.icon}</span>
                {item.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Bottom Navigation */}
        <div className="space-y-4">
          <Link
            href="/chat"
            className="flex items-center justify-center gap-1.5 w-full rounded-lg bg-ink-800 hover:bg-ink-700 py-2 text-xs font-semibold text-white transition-all border border-ink-700/60"
          >
            ← Quay lại Chat
          </Link>
          
          <div className="rounded-lg border border-ink-800/80 bg-ink-900/30 p-2.5 text-[10px] text-ink-400">
            <p className="font-semibold text-ink-300">API Status</p>
            <p className="mt-1 truncate font-mono text-[9px] text-ink-500">{API_BASE}</p>
            <p className="mt-1.5 flex items-center gap-1.5">
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  apiOk === null
                    ? "animate-pulse bg-ink-500"
                    : apiOk
                      ? "bg-emerald-400"
                      : "bg-red-400"
                }`}
              />
              {apiOk === null ? "Checking..." : apiOk ? "Connected" : "Disconnected"}
            </p>
          </div>
        </div>
      </aside>

      {/* Main panel */}
      <div className="flex min-w-0 flex-1 flex-col h-full overflow-hidden">
        {/* Mobile Header */}
        <header className="flex items-center justify-between border-b border-ink-800 bg-ink-950/60 px-4 py-3 backdrop-blur md:hidden">
          <p className="font-semibold text-white text-sm">FinRAG Admin</p>
          <Link href="/chat" className="text-xs text-brand-400 font-semibold">
            ← Quay lại Chat
          </Link>
        </header>
        <main className="flex flex-1 flex-col overflow-hidden">{children}</main>
      </div>
    </div>
  );
}
