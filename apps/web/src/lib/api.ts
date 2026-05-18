const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public body?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  if (!res.ok) {
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      body = await res.text();
    }
    const detail =
      typeof body === "object" && body && "detail" in body
        ? String((body as { detail: unknown }).detail)
        : res.statusText;
    throw new ApiError(detail || `HTTP ${res.status}`, res.status, body);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export type Company = {
  id: string;
  ticker: string;
  name: string;
  exchange: string | null;
  industry: string | null;
};

export type Document = {
  id: string;
  company_id: string | null;
  title: string | null;
  original_filename: string | null;
  mime_type: string | null;
  source_type: string | null;
  report_type: string | null;
  report_period: string | null;
  fiscal_year: number | null;
  fiscal_quarter: number | null;
  status: string;
  progress: number;
  current_step: string | null;
  error_message: string | null;
  total_chunks: number;
  processed_chunks: number;
  created_at: string;
  updated_at: string;
};

export type ChatSession = {
  id: string;
  title: string | null;
  scope: string | null;
  scope_filter: Record<string, unknown> | null;
};

export type CitationSource = {
  chunk_id?: string;
  document_id?: string;
  section?: string | null;
  page_start?: number | null;
  page_end?: number | null;
  fiscal_year?: number;
  fiscal_quarter?: number;
  report_type?: string;
  report_period?: string;
  score?: number;
};

export type ChatMessage = {
  id: string;
  session_id: string;
  role: "user" | "assistant" | string;
  content: string;
  citations: { sources?: CitationSource[] } | null;
};

export type DocumentCreate = {
  company_id?: string;
  title?: string;
  source_url?: string;
  report_type?: string;
  report_period?: string;
  fiscal_year?: number;
  fiscal_quarter?: number;
};

export const api = {
  health: () => request<{ status: string }>("/health"),

  listCompanies: () => request<Company[]>("/companies"),

  listDocuments: (params?: { status?: string; limit?: number }) => {
    const q = new URLSearchParams();
    if (params?.status) q.set("status", params.status);
    if (params?.limit) q.set("limit", String(params.limit));
    const qs = q.toString();
    return request<Document[]>(`/documents${qs ? `?${qs}` : ""}`);
  },

  createDocument: (body: DocumentCreate) =>
    request<Document>("/documents", { method: "POST", body: JSON.stringify(body) }),

  getDocumentStatus: (id: string) =>
    request<Pick<Document, "id" | "status" | "progress" | "current_step" | "error_message" | "total_chunks" | "processed_chunks">>(
      `/documents/${id}/status`,
    ),

  listSessions: () => request<ChatSession[]>("/chat/sessions"),

  createSession: (title?: string) =>
    request<ChatSession>("/chat/sessions", {
      method: "POST",
      body: JSON.stringify({ title: title ?? "Cuộc hỏi đáp mới" }),
    }),

  listMessages: (sessionId: string) =>
    request<ChatMessage[]>(`/chat/sessions/${sessionId}/messages`),

  sendMessage: (sessionId: string, content: string) =>
    request<ChatMessage>(`/chat/sessions/${sessionId}/messages`, {
      method: "POST",
      body: JSON.stringify({ content }),
    }),

  search: (q: string, limit = 5) =>
    request<
      {
        chunk_id: string;
        document_id: string;
        content: string;
        section_title: string | null;
        score: number | null;
        metadata: Record<string, unknown> | null;
      }[]
    >(`/search?q=${encodeURIComponent(q)}&limit=${limit}`),
};

export { API_BASE };
