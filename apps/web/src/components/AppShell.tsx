"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ReactNode, useEffect, useState, Suspense } from "react";
import { api, API_BASE } from "@/lib/api";

function SidebarMenu() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeTab = searchParams.get("tab") || "overview";

  const handleTabClick = (tabId: string) => {
    router.push(`/documents?tab=${tabId}`);
  };

  return (
    <nav className="flex flex-col gap-1">
      {[
        { 
          id: "overview",
          label: "Tổng quan", 
          icon: (
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          )
        },
        { 
          id: "reports",
          label: "Kho báo cáo", 
          icon: (
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
            </svg>
          )
        },
        { 
          id: "debug",
          label: "Debug truy xuất", 
          icon: (
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          )
        },
      ].map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => handleTabClick(item.id)}
          className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium transition ${
            activeTab === item.id
              ? "bg-ink-800 text-white ring-1 ring-ink-700/60"
              : "text-ink-400 hover:bg-ink-900/40 hover:text-white"
          }`}
        >
          <span className={activeTab === item.id ? "text-white" : "text-ink-500"}>{item.icon}</span>
          {item.label}
        </button>
      ))}
    </nav>
  );
}

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
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-ink-800 border border-ink-700 shadow-sm">
              <svg className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-ink-300">
                FinRAG Admin
              </p>
              <h1 className="text-xs text-ink-400">Quản trị hệ thống</h1>
            </div>
          </div>

          {/* Admin Menu */}
          <Suspense fallback={<div className="h-20 animate-pulse bg-ink-900 rounded-lg" />}>
            <SidebarMenu />
          </Suspense>
        </div>

        {/* Bottom Navigation */}
        <div className="space-y-2">
          <Link
            href="/"
            className="flex items-center justify-center gap-1.5 w-full rounded-lg bg-ink-900/60 hover:bg-ink-850 py-2 text-xs font-semibold text-ink-300 hover:text-white transition-all border border-ink-800"
          >
            <svg className="h-3.5 w-3.5 text-ink-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
            Trang chủ
          </Link>
          
          <Link
            href="/chat"
            className="flex items-center justify-center gap-1.5 w-full rounded-lg bg-ink-800 hover:bg-ink-700 py-2 text-xs font-semibold text-white transition-all border border-ink-700/60"
          >
            <svg className="h-3.5 w-3.5 text-ink-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            Trò chuyện AI
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
          <Link href="/" className="text-xs text-ink-400 font-semibold hover:text-white transition-all">
            ← Trang chủ
          </Link>
          <p className="font-semibold text-white text-sm">FinRAG Admin</p>
          <Link href="/chat" className="text-xs text-brand-400 font-semibold hover:text-brand-300 transition-all">
            Trò chuyện →
          </Link>
        </header>
        <main className="flex flex-1 flex-col overflow-hidden">{children}</main>
      </div>
    </div>
  );
}
