"use client";

import { DragEvent, FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError, type Company, type Document } from "@/lib/api";
import { formatPeriod, statusColor, statusLabel } from "@/lib/utils";

export function DocumentsPanel() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [filter, setFilter] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

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

  // Handle drag and drop
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
        // --- File upload mode ---
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
        // --- URL mode ---
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
    <div className="scrollbar-thin flex-1 overflow-y-auto p-4 md:p-6">
      <div className="mx-auto max-w-5xl">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-white">Báo cáo đã index</h2>
            <p className="mt-1 text-sm text-ink-400">
              Theo dõi tiến độ xử lý — worker phải đang chạy.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowForm((v) => !v)}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-500"
          >
            {showForm ? "Đóng form" : "+ Thêm báo cáo"}
          </button>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "Tổng", value: stats.total },
            { label: "Sẵn sàng", value: stats.ready },
            { label: "Đang xử lý", value: stats.processing },
            { label: "Chunks", value: stats.chunks },
          ].map((s) => (
            <div
              key={s.label}
              className="rounded-xl border border-ink-800 bg-ink-900/50 p-4"
            >
              <p className="text-xs text-ink-500">{s.label}</p>
              <p className="mt-1 text-2xl font-semibold text-white">{s.value}</p>
            </div>
          ))}
        </div>

        {showForm && (
          <form
            onSubmit={onSubmit}
            className="mt-6 rounded-xl border border-ink-700 bg-ink-900/60 p-4"
          >
            {/* Tab switcher */}
            <div className="mb-4 flex gap-1 rounded-lg bg-ink-800/60 p-1">
              <button
                type="button"
                onClick={() => setUploadMode("file")}
                className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-all ${
                  uploadMode === "file"
                    ? "bg-brand-600 text-white shadow-sm"
                    : "text-ink-400 hover:text-ink-200"
                }`}
              >
                📄 Upload file
              </button>
              <button
                type="button"
                onClick={() => setUploadMode("url")}
                className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-all ${
                  uploadMode === "url"
                    ? "bg-brand-600 text-white shadow-sm"
                    : "text-ink-400 hover:text-ink-200"
                }`}
              >
                🔗 Nhập link URL
              </button>
            </div>

            {uploadMode === "file" ? (
              /* ---- File upload zone ---- */
              <div
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
                onDrop={onDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 transition-all ${
                  dragOver
                    ? "border-brand-400 bg-brand-500/10"
                    : selectedFile
                      ? "border-emerald-500/50 bg-emerald-500/5"
                      : "border-ink-600 bg-ink-950 hover:border-ink-500 hover:bg-ink-900/60"
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
                      <span className="text-3xl">📄</span>
                      <div>
                        <p className="font-medium text-white">{selectedFile.name}</p>
                        <p className="text-xs text-ink-400">
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
                      className="mt-2 text-xs text-ink-500 hover:text-red-400"
                    >
                      Xóa và chọn lại
                    </button>
                  </>
                ) : (
                  <>
                    <span className="text-4xl opacity-50">📁</span>
                    <p className="mt-2 text-sm text-ink-300">
                      Kéo thả file PDF vào đây
                    </p>
                    <p className="mt-1 text-xs text-ink-500">
                      hoặc click để chọn file · PDF, XLSX, DOCX, CSV (tối đa 100MB)
                    </p>
                  </>
                )}
              </div>
            ) : (
              /* ---- URL input ---- */
              <div>
                <p className="mb-3 text-sm font-medium text-ink-200">
                  Nhập link PDF (Vietstock, IR công ty…)
                </p>
                <input
                  value={form.source_url}
                  onChange={(e) => setForm({ ...form, source_url: e.target.value })}
                  placeholder="URL PDF *"
                  className="w-full rounded-lg border border-ink-700 bg-ink-950 px-3 py-2 text-sm text-white placeholder:text-ink-600"
                />
              </div>
            )}

            {/* Shared metadata fields */}
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="Tiêu đề"
                className="rounded-lg border border-ink-700 bg-ink-950 px-3 py-2 text-sm text-white placeholder:text-ink-600"
              />
              <input
                value={form.ticker}
                onChange={(e) => setForm({ ...form, ticker: e.target.value })}
                placeholder="Mã CK (FPT, VNM…)"
                className="rounded-lg border border-ink-700 bg-ink-950 px-3 py-2 text-sm text-white placeholder:text-ink-600"
              />
              <input
                value={form.fiscal_year}
                onChange={(e) => setForm({ ...form, fiscal_year: e.target.value })}
                placeholder="Năm (2025)"
                className="rounded-lg border border-ink-700 bg-ink-950 px-3 py-2 text-sm text-white placeholder:text-ink-600"
              />
              <input
                value={form.fiscal_quarter}
                onChange={(e) => setForm({ ...form, fiscal_quarter: e.target.value })}
                placeholder="Quý (1-4)"
                className="rounded-lg border border-ink-700 bg-ink-950 px-3 py-2 text-sm text-white placeholder:text-ink-600"
              />
            </div>

            <button
              type="submit"
              disabled={submitting || (uploadMode === "file" && !selectedFile) || (uploadMode === "url" && !form.source_url.trim())}
              className="mt-4 rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-medium text-white transition-all hover:bg-brand-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {submitting
                ? "Đang tải lên…"
                : uploadMode === "file"
                  ? "📤 Upload & xử lý"
                  : "Thêm & đưa vào hàng đợi"}
            </button>
          </form>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          {["", "ready", "failed", "queued"].map((s) => (
            <button
              key={s || "all"}
              type="button"
              onClick={() => setFilter(s)}
              className={`rounded-full px-3 py-1 text-xs ${
                filter === s
                  ? "bg-brand-600/30 text-brand-300 ring-1 ring-brand-500/40"
                  : "bg-ink-800 text-ink-400 hover:text-ink-200"
              }`}
            >
              {s === "" ? "Tất cả" : statusLabel(s)}
            </button>
          ))}
        </div>

        {error && (
          <p className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
            {error}
          </p>
        )}

        {loading ? (
          <p className="mt-8 text-center text-ink-500">Đang tải…</p>
        ) : filtered.length === 0 ? (
          <p className="mt-8 text-center text-ink-500">Chưa có báo cáo nào.</p>
        ) : (
          <ul className="mt-6 space-y-3">
            {filtered.map((doc) => {
              const co = doc.company_id ? companyMap.get(doc.company_id) : null;
              return (
                <li
                  key={doc.id}
                  className="rounded-xl border border-ink-800 bg-ink-900/40 p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-white">
                        {co?.ticker && (
                          <span className="mr-2 text-brand-400">{co.ticker}</span>
                        )}
                        {doc.title ?? doc.original_filename ?? "Báo cáo"}
                      </p>
                      <p className="mt-1 text-xs text-ink-500">
                        {formatPeriod(doc)} · {doc.report_type ?? "—"}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs ring-1 ${statusColor(doc.status)}`}
                    >
                      {statusLabel(doc.status)}
                    </span>
                  </div>

                  {doc.status !== "ready" && doc.status !== "failed" && (
                    <div className="mt-3">
                      <div className="mb-1 flex justify-between text-xs text-ink-500">
                        <span>{doc.current_step ?? doc.status}</span>
                        <span>{doc.progress}%</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-ink-800">
                        <div
                          className="h-full rounded-full bg-brand-500 transition-all"
                          style={{ width: `${doc.progress}%` }}
                        />
                      </div>
                    </div>
                  )}

                  <div className="mt-2 flex flex-wrap gap-4 text-xs text-ink-500">
                    <span>
                      Chunks: {doc.processed_chunks}/{doc.total_chunks || "—"}
                    </span>
                    {doc.error_message && (
                      <span className="text-red-400">{doc.error_message.slice(0, 120)}</span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
