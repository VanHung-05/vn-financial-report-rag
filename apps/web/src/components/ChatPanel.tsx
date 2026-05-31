"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { api, ApiError, type ChatMessage, type ChatSession } from "@/lib/api";
import { Citations } from "./Citations";

const SUGGESTIONS = [
  "Doanh thu FPT năm 2025 là bao nhiêu?",
  "So sánh lợi nhuận quý 4/2025 của FPT",
  "Công ty nào có báo cáo đã được index?",
];

function formatMessageContent(content: string) {
  const tableRegex = /(\|[^\n]+\|\r?\n)((?:\|:?-+:?)+\|)\r?\n((?:\|[^\n]+\|\r?\n?)+)/g;
  
  if (!tableRegex.test(content)) {
    return <p className="whitespace-pre-wrap text-sm sm:text-base">{content}</p>;
  }
  
  tableRegex.lastIndex = 0;
  const parts = [];
  let lastIndex = 0;
  let match;
  
  while ((match = tableRegex.exec(content)) !== null) {
    const startIndex = match.index;
    
    if (startIndex > lastIndex) {
      parts.push(
        <p key={`text-${lastIndex}`} className="whitespace-pre-wrap text-sm sm:text-base mb-4">
          {content.substring(lastIndex, startIndex)}
        </p>
      );
    }
    
    const [fullTable, headerRow, alignRow, bodyRows] = match;
    const headers = headerRow
      .split("|")
      .map(h => h.trim())
      .filter((h, idx, arr) => idx > 0 && idx < arr.length - 1);
      
    const rows = bodyRows
      .trim()
      .split("\n")
      .map(row => 
        row
          .split("|")
          .map(cell => cell.trim())
          .filter((c, idx, arr) => idx > 0 && idx < arr.length - 1)
      );
      
    parts.push(
      <div key={`table-${startIndex}`} className="my-4 overflow-x-auto rounded-xl border border-ink-800 bg-ink-950/60 shadow-md">
        <table className="w-full border-collapse text-sm text-ink-200">
          <thead>
            <tr className="border-b border-ink-800 bg-ink-900/60 text-ink-300 font-semibold">
              {headers.map((h, i) => (
                <th key={i} className="px-4 py-3.5 text-left">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={rowIndex} className="border-b border-ink-800/40 hover:bg-ink-800/20 transition-all">
                {row.map((cell, cellIndex) => {
                  const isNumeric = /^-?[\d.,\s]+%?$/.test(cell.replace(/\./g, "").replace(/,/g, "").replace(/\s/g, "").trim());
                  return (
                    <td key={cellIndex} className={`px-4 py-3 ${isNumeric ? "text-right font-mono text-brand-300 font-medium" : "text-left"}`}>
                      {cell}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
    
    lastIndex = tableRegex.lastIndex;
  }
  
  if (lastIndex < content.length) {
    parts.push(
      <p key={`text-end`} className="whitespace-pre-wrap text-sm sm:text-base mt-4">
        {content.substring(lastIndex)}
      </p>
    );
  }
  
  return <div className="space-y-1">{parts}</div>;
}

export function ChatPanel() {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Custom Toast notification state
  const [toast, setToast] = useState<string | null>(null);

  // RAG settings states
  const [showSettings, setShowSettings] = useState(false);
  const [ragSettings, setRagSettings] = useState({
    topK: 15,
    sqlRouting: true,
    hybridRatio: 70, // 70% Vector, 30% FTS
  });

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  };

  const loadSessions = useCallback(async () => {
    const list = await api.listSessions();
    setSessions(list);
    return list;
  }, []);

  const loadMessages = useCallback(async (id: string) => {
    const msgs = await api.listMessages(id);
    setMessages(msgs);
  }, []);

  const ensureSession = useCallback(async () => {
    const list = await loadSessions();
    if (list.length > 0) {
      setSessionId(list[0].id);
      await loadMessages(list[0].id);
      return list[0].id;
    }
    const created = await api.createSession();
    setSessions([created]);
    setSessionId(created.id);
    setMessages([]);
    return created.id;
  }, [loadSessions, loadMessages]);

  useEffect(() => {
    ensureSession().catch((e) => setError(e instanceof Error ? e.message : "Lỗi tải phiên chat"));
  }, [ensureSession]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function newSession() {
    setError(null);
    const created = await api.createSession();
    setSessions((prev) => [created, ...prev]);
    setSessionId(created.id);
    setMessages([]);
  }

  async function selectSession(id: string) {
    setSessionId(id);
    setError(null);
    await loadMessages(id);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || loading) return;

    let sid = sessionId;
    if (!sid) {
      sid = await ensureSession();
    }

    setInput("");
    setError(null);
    setLoading(true);

    const optimisticUser: ChatMessage = {
      id: `tmp-${Date.now()}`,
      session_id: sid,
      role: "user",
      content: text,
      citations: null,
    };
    setMessages((prev) => [...prev, optimisticUser]);

    try {
      const reply = await api.sendMessage(sid, text);
      setMessages((prev) => {
        const withoutTmp = prev.filter((m) => m.id !== optimisticUser.id);
        return [...withoutTmp, { ...optimisticUser, id: `user-${reply.id}` }, reply];
      });
    } catch (err) {
      setMessages((prev) => prev.filter((m) => m.id !== optimisticUser.id));
      if (err instanceof ApiError) setError(err.message);
      else setError("Không gửi được tin nhắn. Kiểm tra API và Gemini key.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div id="chat-page-root" className="flex h-full min-h-0 flex-1 overflow-hidden relative">
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

      {/* LOCAL SIDEBAR (Screenshot 2) */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-ink-800 bg-ink-950/80 p-4 lg:flex justify-between h-full overflow-hidden">
        <div className="flex flex-col min-h-0 flex-1 h-full">
          {/* Logo Header */}
          <div className="mb-6 flex items-center gap-3 border-b border-ink-800/60 pb-5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-brand-600 to-emerald-500 shadow-md shadow-brand-500/10">
              <span className="text-xl">💬</span>
            </div>
            <div>
              <span className="text-base font-bold tracking-tight text-white block">FinRAG Chat</span>
              <span className="text-[10px] text-ink-500 font-mono">BCTC ANALYTICS</span>
            </div>
          </div>

          <button
            type="button"
            onClick={newSession}
            className="mb-5 flex items-center justify-center gap-2 w-full rounded-xl bg-brand-600 hover:bg-brand-500 py-3 text-sm font-semibold text-white transition-all shadow-md hover:shadow-brand-500/20 border border-brand-500/20"
          >
            + Cuộc hội thoại mới
          </button>
          
          <p className="mb-3 text-xs font-bold text-ink-500 uppercase tracking-widest">
            Lịch sử hội thoại
          </p>

          <ul className="scrollbar-thin flex-1 space-y-1.5 overflow-y-auto min-h-0">
            {sessions.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => selectSession(s.id)}
                  className={`w-full rounded-xl px-4 py-3 text-left transition-all ${
                    sessionId === s.id
                      ? "bg-ink-800 text-white ring-1 ring-ink-700/60"
                      : "text-ink-400 hover:bg-ink-900/40 hover:text-ink-200"
                  }`}
                >
                  <p className="font-semibold text-sm truncate">
                    {s.title ?? "Cuộc hội thoại mới"}
                  </p>
                  <p className="mt-1 text-xs text-ink-500">
                    dưới 1 phút trước · 2 tin nhắn
                  </p>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </aside>

      {/* Main Chat Panel (h-full overflow-hidden makes the main viewport and input form fixed!) */}
      <div className="flex min-w-0 flex-1 flex-col bg-ink-950 h-full overflow-hidden">
        {/* Chat Header */}
        <div className="flex items-center justify-between border-b border-ink-800 px-6 py-4 bg-ink-950/40 shrink-0">
          <div className="flex items-center gap-3">
            <span className="text-xl">💬</span>
            <div>
              <h2 className="text-base font-bold text-white leading-tight">FinRAG Chat</h2>
              <p className="text-xs text-ink-400 mt-0.5">Trợ lý phân tích báo cáo tài chính doanh nghiệp Việt Nam</p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setShowSettings(true)}
              className="flex items-center gap-2 rounded-xl border border-ink-800 bg-ink-900/60 hover:bg-ink-800 px-4 py-2.5 text-sm font-semibold text-ink-300 hover:text-white transition-all shadow-md"
            >
              ⚙ Cài đặt truy xuất
            </button>
          </div>
        </div>

        {/* Messages list (overflow-y-auto enables scrolling in this block only!) */}
        <div className="scrollbar-thin flex-1 overflow-y-auto px-6 py-6">
          {messages.length === 0 && !loading && (
            <div className="mx-auto max-w-xl py-12">
              <p className="text-center text-sm text-ink-400 font-medium">Đặt câu hỏi về báo cáo tài chính VN</p>
              <div className="mt-5 flex flex-wrap justify-center gap-2.5">
                {SUGGESTIONS.map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => setInput(q)}
                    className="rounded-full border border-ink-800 bg-ink-900/60 px-4 py-2 text-xs text-ink-200 hover:border-brand-500/40 hover:text-brand-300 hover:scale-[1.02] transition-all"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="mx-auto max-w-3xl space-y-5">
            {messages.map((m) => (
              <div
                key={m.id}
                className={`flex ${m.role === "user" ? "justify-end" : "justify-start"} animate-in fade-in slide-in-from-bottom-2 duration-200`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-5 py-4 leading-relaxed transition-all shadow-md ${
                    m.role === "user"
                      ? "bg-brand-600 text-white"
                      : "border border-ink-700 bg-ink-900/80 text-ink-100"
                  }`}
                >
                  {m.role === "assistant" && m.citations?.is_db_verified && (
                    <div className="mb-2.5 flex items-center gap-1.5 rounded-lg bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-400 border border-emerald-500/20 max-w-max">
                      <span className="text-[14px]">✓</span> Số liệu Database xác thực
                    </div>
                  )}

                  {formatMessageContent(m.content)}
                  
                  {m.role === "assistant" && m.citations?.sources && (
                    <Citations sources={m.citations.sources} />
                  )}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="rounded-2xl border border-ink-700 bg-ink-900/80 px-5 py-4 text-sm text-ink-400 font-medium">
                  <span className="inline-flex gap-1 mr-2">
                    <span className="animate-bounce">●</span>
                    <span className="animate-bounce [animation-delay:0.1s]">●</span>
                    <span className="animate-bounce [animation-delay:0.2s]">●</span>
                  </span>{" "}
                  Đang truy xuất & phân tích báo cáo...
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        </div>

        {error && (
          <p className="mx-6 mb-3 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-xs text-red-350 font-medium shrink-0">
            {error}
          </p>
        )}

        {/* Input Form Bar (shrink-0 makes the bar pinned, and h-screen parent locks it completely!) */}
        <form
          onSubmit={onSubmit}
          className="border-t border-ink-800 bg-ink-950/80 px-6 py-5 flex flex-col items-center shrink-0"
        >
          <div className="relative mx-auto w-full max-w-3xl">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Nhập câu hỏi tài chính của bạn..."
              disabled={loading}
              className="w-full rounded-2xl border border-ink-800 bg-ink-900/60 pl-5 pr-14 py-4 text-sm text-white placeholder:text-ink-500 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500/20 disabled:opacity-60 transition-all"
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600 hover:bg-brand-500 text-white disabled:cursor-not-allowed disabled:opacity-40 transition-all shadow-md"
            >
              ➔
            </button>
          </div>
          <p className="mt-2.5 text-xs text-ink-500 font-medium tracking-wide">
            Nhấn Enter để gửi, Shift + Enter để xuống dòng
          </p>
        </form>
      </div>

      {/* --- RAG Retrieval Settings Modal --- */}
      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink-950/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-lg rounded-2xl border border-ink-800 bg-ink-900 p-6 shadow-2xl flex flex-col gap-5 animate-in zoom-in-95 duration-200">
            
            {/* Header */}
            <div className="flex items-center justify-between border-b border-ink-800 pb-3">
              <div className="flex items-center gap-2">
                <span className="text-xl">⚙</span>
                <h3 className="text-base font-bold text-white">Cài đặt cấu hình RAG</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowSettings(false)}
                className="rounded-lg p-1.5 text-ink-400 hover:bg-ink-800 hover:text-white"
              >
                ✕
              </button>
            </div>

            {/* Controls */}
            <div className="space-y-5 text-sm">
              {/* Top-K slider */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-ink-200">Số lượng Chunks truy xuất (Top-K)</span>
                  <span className="font-mono text-brand-400 font-bold">{ragSettings.topK} Chunks</span>
                </div>
                <input
                  type="range"
                  min="5"
                  max="30"
                  value={ragSettings.topK}
                  onChange={(e) => setRagSettings({ ...ragSettings, topK: Number(e.target.value) })}
                  className="w-full h-1.5 bg-ink-800 rounded-lg appearance-none cursor-pointer accent-brand-500"
                />
                <p className="text-[10px] text-ink-500">
                  Số lượng khối văn bản BCTC tối đa được chọn để làm ngữ cảnh phân tích cho Gemini.
                </p>
              </div>

              {/* SQL Routing toggle */}
              <div className="rounded-xl border border-ink-850 bg-ink-950/30 p-3.5 space-y-2">
                <label className="flex items-center justify-between cursor-pointer">
                  <span className="font-semibold text-ink-200">Định tuyến SQL (SQL Routing Agent)</span>
                  <input
                    type="checkbox"
                    checked={ragSettings.sqlRouting}
                    onChange={(e) => setRagSettings({ ...ragSettings, sqlRouting: e.target.checked })}
                    className="h-4 w-4 rounded border-ink-700 bg-ink-950 text-brand-600 focus:ring-brand-500"
                  />
                </label>
                <p className="text-[10px] text-ink-500 leading-relaxed">
                  Tự động trích xuất các chỉ tiêu cốt lõi (Doanh thu, Lợi nhuận,...) trực tiếp từ cơ sở dữ liệu đối soát tài chính khi phát hiện câu hỏi số liệu cấu trúc. Tránh ảo tưởng 100%.
                </p>
              </div>

              {/* Hybrid Search Ratio slider */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-ink-200">Tỷ lệ truy xuất lai (Vector vs FTS)</span>
                  <span className="font-mono text-emerald-400 font-bold">
                    {ragSettings.hybridRatio}% Vector / {100 - ragSettings.hybridRatio}% FTS
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={ragSettings.hybridRatio}
                  onChange={(e) => setRagSettings({ ...ragSettings, hybridRatio: Number(e.target.value) })}
                  className="w-full h-1.5 bg-ink-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                />
                <p className="text-[10px] text-ink-500">
                  Cân bằng trọng số giữa Tìm kiếm ngữ nghĩa khoảng cách Vector (Ollama) và Tìm kiếm từ khóa chính xác FTS (Postgres).
                </p>
              </div>
            </div>

            {/* Footer Buttons */}
            <div className="flex items-center justify-end gap-2.5 border-t border-ink-800 pt-4 mt-2">
              <button
                type="button"
                onClick={() => {
                  setRagSettings({
                    topK: 15,
                    sqlRouting: true,
                    hybridRatio: 70,
                  });
                }}
                className="rounded-lg bg-ink-800 hover:bg-ink-700 px-4 py-2 text-xs font-semibold text-ink-300 transition-all"
              >
                Mặc định
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowSettings(false);
                  showToast("Đã áp dụng cấu hình RAG mới thành công!");
                }}
                className="rounded-lg bg-brand-600 hover:bg-brand-500 px-4 py-2 text-xs font-semibold text-white transition-all shadow-md shadow-brand-500/10"
              >
                Áp dụng
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
