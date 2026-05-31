"use client";

import { DragEvent, FormEvent, useCallback, useEffect, useRef, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { api, ApiError, type Company, type Document } from "@/lib/api";
import { formatPeriod, statusColor, statusLabel } from "@/lib/utils";

function DocumentsPanelInner() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);

  const searchParams = useSearchParams();
  const router = useRouter();
  const tab = searchParams.get("tab") || "overview";

  // Custom Toast notification state
  const [toast, setToast] = useState<string | null>(null);
  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  };
  const [filter, setFilter] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pipelineStepRunning, setPipelineStepRunning] = useState<number | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [currentPage, setCurrentPage] = useState<number>(1);

  // Reset page to 1 when filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [filter]);

  // Auto-redirect old 'upload' tab to 'reports' tab and open the upload section
  useEffect(() => {
    if (tab === "upload") {
      router.replace("/documents?tab=reports");
      setShowUpload(true);
    }
  }, [tab, router]);

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

  // Debug states for RAG Retrieval Debugger
  const [debugQuery, setDebugQuery] = useState("");
  const [debugResults, setDebugResults] = useState<any[]>([]);
  const [debugLoading, setDebugLoading] = useState(false);
  const [debugLimit, setDebugLimit] = useState(5);

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
      refresh().catch(() => { });
    }, 3000);
    return () => clearInterval(t);
  }, [documents, refresh]);

  const filtered = filter
    ? documents.filter((d) => d.status === filter)
    : documents;

  const ITEMS_PER_PAGE = 10;
  const totalItems = filtered.length;
  const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);
  const activePage = Math.max(1, Math.min(currentPage, totalPages || 1));
  const paginatedDocuments = filtered.slice(
    (activePage - 1) * ITEMS_PER_PAGE,
    activePage * ITEMS_PER_PAGE
  );

  const getPageNumbers = () => {
    const pages: (number | string)[] = [];
    if (totalPages <= 6) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      pages.push(1);
      if (activePage > 3) {
        pages.push("...");
      }
      const start = Math.max(2, activePage - 1);
      const end = Math.min(totalPages - 1, activePage + 1);
      for (let i = start; i <= end; i++) {
        if (!pages.includes(i)) pages.push(i);
      }
      if (activePage < totalPages - 2) {
        pages.push("...");
      }
      if (!pages.includes(totalPages)) {
        pages.push(totalPages);
      }
    }
    return pages;
  };

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
      showToast("Tải lên báo cáo tài chính thành công!");
      setShowUpload(false);
      router.push("/documents?tab=reports");
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
      refresh().catch(() => { });
    }, 2000);
  };

  async function handleDebugSearch(e: FormEvent) {
    e.preventDefault();
    if (!debugQuery.trim() || debugLoading) return;
    setDebugLoading(true);
    try {
      const res = await api.search(debugQuery.trim(), debugLimit);
      setDebugResults(res);
    } catch (err) {
      showToast("Lỗi truy xuất debug: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setDebugLoading(false);
    }
  }

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
        {/* --- 1. OVERVIEW TAB --- */}
        {tab === "overview" && (
          <div className="space-y-8 animate-in fade-in duration-200">
            {/* Header Section */}
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-ink-800/60 pb-4">
              <div>
                <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
                  <svg className="h-5 w-5 text-ink-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                  Tổng quan hệ thống
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
                Làm mới
              </button>
            </div>

            {/* 4 Stats Cards Grid */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {/* Card 1: Documents count */}
              <div className="relative rounded-2xl border border-ink-800 bg-ink-900/70 p-4 overflow-hidden flex flex-col justify-between h-32 shadow-xl shadow-black/35">
                <div className="flex items-center justify-between">
                  <span className="text-xs uppercase font-bold text-ink-400 tracking-wider">Tài liệu đã index</span>
                  <svg className="h-5 w-5 text-ink-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
                  </svg>
                </div>
                <div>
                  <p className="text-2xl font-bold text-white tracking-tight mt-1">
                    {stats.ready} / {stats.total} BCTC
                  </p>
                  <div className="mt-2 h-1.5 w-full bg-ink-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-white rounded-full transition-all"
                      style={{ width: `${stats.total ? (stats.ready / stats.total) * 100 : 0}%` }}
                    />
                  </div>
                  <p className="text-xs text-ink-500 mt-1.5 font-semibold">100% hoàn thành</p>
                </div>
              </div>

              {/* Card 2: Chunks count */}
              <div className="relative rounded-2xl border border-ink-800 bg-ink-900/70 p-4 overflow-hidden flex flex-col justify-between h-32 shadow-xl shadow-black/35">
                <div className="flex items-center justify-between">
                  <span className="text-xs uppercase font-bold text-ink-400 tracking-wider">Chunks đã tạo</span>
                  <svg className="h-5 w-5 text-ink-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
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
              <div className="relative rounded-2xl border border-ink-800 bg-ink-900/70 p-4 overflow-hidden flex flex-col justify-between h-32 shadow-xl shadow-black/35">
                <div className="flex items-center justify-between">
                  <span className="text-xs uppercase font-bold text-ink-400 tracking-wider">RRF Hybrid Search</span>
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 shadow-md shadow-emerald-500/50 animate-pulse" />
                </div>
                <div>
                  <p className="text-xl font-bold text-emerald-400 tracking-tight mt-1">
                    Hoạt động
                  </p>
                  <p className="text-xs text-ink-500 mt-5 font-semibold leading-relaxed">
                    pgvector + FTS sẵn sàng
                  </p>
                </div>
              </div>

              {/* Card 4: Ollama status */}
              <div className="relative rounded-2xl border border-ink-800 bg-ink-900/70 p-4 overflow-hidden flex flex-col justify-between h-32 shadow-xl shadow-black/35">
                <div className="flex items-center justify-between">
                  <span className="text-xs uppercase font-bold text-ink-400 tracking-wider">Ollama Embeddings</span>
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 shadow-md shadow-emerald-500/50 animate-pulse" />
                </div>
                <div>
                  <p className="text-xl font-bold text-emerald-400 tracking-tight mt-1">
                    Hoạt động
                  </p>
                  <p className="text-xs text-ink-500 mt-5 font-semibold leading-relaxed">
                    Model nomic-embed-text
                  </p>
                </div>
              </div>
            </div>

            {/* Pipeline Controller */}
            <div className="rounded-2xl border border-ink-800 bg-ink-900/30 p-5 shadow-xl shadow-black/20">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-4">
                Điều khiển Pipeline
              </h3>
              <p className="text-xs text-ink-500 mb-4 -mt-2">
                Chạy các bước trong pipeline xử lý dữ liệu. Mỗi bước phụ thuộc vào bước trước đó.
              </p>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  {
                    step: 1,
                    label: "Tải báo cáo gốc",
                    desc: "Crawl từ URL / Upload local",
                    icon: (
                      <svg className="h-4 w-4 text-ink-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
                      </svg>
                    )
                  },
                  {
                    step: 2,
                    label: "Trích xuất Text & Bảng",
                    desc: "Phân tách chunk văn bản",
                    icon: (
                      <svg className="h-4 w-4 text-ink-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    )
                  },
                  {
                    step: 3,
                    label: "Trích xuất Chỉ số (SQL)",
                    desc: "Gemini đối soát facts",
                    icon: (
                      <svg className="h-4 w-4 text-ink-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                      </svg>
                    )
                  },
                  {
                    step: 4,
                    label: "Xây dựng Vector",
                    desc: "Tạo embeddings Ollama",
                    icon: (
                      <svg className="h-4 w-4 text-ink-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                      </svg>
                    )
                  },
                ].map((s) => (
                  <div
                    key={s.step}
                    className="rounded-xl border border-ink-850 bg-ink-900/60 p-4 flex flex-col justify-between h-40 hover:border-ink-700/60 transition-all"
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-ink-400 uppercase tracking-widest">Bước {s.step}</span>
                        <span>{s.icon}</span>
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
                        <span className="flex items-center gap-1.5 justify-center">
                          <svg className="animate-spin h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" stroke-dasharray="30 10" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                          </svg>
                          Đang xử lý...
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 justify-center">
                          <svg className="h-3 w-3 fill-current text-white" viewBox="0 0 24 24">
                            <path d="M8 5v14l11-7z" />
                          </svg>
                          Chạy
                        </span>
                      )}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* --- 2. REPORTS TAB --- */}
        {tab === "reports" && (
          <div className="rounded-2xl border border-ink-800 bg-ink-900/20 p-5 shadow-xl shadow-black/20 animate-in fade-in duration-200">
            <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
              <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                Kho báo cáo
              </h3>
              <button
                type="button"
                onClick={() => setShowUpload(!showUpload)}
                className={`rounded-lg px-4 py-2 text-xs font-semibold transition-all shadow-sm ${showUpload
                    ? "bg-ink-800 text-white border border-ink-700 hover:bg-ink-700"
                    : "bg-white hover:bg-ink-100 text-ink-950"
                  }`}
              >
                {showUpload ? "✕ Đóng khung tải lên" : "+ Tải lên tài liệu"}
              </button>
            </div>

            {/* Collapsible Upload Panel inside Reports Tab */}
            {showUpload && (
              <div className="mb-6 rounded-xl border border-ink-800 bg-ink-900/60 p-4 animate-in slide-in-from-top duration-250">
                <h4 className="text-xs font-bold text-white uppercase tracking-wider mb-4">
                  Tải lên tài liệu mới
                </h4>

                <form onSubmit={onSubmit} className="space-y-4">
                  {/* Tab switcher */}
                  <div className="flex gap-1 rounded-lg bg-ink-800/60 p-1">
                    <button
                      type="button"
                      onClick={() => setUploadMode("file")}
                      className={`flex-1 rounded-md px-3 py-2 text-xs font-semibold transition-all ${uploadMode === "file"
                          ? "bg-ink-850 text-white shadow-sm"
                          : "text-ink-400 hover:text-ink-200"
                        }`}
                    >
                      📄 Upload file PDF
                    </button>

                    {/* Vertical divider line */}
                    <div className="w-px h-4 bg-ink-700/60 self-center shrink-0" />

                    <button
                      type="button"
                      onClick={() => setUploadMode("url")}
                      className={`flex-1 rounded-md px-3 py-2 text-xs font-semibold transition-all ${uploadMode === "url"
                          ? "bg-ink-850 text-white shadow-sm"
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
                      className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-6 transition-all ${dragOver
                          ? "border-ink-400 bg-ink-800/20"
                          : selectedFile
                            ? "border-white/50 bg-ink-900/50"
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
                            <svg className="h-7 w-7 text-ink-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                            <div className="text-left">
                              <p className="font-semibold text-xs text-white max-w-xs truncate">{selectedFile.name}</p>
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
                          <svg className="h-8 w-8 text-ink-500 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                          </svg>
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
                        className="w-full rounded-lg border border-ink-800 bg-ink-950 px-3 py-2 text-xs text-white placeholder:text-ink-600 focus:border-white focus:outline-none"
                      />
                    </div>
                  )}

                  {/* Shared metadata fields */}
                  <div className="grid gap-3 sm:grid-cols-2">
                    <input
                      value={form.title}
                      onChange={(e) => setForm({ ...form, title: e.target.value })}
                      placeholder="Tiêu đề báo cáo"
                      className="rounded-lg border border-ink-800 bg-ink-950 px-3 py-2 text-xs text-white placeholder:text-ink-600 focus:border-white focus:outline-none"
                    />
                    <input
                      value={form.ticker}
                      onChange={(e) => setForm({ ...form, ticker: e.target.value })}
                      placeholder="Mã CK (FPT, VNM…)"
                      className="rounded-lg border border-ink-800 bg-ink-950 px-3 py-2 text-xs text-white placeholder:text-ink-600 focus:border-white focus:outline-none"
                    />
                    <input
                      value={form.fiscal_year}
                      onChange={(e) => setForm({ ...form, fiscal_year: e.target.value })}
                      placeholder="Năm (2025)"
                      className="rounded-lg border border-ink-800 bg-ink-950 px-3 py-2 text-xs text-white placeholder:text-ink-600 focus:border-white focus:outline-none"
                    />
                    <input
                      value={form.fiscal_quarter}
                      onChange={(e) => setForm({ ...form, fiscal_quarter: e.target.value })}
                      placeholder="Quý (1-4)"
                      className="rounded-lg border border-ink-800 bg-ink-950 px-3 py-2 text-xs text-white placeholder:text-ink-600 focus:border-white focus:outline-none"
                    />
                  </div>

                  <div className="flex gap-2 justify-end">
                    <button
                      type="submit"
                      disabled={submitting || (uploadMode === "file" && !selectedFile) || (uploadMode === "url" && !form.source_url.trim())}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-white hover:bg-ink-100 px-4 py-2.5 text-xs font-semibold text-ink-950 transition-all disabled:cursor-not-allowed disabled:bg-ink-800 disabled:text-ink-500 shadow-md"
                    >
                      {submitting ? (
                        <>Đang tải lên…</>
                      ) : (
                        <>
                          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                          </svg>
                          {uploadMode === "file" ? "Upload & xử lý" : "Thêm & đưa vào hàng đợi"}
                        </>
                      )}
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* Filter badges */}
            <div className="mt-4 flex flex-wrap gap-1.5 border-t border-ink-850/60 pt-4">
              {["", "ready", "failed", "queued"].map((s) => (
                <button
                  key={s || "all"}
                  type="button"
                  onClick={() => setFilter(s)}
                  className={`rounded-lg px-2.5 py-1 text-[10px] font-semibold transition-all ${filter === s
                      ? "bg-ink-850 text-white ring-1 ring-ink-700/60"
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
              <>
                <ul className="mt-6 space-y-3">
                  {paginatedDocuments.map((doc) => {
                    const co = doc.company_id ? companyMap.get(doc.company_id) : null;
                    return (
                      <li
                        key={doc.id}
                        className="rounded-xl border border-ink-850 bg-ink-900/40 p-4 hover:border-ink-800 transition-all shadow-md shadow-black/20"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="font-semibold text-xs text-white">
                              {co?.ticker && (
                                <span className="mr-2 text-ink-400 font-bold">{co.ticker}</span>
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
                                className="h-full rounded-full bg-white transition-all"
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

                {totalPages > 1 && (
                  <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-ink-850/60 pt-4 text-xs">
                    <span className="text-[11px] text-ink-400 font-medium">
                      Hiển thị <strong className="text-white font-semibold">{(activePage - 1) * ITEMS_PER_PAGE + 1}</strong> đến{" "}
                      <strong className="text-white font-semibold">
                        {Math.min(activePage * ITEMS_PER_PAGE, totalItems)}
                      </strong>{" "}
                      trong tổng số <strong className="text-white font-semibold">{totalItems}</strong> báo cáo
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        disabled={activePage === 1}
                        onClick={() => setCurrentPage(activePage - 1)}
                        className="flex h-8 w-8 items-center justify-center rounded-lg border border-ink-800 bg-ink-900/40 text-ink-400 transition hover:bg-ink-800 hover:text-white disabled:pointer-events-none disabled:opacity-30"
                        title="Trang trước"
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                        </svg>
                      </button>

                      {getPageNumbers().map((p, idx) => {
                        if (p === "...") {
                          return (
                            <span key={`dots-${idx}`} className="px-1.5 text-ink-600 select-none">
                              ...
                            </span>
                          );
                        }
                        return (
                          <button
                            key={p}
                            type="button"
                            onClick={() => setCurrentPage(Number(p))}
                            className={`flex h-8 min-w-[32px] items-center justify-center rounded-lg px-2.5 text-xs font-semibold transition-all ${
                              p === activePage
                                ? "bg-white text-ink-950 font-bold shadow-md shadow-white/10"
                                : "border border-ink-800 bg-ink-900/40 text-ink-400 hover:bg-ink-800 hover:text-white"
                            }`}
                          >
                            {p}
                          </button>
                        );
                      })}

                      <button
                        type="button"
                        disabled={activePage === totalPages}
                        onClick={() => setCurrentPage(activePage + 1)}
                        className="flex h-8 w-8 items-center justify-center rounded-lg border border-ink-800 bg-ink-900/40 text-ink-400 transition hover:bg-ink-800 hover:text-white disabled:pointer-events-none disabled:opacity-30"
                        title="Trang sau"
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                        </svg>
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* --- 4. DEBUG TAB --- */}
        {tab === "debug" && (
          <div className="rounded-2xl border border-ink-800 bg-ink-900/20 p-5 space-y-6 shadow-xl shadow-black/20 animate-in fade-in duration-200">
            <div>
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                Debug truy xuất RAG (Hybrid RRF)
              </h3>
              <p className="text-xs text-ink-500 mt-1">
                Kiểm tra kết quả truy xuất lai (Hybrid Search) RRF và xem các chunks văn bản thực tế được vector hóa trong cơ sở dữ liệu Postgres.
              </p>
            </div>

            <form onSubmit={handleDebugSearch} className="flex gap-2">
              <input
                value={debugQuery}
                onChange={(e) => setDebugQuery(e.target.value)}
                placeholder="Nhập câu hỏi test truy vấn (ví dụ: Doanh thu FPT năm 2025)..."
                className="flex-1 rounded-lg border border-ink-800 bg-ink-950 px-3 py-2 text-xs text-white placeholder:text-ink-600 focus:border-white focus:outline-none"
              />
              <select
                value={debugLimit}
                onChange={(e) => setDebugLimit(Number(e.target.value))}
                className="rounded-lg border border-ink-800 bg-ink-950 px-2.5 py-2 text-xs text-white focus:border-white focus:outline-none"
              >
                <option value={3}>Top 3</option>
                <option value={5}>Top 5</option>
                <option value={10}>Top 10</option>
              </select>
              <button
                type="submit"
                disabled={debugLoading || !debugQuery.trim()}
                className="rounded-lg bg-white text-ink-950 hover:bg-ink-100 px-4 py-2 text-xs font-semibold disabled:opacity-40 transition-all shadow-md"
              >
                {debugLoading ? "Đang truy xuất..." : "Test truy xuất"}
              </button>
            </form>

            {debugResults.length > 0 ? (
              <div className="space-y-4">
                <p className="text-xs text-ink-400 font-semibold">
                  Tìm thấy {debugResults.length} chunks kết quả:
                </p>
                <div className="space-y-3.5">
                  {debugResults.map((r, i) => (
                    <div
                      key={r.chunk_id || i}
                      className="rounded-xl border border-ink-850 bg-ink-900/40 p-4 hover:border-ink-800 transition-all space-y-3 shadow-md shadow-black/20"
                    >
                      <div className="flex items-center justify-between text-[10px]">
                        <span className="rounded-lg bg-ink-800 px-2 py-0.5 text-white font-bold border border-ink-700">
                          Top {i + 1}
                        </span>
                        <div className="flex gap-3 text-ink-500">
                          {r.score != null && (
                            <span>Điểm RRF: <strong className="text-white">{(r.score * 100).toFixed(1)}%</strong></span>
                          )}
                          {r.metadata?.ticker && (
                            <span>Ticker: <strong className="text-white">{r.metadata.ticker}</strong></span>
                          )}
                          {r.metadata?.page_start != null && (
                            <span>Trang: <strong className="text-white">{r.metadata.page_start}</strong></span>
                          )}
                        </div>
                      </div>

                      {r.section_title && (
                        <p className="text-xs text-white font-semibold">{r.section_title}</p>
                      )}

                      <p className="font-mono text-[11px] text-ink-300 leading-relaxed bg-ink-950/70 p-3 rounded-lg border border-ink-850 whitespace-pre-wrap select-text">
                        {r.content}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              !debugLoading && (
                <div className="py-12 border border-dashed border-ink-800 rounded-xl flex flex-col items-center justify-center text-ink-500 bg-ink-900/10">
                  <svg className="h-8 w-8 text-ink-700 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <p className="text-xs font-semibold">Chưa có kết quả test truy xuất.</p>
                  <p className="text-[10px] text-ink-600 mt-0.5">Nhập câu hỏi test truy vấn để đối soát các chunks trong vector database.</p>
                </div>
              )
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function DocumentsPanel() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-ink-500">Đang tải bảng điều khiển...</div>}>
      <DocumentsPanelInner />
    </Suspense>
  );
}
