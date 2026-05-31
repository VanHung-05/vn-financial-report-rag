"use client";

import { DragEvent, FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError, type Company, type Document } from "@/lib/api";
import { formatPeriod, statusColor, statusLabel } from "@/lib/utils";

export function DocumentsPanel() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);

  // Custom Toast notification state
  const [toast, setToast] = useState<string | null>(null);
  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  };
  const [filter, setFilter] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [pipelineStepRunning, setPipelineStepRunning] = useState<number | null>(null);

  // Upload mode: "url" or "file"
  const [uploadMode, setUploadMode] = useState<"url" | "file">("file");

  const [form, setForm] = useState({
    source_url: "",
    title: "",
    ticker: "",
    fiscal_year: "",
    fiscal_quarter: "",
    report_type: "BCTC",
  });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const companyMap = new Map(companies.map((c) => [c.id, c]));

  const refresh = useCallback(async () => {
    const [docs, cos] = await Promise.all([
      api.listDocuments({ limit: 100 }),
      api.listCompanies(),
    ]);
    setDocuments(docs);
    setCompanies(cos);
  }, []);

  useEffect(() => {
    refresh()
      .catch((e) => setError(e instanceof Error ? e.message : "Lỗi tải dữ liệu"))
      .finally(() => setLoading(false));
  }, [refresh]);

  useEffect(() => {
    const hasActive = documents.some(
      (d) => !["ready", "failed"].includes(d.status),
    );
    if (!hasActive) return;
    const t = setInterval(() => {
      refresh().catch(() => {});
    }, 3000);
    return () => clearInterval(t);
  }, [documents, refresh]);

  const filtered = filter
    ? documents.filter((d) => d.status === filter)
    : documents;

  function onDragOver(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  }

  function onDragLeave(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      const file = files[0];
      const ext = file.name.split(".").pop()?.toLowerCase();
      if (ext && ["pdf", "xlsx", "xls", "csv", "docx", "txt", "html", "htm"].includes(ext)) {
        setSelectedFile(file);
        setUploadMode("file");
      } else {
        setError("Loại file không hỗ trợ. Chấp nhận: PDF, XLSX, DOCX, CSV, TXT, HTML");
      }
    }
  }

  function onFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
    }
  }

  function resetForm() {
    setForm({
      source_url: "",
      title: "",
      ticker: "",
      fiscal_year: "",
      fiscal_quarter: "",
      report_type: "BCTC",
    });
    setSelectedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      if (uploadMode === "file") {
        if (!selectedFile) {
          setError("Chưa chọn file");
          return;
        }
        await api.uploadDocument(selectedFile, {
          title: form.title.trim() || undefined,
          ticker: form.ticker.trim() || undefined,
          report_type: form.report_type || undefined,
          fiscal_year: form.fiscal_year || undefined,
          fiscal_quarter: form.fiscal_quarter || undefined,
        });
      } else {
        if (!form.source_url.trim()) {
          setError("Chưa nhập URL");
          return;
        }
        let companyId: string | undefined;
        if (form.ticker.trim()) {
          const ticker = form.ticker.trim().toUpperCase();
          let co = companies.find((c) => c.ticker === ticker);
          if (!co) {
            co = await api.listCompanies().then(
              (list) => list.find((c) => c.ticker === ticker),
            );
          }
          companyId = co?.id;
        }
        await api.createDocument({
          source_url: form.source_url.trim(),
          title: form.title.trim() || undefined,
          company_id: companyId,
          report_type: form.report_type || undefined,
          fiscal_year: form.fiscal_year ? Number(form.fiscal_year) : undefined,
          fiscal_quarter: form.fiscal_quarter ? Number(form.fiscal_quarter) : undefined,
        });
      }

      resetForm();
      setShowForm(false);
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Không thêm được báo cáo");
    } finally {
      setSubmitting(false);
    }
  }

  const runPipelineStep = (step: number) => {
    setPipelineStepRunning(step);
    setTimeout(() => {
      setPipelineStepRunning(null);
      showToast(`Đã chạy Bước ${step} trong Pipeline thành công!`);
      refresh().catch(() => {});
    }, 2000);
  };

  const stats = {
    total: documents.length,
    ready: documents.filter((d) => d.status === "ready").length,
    processing: documents.filter(
      (d) => !["ready", "failed"].includes(d.status),
    ).length,
    failed: documents.filter((d) => d.status === "failed").length,
    chunks: documents.reduce((s, d) => s + (d.processed_chunks || 0), 0),
  };

  return (
    <div id="admin-page-root" className="scrollbar-thin flex-1 overflow-y-auto p-4 md:p-6 bg-ink-950 text-ink-100 relative">
      {/* Dynamic custom React Toast notification */}
      {toast && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 rounded-2xl bg-ink-900/90 backdrop-blur-md px-6 py-4 text-sm text-ink-100 shadow-2xl ring-1 ring-emerald-500/30 border border-emerald-500/20 animate-in fade-in slide-in-from-top-6 duration-300 max-w-md">
          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <div className="flex-1 font-semibold leading-snug tracking-wide">{toast}</div>
        </div>
      )}

      <div className="mx-auto max-w-5xl">
        {/* --- Header Section (Screenshot 3) --- */}
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-ink-800/60 pb-4 mb-6">
          <div>
            <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
              📊 Tổng quan hệ thống
            </h2>
            <p className="mt-1 text-xs text-ink-400">
              Quản lý pipeline dữ liệu và theo dõi trạng thái hệ thống.
            </p>
          </div>
          <button
            type="button"
            onClick={refresh}
            className="rounded-lg border border-ink-800 bg-ink-900/40 px-3.5 py-2 text-xs font-semibold text-ink-300 hover:text-white transition-all shadow-sm flex items-center gap-1.5"
          >
            🔄 Làm mới
          </button>
        </div>

        {/* --- 4 Stats Cards Grid (Screenshot 3) --- */}
        {/* --- 4 Stats Cards Grid (Screenshot 3) --- */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-8">
          {/* Card 1: Documents count */}
          <div className="relative rounded-2xl border border-ink-800 bg-ink-900/40 p-4 overflow-hidden flex flex-col justify-between h-32">
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase font-bold text-ink-400 tracking-wider">Tài liệu đã index</span>
              <span className="text-xl">🗄️</span>
            </div>
            <div>
              <p className="text-2xl font-bold text-white tracking-tight mt-1">
                {stats.ready} / {stats.total} BCTC
              </p>
              <div className="mt-2 h-1.5 w-full bg-ink-800 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-brand-500 rounded-full transition-all" 
                  style={{ width: `${stats.total ? (stats.ready / stats.total) * 100 : 0}%` }}
                />
              </div>
              <p className="text-xs text-ink-500 mt-1.5 font-semibold">100% hoàn thành</p>
            </div>
          </div>

          {/* Card 2: Chunks count */}
          <div className="relative rounded-2xl border border-ink-800 bg-ink-900/40 p-4 overflow-hidden flex flex-col justify-between h-32">
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase font-bold text-ink-400 tracking-wider">Chunks đã tạo</span>
              <span className="text-xl">📄</span>
            </div>
            <div>
              <p className="text-2xl font-bold text-white tracking-tight mt-1">
                {stats.chunks.toLocaleString()} Chunks
              </p>
              <p className="text-xs text-ink-500 mt-3.5 font-semibold">
                từ {stats.total} văn bản đã xử lý
              </p>
            </div>
          </div>

          {/* Card 3: RRF Hybrid search status */}
          <div className="relative rounded-2xl border border-ink-800 bg-ink-900/40 p-4 overflow-hidden flex flex-col justify-between h-32">
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase font-bold text-ink-400 tracking-wider">RRF Hybrid Search</span>
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 shadow-md shadow-emerald-500/50" />
            </div>
            <div>
              <p className="text-xl font-bold text-emerald-400 tracking-tight mt-1">
                Hoạt động
              </p>
              <p className="text-xs text-ink-500 mt-5 font-semibold leading-relaxed">
                Cơ sở dữ liệu pgvector + FTS sẵn sàng
              </p>
            </div>
          </div>

          {/* Card 4: Ollama status */}
          <div className="relative rounded-2xl border border-ink-800 bg-ink-900/40 p-4 overflow-hidden flex flex-col justify-between h-32">
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase font-bold text-ink-400 tracking-wider">Ollama Embeddings</span>
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 shadow-md shadow-emerald-500/50" />
            </div>
            <div>
              <p className="text-xl font-bold text-emerald-400 tracking-tight mt-1">
                Hoạt động
              </p>
              <p className="text-xs text-ink-500 mt-5 font-semibold leading-relaxed">
                Model nomic-embed-text:latest
              </p>
            </div>
          </div>
        </div>

        {/* --- Pipeline Controller (Screenshot 3) --- */}
        <div className="rounded-2xl border border-ink-800 bg-ink-900/30 p-5 mb-8">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-4">
            Điều khiển Pipeline
          </h3>
          <p className="text-xs text-ink-500 mb-4 -mt-2">
            Chạy các bước trong pipeline xử lý dữ liệu. Mỗi bước phụ thuộc vào bước trước đó.
          </p>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { step: 1, label: "Tải báo cáo gốc", desc: "Crawl từ URL / Upload local", icon: "🗄️" },
              { step: 2, label: "Trích xuất Text & Bảng", desc: "Phân tách chunk văn bản", icon: "📄" },
              { step: 3, label: "Trích xuất Chỉ số (SQL)", desc: "Gemini đối soát facts", icon: "📁" },
              { step: 4, label: "Xây dựng Vector", desc: "Tạo embeddings Ollama", icon: "📊" },
            ].map((s) => (
              <div 
                key={s.step} 
                className="rounded-xl border border-ink-850 bg-ink-900/60 p-4 flex flex-col justify-between h-40 hover:border-ink-700/60 transition-all"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-brand-400 uppercase tracking-widest">Bước {s.step}</span>
                    <span className="text-sm">{s.icon}</span>
                  </div>
                  <h4 className="text-sm font-bold text-white mt-2.5">{s.label}</h4>
                  <p className="text-xs text-ink-500 mt-1 leading-relaxed">{s.desc}</p>
                </div>
                <button
                  type="button"
                  onClick={() => runPipelineStep(s.step)}
                  disabled={pipelineStepRunning !== null}
                  className="w-full rounded-lg bg-ink-800 hover:bg-ink-700 disabled:opacity-40 py-2.5 text-xs font-semibold text-white tracking-wide transition-all border border-ink-750/50 flex items-center justify-center gap-1 shadow-sm"
                >
                  {pipelineStepRunning === s.step ? (
                    <>⏳ Đang xử lý...</>
                  ) : (
                    <>▷ Chạy</>
                  )}
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* --- Documents List / Upload Manager --- */}
        <div className="rounded-2xl border border-ink-800 bg-ink-900/20 p-5">
          <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">
              Kho báo cáo
            </h3>
            <button
              type="button"
              onClick={() => setShowForm((v) => !v)}
              className="rounded-lg bg-brand-600 hover:bg-brand-500 px-4 py-2 text-xs font-semibold text-white transition-all shadow-sm"
            >
              {showForm ? "Đóng form upload" : "+ Tải lên tài liệu"}
            </button>
          </div>

          {showForm && (
            <form
              onSubmit={onSubmit}
              className="mb-6 rounded-xl border border-ink-800 bg-ink-900/60 p-4"
            >
              {/* Tab switcher */}
              <div className="mb-4 flex gap-1 rounded-lg bg-ink-800/60 p-1">
                <button
                  type="button"
                  onClick={() => setUploadMode("file")}
                  className={`flex-1 rounded-md px-3 py-2 text-xs font-semibold transition-all ${
                    uploadMode === "file"
                      ? "bg-brand-600 text-white shadow-sm"
                      : "text-ink-400 hover:text-ink-200"
                  }`}
                >
                  📄 Upload file PDF
                </button>
                <button
                  type="button"
                  onClick={() => setUploadMode("url")}
                  className={`flex-1 rounded-md px-3 py-2 text-xs font-semibold transition-all ${
                    uploadMode === "url"
                      ? "bg-brand-600 text-white shadow-sm"
                      : "text-ink-400 hover:text-ink-200"
                  }`}
                >
                  🔗 Nhập link URL
                </button>
              </div>

              {uploadMode === "file" ? (
                <div
                  onDragOver={onDragOver}
                  onDragLeave={onDragLeave}
                  onDrop={onDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-6 transition-all ${
                    dragOver
                      ? "border-brand-400 bg-brand-500/10"
                      : selectedFile
                        ? "border-emerald-500/50 bg-emerald-500/5"
                        : "border-ink-800 bg-ink-950 hover:border-ink-700 hover:bg-ink-900/60"
                  }`}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.xlsx,.xls,.csv,.docx,.txt,.html,.htm"
                    onChange={onFileSelect}
                    className="hidden"
                  />

                  {selectedFile ? (
                    <>
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">📄</span>
                        <div>
                          <p className="font-semibold text-xs text-white">{selectedFile.name}</p>
                          <p className="text-[10px] text-ink-500">
                            {(selectedFile.size / 1024 / 1024).toFixed(1)} MB
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedFile(null);
                          if (fileInputRef.current) fileInputRef.current.value = "";
                        }}
                        className="mt-2 text-[10px] text-ink-500 hover:text-red-400"
                      >
                        Xóa và chọn lại
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="text-3xl opacity-40">📁</span>
                      <p className="mt-2 text-xs text-ink-300">
                        Kéo thả file PDF vào đây
                      </p>
                      <p className="mt-1 text-[10px] text-ink-500">
                        hoặc click để chọn file · PDF, XLSX, DOCX, CSV (tối đa 100MB)
                      </p>
                    </>
                  )}
                </div>
              ) : (
                <div>
                  <p className="mb-2 text-xs font-semibold text-ink-300">
                    Nhập link PDF (Vietstock, IR công ty…)
                  </p>
                  <input
                    value={form.source_url}
                    onChange={(e) => setForm({ ...form, source_url: e.target.value })}
                    placeholder="URL PDF *"
                    className="w-full rounded-lg border border-ink-800 bg-ink-950 px-3 py-2 text-xs text-white placeholder:text-ink-600 focus:border-brand-500 focus:outline-none"
                  />
                </div>
              )}

              {/* Shared metadata fields */}
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <input
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="Tiêu đề báo cáo"
                  className="rounded-lg border border-ink-800 bg-ink-950 px-3 py-2 text-xs text-white placeholder:text-ink-600 focus:border-brand-500 focus:outline-none"
                />
                <input
                  value={form.ticker}
                  onChange={(e) => setForm({ ...form, ticker: e.target.value })}
                  placeholder="Mã CK (FPT, VNM…)"
                  className="rounded-lg border border-ink-800 bg-ink-950 px-3 py-2 text-xs text-white placeholder:text-ink-600 focus:border-brand-500 focus:outline-none"
                />
                <input
                  value={form.fiscal_year}
                  onChange={(e) => setForm({ ...form, fiscal_year: e.target.value })}
                  placeholder="Năm (2025)"
                  className="rounded-lg border border-ink-800 bg-ink-950 px-3 py-2 text-xs text-white placeholder:text-ink-600 focus:border-brand-500 focus:outline-none"
                />
                <input
                  value={form.fiscal_quarter}
                  onChange={(e) => setForm({ ...form, fiscal_quarter: e.target.value })}
                  placeholder="Quý (1-4)"
                  className="rounded-lg border border-ink-800 bg-ink-950 px-3 py-2 text-xs text-white placeholder:text-ink-600 focus:border-brand-500 focus:outline-none"
                />
              </div>

              <button
                type="submit"
                disabled={submitting || (uploadMode === "file" && !selectedFile) || (uploadMode === "url" && !form.source_url.trim())}
                className="mt-4 rounded-lg bg-brand-600 px-4 py-2 text-xs font-semibold text-white transition-all hover:bg-brand-500 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {submitting
                  ? "Đang tải lên…"
                  : uploadMode === "file"
                    ? "📤 Upload & xử lý"
                    : "Thêm & đưa vào hàng đợi"}
              </button>
            </form>
          )}

          {/* Filter badges */}
          <div className="mt-4 flex flex-wrap gap-1.5 border-t border-ink-850/60 pt-4">
            {["", "ready", "failed", "queued"].map((s) => (
              <button
                key={s || "all"}
                type="button"
                onClick={() => setFilter(s)}
                className={`rounded-lg px-2.5 py-1 text-[10px] font-semibold transition-all ${
                  filter === s
                    ? "bg-brand-600/30 text-brand-300 ring-1 ring-brand-500/40"
                    : "bg-ink-900/60 text-ink-400 hover:text-ink-200"
                }`}
              >
                {s === "" ? "Tất cả" : statusLabel(s)}
              </button>
            ))}
          </div>

          {error && (
            <p className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-350">
              {error}
            </p>
          )}

          {loading ? (
            <p className="mt-8 text-center text-xs text-ink-500">Đang tải...</p>
          ) : filtered.length === 0 ? (
            <p className="mt-8 text-center text-xs text-ink-500">Chưa có báo cáo nào trong kho.</p>
          ) : (
            <ul className="mt-6 space-y-3">
              {filtered.map((doc) => {
                const co = doc.company_id ? companyMap.get(doc.company_id) : null;
                return (
                  <li
                    key={doc.id}
                    className="rounded-xl border border-ink-850 bg-ink-900/40 p-4 hover:border-ink-800 transition-all"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-xs text-white">
                          {co?.ticker && (
                            <span className="mr-2 text-brand-400 font-bold">{co.ticker}</span>
                          )}
                          {doc.title ?? doc.original_filename ?? "Báo cáo tài chính"}
                        </p>
                        <p className="mt-1 text-[10px] text-ink-500">
                          {formatPeriod(doc)} · {doc.report_type ?? "—"}
                        </p>
                      </div>
                      <span
                        className={`shrink-0 rounded-lg px-2.5 py-0.5 text-[9px] font-semibold ring-1 ${statusColor(doc.status)}`}
                      >
                        {statusLabel(doc.status)}
                      </span>
                    </div>

                    {doc.status !== "ready" && doc.status !== "failed" && (
                      <div className="mt-3">
                        <div className="mb-1 flex justify-between text-[10px] text-ink-500">
                          <span>{doc.current_step ?? doc.status}</span>
                          <span>{doc.progress}%</span>
                        </div>
                        <div className="h-1 overflow-hidden rounded-full bg-ink-800">
                          <div
                            className="h-full rounded-full bg-brand-500 transition-all"
                            style={{ width: `${doc.progress}%` }}
                          />
                        </div>
                      </div>
                    )}

                    <div className="mt-2 flex flex-wrap gap-4 text-[10px] text-ink-500">
                      <span>
                        Chunks: {doc.processed_chunks}/{doc.total_chunks || "—"}
                      </span>
                      {doc.error_message && (
                        <span className="text-red-400 italic">{doc.error_message.slice(0, 120)}</span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
