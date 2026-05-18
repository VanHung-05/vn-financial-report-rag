"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError, type ChatMessage, type ChatSession } from "@/lib/api";
import { Citations } from "./Citations";

const SUGGESTIONS = [
  "Doanh thu FPT năm 2025 là bao nhiêu?",
  "So sánh lợi nhuận quý 4/2025 của FPT",
  "Công ty nào có báo cáo đã được index?",
];

export function ChatPanel() {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

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
    <div className="flex h-full min-h-0 flex-1">
      <aside className="hidden w-52 shrink-0 flex-col border-r border-ink-800 bg-ink-950/40 p-3 lg:flex">
        <button
          type="button"
          onClick={newSession}
          className="mb-3 w-full rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-500"
        >
          + Cuộc trò chuyện mới
        </button>
        <p className="mb-2 text-xs text-ink-500">Lịch sử</p>
        <ul className="scrollbar-thin flex-1 space-y-1 overflow-y-auto">
          {sessions.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => selectSession(s.id)}
                className={`w-full truncate rounded-lg px-2 py-2 text-left text-xs ${
                  sessionId === s.id
                    ? "bg-ink-800 text-white"
                    : "text-ink-400 hover:bg-ink-800/60 hover:text-ink-200"
                }`}
              >
                {s.title ?? "Cuộc hỏi đáp"}
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="border-b border-ink-800 px-4 py-3">
          <h2 className="text-lg font-semibold text-white">Hỏi đáp báo cáo tài chính</h2>
          <p className="text-sm text-ink-400">
            Hệ thống trả lời dựa trên báo cáo đã index — có trích dẫn nguồn.
          </p>
        </div>

        <div className="scrollbar-thin flex-1 overflow-y-auto px-4 py-4">
          {messages.length === 0 && !loading && (
            <div className="mx-auto max-w-xl py-8">
              <p className="text-center text-ink-400">Đặt câu hỏi về báo cáo tài chính VN</p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                {SUGGESTIONS.map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => setInput(q)}
                    className="rounded-full border border-ink-700 bg-ink-900/60 px-3 py-1.5 text-xs text-ink-300 hover:border-brand-500/40 hover:text-brand-300"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="mx-auto max-w-3xl space-y-4">
            {messages.map((m) => (
              <div
                key={m.id}
                className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[90%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                    m.role === "user"
                      ? "bg-brand-600 text-white"
                      : "border border-ink-700 bg-ink-900/80 text-ink-100"
                  }`}
                >
                  <p className="whitespace-pre-wrap">{m.content}</p>
                  {m.role === "assistant" && m.citations?.sources && (
                    <Citations sources={m.citations.sources} />
                  )}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="rounded-2xl border border-ink-700 bg-ink-900/80 px-4 py-3 text-sm text-ink-400">
                  <span className="inline-flex gap-1">
                    <span className="animate-bounce">●</span>
                    <span className="animate-bounce [animation-delay:0.1s]">●</span>
                    <span className="animate-bounce [animation-delay:0.2s]">●</span>
                  </span>{" "}
                  Đang tìm và trả lời…
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        </div>

        {error && (
          <p className="mx-4 mb-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
            {error}
          </p>
        )}

        <form
          onSubmit={onSubmit}
          className="border-t border-ink-800 bg-ink-950/80 p-4"
        >
          <div className="mx-auto flex max-w-3xl gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Nhập câu hỏi về báo cáo tài chính…"
              disabled={loading}
              className="flex-1 rounded-xl border border-ink-700 bg-ink-900 px-4 py-3 text-sm text-white placeholder:text-ink-500 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500/50 disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="rounded-xl bg-brand-600 px-5 py-3 text-sm font-medium text-white hover:bg-brand-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Gửi
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
