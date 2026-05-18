import type { CitationSource } from "@/lib/api";

export function Citations({ sources }: { sources: CitationSource[] }) {
  if (!sources.length) return null;

  return (
    <div className="mt-3 border-t border-ink-700/80 pt-3">
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-400">
        Nguồn trích dẫn
      </p>
      <ul className="space-y-2">
        {sources.map((s, i) => (
          <li
            key={s.chunk_id ?? i}
            className="rounded-lg border border-ink-700/60 bg-ink-900/40 px-3 py-2 text-xs text-ink-300"
          >
            <span className="font-medium text-brand-400">[{i + 1}]</span>{" "}
            {s.report_period && <span>{s.report_period} · </span>}
            {s.fiscal_year && (
              <span>
                {s.fiscal_year}
                {s.fiscal_quarter ? ` Q${s.fiscal_quarter}` : ""} ·{" "}
              </span>
            )}
            {s.section && <span>{s.section}</span>}
            {(s.page_start ?? s.page_end) && (
              <span className="text-ink-500">
                {" "}
                · trang {s.page_start}
                {s.page_end && s.page_end !== s.page_start ? `–${s.page_end}` : ""}
              </span>
            )}
            {s.score != null && (
              <span className="ml-1 text-ink-500">({Math.round(s.score * 100)}%)</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
