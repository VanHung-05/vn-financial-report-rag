import { useState } from "react";
import type { CitationSource } from "@/lib/api";

export function Citations({ sources }: { sources: CitationSource[] }) {
  const [selected, setSelected] = useState<CitationSource | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number>(-1);

  if (!sources.length) return null;

  const isDbVerified = sources.some((s) => s.is_db_verified);

  return (
    <div className="mt-3 border-t border-ink-800/80 pt-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wider text-ink-400">
          Nguồn trích dẫn
        </p>
        {isDbVerified && (
          <span className="flex items-center gap-1 rounded-full bg-ink-800 px-2 py-0.5 text-[10px] font-medium text-ink-100 ring-1 ring-ink-700">
            <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            Số liệu Database xác thực
          </span>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {sources.map((s, i) => (
          <button
            key={s.chunk_id ?? i}
            type="button"
            onClick={() => {
              setSelected(s);
              setSelectedIndex(i);
            }}
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs transition-all ${
              s.is_db_verified
                ? "border-ink-700 bg-ink-800 text-white hover:border-ink-600 hover:bg-ink-750"
                : "border-ink-800 bg-ink-950/40 text-ink-300 hover:border-ink-700 hover:bg-ink-900/60"
            }`}
          >
            <span className={`font-semibold ${s.is_db_verified ? "text-white" : "text-ink-400"}`}>
              [{i + 1}]
            </span>
            <span className="truncate max-w-[120px] sm:max-w-[200px]">
              {s.ticker ? `${s.ticker} · ` : ""}
              {s.section ?? s.report_period ?? "Tài liệu"}
            </span>
            {s.page_start != null && (
              <span className="text-[10px] text-ink-500">Tr. {s.page_start}</span>
            )}
            {s.score != null && !s.is_db_verified && (
              <span className="text-[10px] text-ink-500">({Math.round(s.score * 100)}%)</span>
            )}
          </button>
        ))}
      </div>

      {/* --- Citation Preview Modal --- */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink-950/80 backdrop-blur-sm transition-all duration-300">
          <div 
            onClick={(e) => e.stopPropagation()} 
            className="w-full max-w-2xl rounded-2xl border border-ink-800 bg-ink-900 shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in fade-in zoom-in-95 duration-200"
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-ink-800 px-6 py-4 bg-ink-950/40">
              <div>
                <h3 className="text-base font-semibold text-white flex items-center gap-2">
                  <span className={selected.is_db_verified ? "text-emerald-400" : "text-brand-400"}>
                    [{selectedIndex + 1}]
                  </span>
                  Chi tiết nguồn tài liệu
                </h3>
                <p className="mt-1 text-xs text-ink-400 truncate max-w-[400px] sm:max-w-[500px]">
                  {selected.doc_title ?? "Báo cáo tài chính"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSelected(null);
                  setSelectedIndex(-1);
                }}
                className="rounded-lg p-1.5 text-ink-400 hover:bg-ink-800 hover:text-white"
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div className="scrollbar-thin flex-1 overflow-y-auto p-6 space-y-4">
              {/* Metadata Cards */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {selected.ticker && (
                  <div className="rounded-xl border border-ink-800 bg-ink-950/30 p-3">
                    <p className="text-[10px] text-ink-500 uppercase font-medium">Doanh nghiệp</p>
                    <p className="mt-1 text-xs font-semibold text-white">{selected.ticker}</p>
                  </div>
                )}
                {selected.report_period && (
                  <div className="rounded-xl border border-ink-800 bg-ink-950/30 p-3">
                    <p className="text-[10px] text-ink-500 uppercase font-medium">Kỳ báo cáo</p>
                    <p className="mt-1 text-xs font-semibold text-white">{selected.report_period}</p>
                  </div>
                )}
                {selected.page_start != null && (
                  <div className="rounded-xl border border-ink-800 bg-ink-950/30 p-3">
                    <p className="text-[10px] text-ink-500 uppercase font-medium">Vị trí trang</p>
                    <p className="mt-1 text-xs font-semibold text-white">
                      Trang {selected.page_start}
                      {selected.page_end && selected.page_end !== selected.page_start ? ` – ${selected.page_end}` : ""}
                    </p>
                  </div>
                )}
                <div className="rounded-xl border border-ink-800 bg-ink-950/30 p-3">
                  <p className="text-[10px] text-ink-500 uppercase font-medium">Độ xác thực</p>
                  {selected.is_db_verified ? (
                    <span className="mt-1 inline-flex items-center text-xs font-semibold text-white gap-1">
                      <svg className="h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                      Đã đối soát
                    </span>
                  ) : selected.score != null ? (
                    <span className={`mt-1 inline-flex items-center text-xs font-semibold ${
                      selected.score >= 0.7 ? "text-white" : selected.score >= 0.4 ? "text-ink-300" : "text-ink-400"
                    }`}>
                      {Math.round(selected.score * 100)}% Match
                    </span>
                  ) : (
                    <span className="mt-1 inline-flex items-center text-xs font-semibold text-ink-400">
                      Ngữ cảnh liên quan
                    </span>
                  )}
                </div>
              </div>

              {/* Section title if present */}
              {selected.section && (
                <div className="text-xs text-ink-300 font-medium bg-ink-950/40 px-3 py-2 rounded-lg border border-ink-800/50">
                  <span className="text-ink-500 mr-1.5">Phần:</span> {selected.section}
                </div>
              )}

              {/* Text/Content Area */}
              <div>
                <p className="mb-2 text-xs font-semibold text-ink-400">Nội dung trích xuất gốc</p>
                <div className="rounded-xl border border-ink-800 bg-ink-950 p-4 font-mono text-xs text-ink-200 leading-relaxed overflow-x-auto whitespace-pre-wrap max-h-72 select-text">
                  {selected.content || "Không có nội dung chi tiết cho nguồn này."}
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex justify-end border-t border-ink-800 px-6 py-4 bg-ink-950/20">
              <button
                type="button"
                onClick={() => {
                  setSelected(null);
                  setSelectedIndex(-1);
                }}
                className="rounded-lg bg-ink-800 hover:bg-ink-700 px-4 py-2 text-xs font-medium text-white transition-all"
              >
                Đóng lại
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
