export function formatPeriod(doc: {
  report_period?: string | null;
  fiscal_year?: number | null;
  fiscal_quarter?: number | null;
}): string {
  if (doc.report_period) return doc.report_period;
  const parts: string[] = [];
  if (doc.fiscal_year) parts.push(String(doc.fiscal_year));
  if (doc.fiscal_quarter) parts.push(`Q${doc.fiscal_quarter}`);
  return parts.join(" · ") || "—";
}

const STATUS_LABELS: Record<string, string> = {
  uploaded: "Đã tải lên",
  queued: "Chờ xử lý",
  downloading: "Đang tải",
  extracting_text: "Trích xuất",
  chunking: "Chia đoạn",
  embedding: "Embedding",
  indexed: "Đang lưu",
  ready: "Sẵn sàng",
  failed: "Lỗi",
};

export function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status;
}

export function statusColor(status: string): string {
  switch (status) {
    case "ready":
      return "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30";
    case "failed":
      return "bg-red-500/15 text-red-300 ring-red-500/30";
    case "queued":
    case "uploaded":
      return "bg-amber-500/15 text-amber-300 ring-amber-500/30";
    default:
      return "bg-sky-500/15 text-sky-300 ring-sky-500/30";
  }
}
