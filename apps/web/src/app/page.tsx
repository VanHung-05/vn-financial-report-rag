"use client";

import Link from "next/link";

export default function Home() {
  return (
    <div className="relative min-h-screen bg-ink-950 text-ink-100 overflow-x-hidden">
      {/* Background Neon Glows */}
      <div className="absolute top-0 left-1/4 -z-10 h-[500px] w-[500px] rounded-full bg-brand-500/10 blur-[120px]" />
      <div className="absolute top-1/3 right-1/4 -z-10 h-[400px] w-[400px] rounded-full bg-emerald-500/10 blur-[120px]" />

      {/* Decorative Financial Stock Wave Grid */}
      <div className="absolute top-20 right-0 -z-10 w-full max-w-3xl opacity-20 pointer-events-none">
        <svg viewBox="0 0 1000 600" className="w-full h-auto text-emerald-500" fill="none" stroke="currentColor">
          <path d="M0,450 Q150,300 300,400 T600,200 T900,100 T1000,150" strokeWidth="2" strokeDasharray="5,5" />
          <path d="M0,480 Q120,350 250,420 T550,220 T850,90 T1000,120" strokeWidth="3" className="text-brand-500" />
          <path d="M0,500 Q200,420 400,480 T800,250 T1000,200" strokeWidth="1" />
          {/* Vertical and horizontal gridlines */}
          {[100, 200, 300, 400, 500, 600, 700, 800, 900].map((x) => (
            <line key={`v-${x}`} x1={x} y1="0" x2={x} y2="600" stroke="rgba(255,255,255,0.03)" strokeWidth="1" />
          ))}
          {[100, 200, 300, 400, 500].map((y) => (
            <line key={`h-${y}`} x1="0" y1={y} x2="1000" y2={y} stroke="rgba(255,255,255,0.03)" strokeWidth="1" />
          ))}
        </svg>
      </div>

      {/* --- Navigation Header --- */}
      <header className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-20 items-center justify-between border-b border-ink-800/60">
          <div className="flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-ink-800 border border-ink-700 shadow-md">
              <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <div>
              <span className="text-xl font-bold tracking-tight bg-gradient-to-r from-white via-ink-100 to-ink-300 bg-clip-text text-transparent">
                FinRAG
              </span>
              <span className="ml-1.5 rounded-full bg-ink-800 px-2 py-0.5 text-[9px] font-semibold text-ink-300 border border-ink-700 uppercase">
                v2.0
              </span>
            </div>
          </div>

          <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-ink-300">
            <a href="#features" className="hover:text-white transition">Tính năng</a>
            <a href="#tech" className="hover:text-white transition">Công nghệ</a>
            <Link href="/documents" className="hover:text-white transition">Kho dữ liệu</Link>
          </nav>

          <div className="flex items-center gap-3">
            <Link
              href="/documents"
              className="rounded-xl border border-ink-700 bg-ink-900/60 px-4 py-2 text-xs font-semibold text-ink-200 hover:bg-ink-800 hover:text-white transition-all"
            >
              Quản trị
            </Link>
            <Link
              href="/chat"
              className="rounded-xl bg-gradient-to-r from-brand-600 to-brand-500 px-4 py-2 text-xs font-semibold text-white shadow-md shadow-brand-500/20 hover:from-brand-500 hover:to-brand-400 hover:shadow-brand-500/30 hover:scale-[1.02] transition-all"
            >
              Bắt đầu hỏi ngay →
            </Link>
          </div>
        </div>
      </header>

      {/* --- Hero Section --- */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          {/* Left Column */}
          <div className="lg:col-span-7">
            <div className="inline-flex items-center gap-2 rounded-full bg-ink-800/60 border border-ink-700 px-3 py-1 text-xs font-semibold text-ink-300 mb-6 shadow-[0_0_15px_rgba(255,255,255,0.03)]">
              <svg className="h-3.5 w-3.5 text-ink-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.59 14.37a6 6 0 01-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 006.16-12.12A14.98 14.98 0 009.63 1.1a14.97 14.97 0 00-5.84 5.83M18.81 5.19a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zm-9.75 3.75A9.63 9.63 0 001.5 18.75a9.63 9.63 0 005.84-2.58" />
              </svg>
              <span>RAG Thế Hệ Mới Chuyên Biệt BCTC</span>
            </div>

            <h1 className="text-4xl font-extrabold tracking-tight text-white sm:text-5xl lg:text-6xl leading-[1.1]">
              Trợ lý AI Phân tích <br />
              <span className="bg-gradient-to-r from-white via-ink-100 to-ink-300 bg-clip-text text-transparent">
                Báo cáo Tài chính
              </span> <br />
              Việt Nam
            </h1>

            <p className="mt-6 text-lg text-ink-300 leading-relaxed max-w-2xl">
              FinRAG mang lại độ chính xác số liệu tuyệt đối cho hoạt động đối soát tài chính nhờ cơ chế Định tuyến thông minh, đối soát số liệu SQL Database và RAG lai xếp hạng RRF thế hệ mới.
            </p>

            <div className="mt-10 flex flex-wrap gap-4">
              <Link
                href="/chat"
                className="inline-flex items-center gap-2 rounded-xl bg-white hover:bg-ink-100 text-ink-950 px-6 py-3.5 text-sm font-semibold shadow-xl shadow-white/5 hover:scale-[1.03] transition-all"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
                Trò chuyện với FinRAG
              </Link>
              <Link
                href="/documents"
                className="inline-flex items-center gap-2 rounded-xl border border-ink-700 bg-ink-900/40 px-6 py-3.5 text-sm font-semibold text-ink-200 hover:bg-ink-800 hover:text-white hover:border-ink-600 transition-all"
              >
                <svg className="h-4 w-4 text-ink-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
                Quản lý tài liệu BCTC
              </Link>
            </div>
          </div>

          {/* Right Column - Beautiful Architecture Flow Diagram */}
          <div className="lg:col-span-5">
            <div className="relative rounded-2xl border border-ink-800/80 bg-ink-900/70 p-6 shadow-2xl shadow-black/50 backdrop-blur-md overflow-hidden group">
              {/* Background accent glow */}
              <div className="absolute -top-10 -right-10 h-32 w-32 rounded-full bg-white/5 blur-[35px]" />

              <div className="flex items-center justify-between border-b border-ink-800/80 pb-4 mb-5">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-[10px] uppercase font-bold tracking-widest text-ink-300">
                    FinRAG Pipeline Architecture
                  </span>
                </div>
                <span className="text-[9px] text-ink-500 font-mono">v2.0</span>
              </div>

              {/* Steps Flow */}
              <div className="space-y-4 relative">
                {/* Connector line */}
                <div className="absolute left-[17px] top-4 bottom-4 w-0.5 bg-gradient-to-b from-white/10 via-ink-800 to-white/5" />

                {/* Step 1: PDF scan & Parser */}
                <div className="flex items-start gap-3.5 relative">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-ink-800 border border-ink-700 text-white shadow-md">
                    <svg className="h-4.5 w-4.5 text-ink-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <div>
                    <h4 className="text-[11px] font-bold text-white uppercase tracking-wide">1. PDF Ingestion & OCR</h4>
                    <p className="text-[10px] text-ink-400 mt-0.5 leading-relaxed">
                      Phân tách trang, trích xuất văn bản thô & bảng số liệu bằng Tesseract OCR.
                    </p>
                  </div>
                </div>

                {/* Step 2: Intelligent Routing */}
                <div className="flex items-start gap-3.5 relative">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-ink-800 border border-ink-700 text-white shadow-md">
                    <svg className="h-4.5 w-4.5 text-ink-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                    </svg>
                  </div>
                  <div>
                    <h4 className="text-[11px] font-bold text-white uppercase tracking-wide">2. Query Router & SQL Agent</h4>
                    <p className="text-[10px] text-ink-400 mt-0.5 leading-relaxed">
                      Phát hiện câu hỏi số liệu có cấu trúc → Truy vấn trực tiếp từ `financial_facts` SQL chính xác 100%.
                    </p>
                  </div>
                </div>

                {/* Step 3: Hybrid Search RRF */}
                <div className="flex items-start gap-3.5 relative">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-ink-800 border border-ink-700 text-white shadow-md">
                    <svg className="h-4.5 w-4.5 text-ink-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  </div>
                  <div>
                    <h4 className="text-[11px] font-bold text-white uppercase tracking-wide">3. RRF Hybrid Retrieval</h4>
                    <p className="text-[10px] text-ink-400 mt-0.5 leading-relaxed">
                      Xếp hạng lai (RRF) kết hợp giữa Tìm kiếm Vector (Ollama) và Tìm kiếm toàn văn FTS (Postgres).
                    </p>
                  </div>
                </div>

                {/* Step 4: Generation */}
                <div className="flex items-start gap-3.5 relative">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-ink-950 shadow-md shadow-white/10">
                    <svg className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 113.536 0V21h-2v-3" />
                    </svg>
                  </div>
                  <div>
                    <h4 className="text-[11px] font-bold text-white uppercase tracking-wide">4. Gemini Synthesis & Citations</h4>
                    <p className="text-[10px] text-ink-400 mt-0.5 leading-relaxed">
                      LLM tổng hợp câu trả lời kèm bảng biểu gốc và trích dẫn số trang nguồn minh bạch.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* --- Features Grid Section --- */}
      <section id="features" className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 border-t border-ink-800/40 scroll-mt-6">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <h2 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
            Tại sao chọn FinRAG?
          </h2>
          <p className="mt-4 text-ink-400 text-sm sm:text-base leading-relaxed">
            Công nghệ RAG cải tiến loại bỏ hoàn toàn các lỗi ảo tưởng dữ liệu tài chính của mô hình ngôn ngữ lớn truyền thống.
          </p>
        </div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {/* Card 1: SQL Fact Database */}
          <div className="group relative rounded-2xl border border-ink-800/80 bg-ink-900/70 p-6 hover:border-ink-700 hover:bg-ink-900/90 hover:shadow-emerald-500/5 hover:shadow-lg transition-all duration-300 backdrop-blur-sm shadow-xl shadow-black/40">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-ink-850 border border-ink-750 text-white group-hover:bg-ink-800 transition-all">
              <svg className="h-6 w-6 text-ink-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
              </svg>
            </div>
            <h3 className="mt-5 text-lg font-bold text-white flex items-center gap-2">
              Truy xuất SQL chính xác
              <span className="rounded-full bg-ink-800 px-2 py-0.5 text-[9px] text-ink-300 border border-ink-700 font-mono">
                + SQL
              </span>
            </h3>
            <p className="mt-3 text-sm text-ink-400 leading-relaxed group-hover:text-ink-300 transition-colors">
              Tự động phân loại câu hỏi số liệu cấu trúc và định tuyến truy vấn trực tiếp từ cơ sở dữ liệu `financial_facts` SQL chính xác 100%.
            </p>
          </div>

          {/* Card 2: Hybrid Search RRF */}
          <div className="group relative rounded-2xl border border-ink-800/80 bg-ink-900/70 p-6 hover:border-ink-700 hover:bg-ink-900/90 hover:shadow-indigo-500/5 hover:shadow-lg transition-all duration-300 backdrop-blur-sm shadow-xl shadow-black/40">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-ink-850 border border-ink-750 text-white group-hover:bg-ink-800 transition-all">
              <svg className="h-6 w-6 text-ink-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <h3 className="mt-5 text-lg font-bold text-white flex items-center gap-2">
              Tìm kiếm lai RRF
              <span className="rounded-full bg-ink-800 px-2 py-0.5 text-[9px] text-ink-300 border border-ink-700 font-mono">
                + RRF
              </span>
            </h3>
            <p className="mt-3 text-sm text-ink-400 leading-relaxed group-hover:text-ink-300 transition-colors">
              Kết hợp thế mạnh của Vector Search ngữ nghĩa và Postgres Full-Text Search chính xác từ khóa, xếp hạng lai bằng công thức RRF chuyên nghiệp.
            </p>
          </div>

          {/* Card 3: Interactive Citations */}
          <div className="group relative rounded-2xl border border-ink-800/80 bg-ink-900/70 p-6 hover:border-ink-700 hover:bg-ink-900/90 hover:shadow-emerald-500/5 hover:shadow-lg transition-all duration-300 backdrop-blur-sm shadow-xl shadow-black/40">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-ink-850 border border-ink-750 text-white group-hover:bg-ink-800 transition-all">
              <svg className="h-6 w-6 text-ink-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <h3 className="mt-5 text-lg font-bold text-white">Trích dẫn gốc minh bạch</h3>
            <p className="mt-3 text-sm text-ink-400 leading-relaxed group-hover:text-ink-300 transition-colors">
              Xem chi tiết nguồn tài liệu, trang số, phần trăm độ trùng khớp và hiển thị nội dung gốc trích xuất trực tiếp thông qua Popover Slide-over.
            </p>
          </div>

          {/* Card 4: Financial Table Converter */}
          <div className="group relative rounded-2xl border border-ink-800/80 bg-ink-900/70 p-6 hover:border-ink-700 hover:bg-ink-900/90 hover:shadow-cyan-500/5 hover:shadow-lg transition-all duration-300 backdrop-blur-sm shadow-xl shadow-black/40">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-ink-850 border border-ink-750 text-white group-hover:bg-ink-800 transition-all">
              <svg className="h-6 w-6 text-ink-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <h3 className="mt-5 text-lg font-bold text-white">Chuyển đổi bảng biểu</h3>
            <p className="mt-3 text-sm text-ink-400 leading-relaxed group-hover:text-ink-300 transition-colors">
              Tự động định dạng các bảng thô từ PDF thành bảng HTML chuyên nghiệp: phân màu dòng (zebra), căn lề cột số liệu và căn chỉnh phông chữ.
            </p>
          </div>

          {/* Card 5: Smart Ingestion & OCR */}
          <div className="group relative rounded-2xl border border-ink-800/80 bg-ink-900/70 p-6 hover:border-ink-700 hover:bg-ink-900/90 hover:shadow-amber-500/5 hover:shadow-lg transition-all duration-300 backdrop-blur-sm shadow-xl shadow-black/40">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-ink-850 border border-ink-750 text-white group-hover:bg-ink-800 transition-all">
              <svg className="h-6 w-6 text-ink-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M14.121 14.121L19 19m-4.879-4.879A3 3 0 1012 12a3 3 0 002.121 2.121zM10.5 10.5L19 2m-8.5 8.5A3 3 0 116 6a3 3 0 014.5 4.5zm0 3l-8.5 8.5" />
              </svg>
            </div>
            <h3 className="mt-5 text-lg font-bold text-white">Phân tách thông minh (OCR)</h3>
            <p className="mt-3 text-sm text-ink-400 leading-relaxed group-hover:text-ink-300 transition-colors">
              Pipeline tách trang, nhận diện cấu trúc, chạy OCR Tesseract động trên từng trang chất lượng kém để đảm bảo xử lý được cả PDF scan.
            </p>
          </div>

          {/* Card 6: Rich Seed Financial Corpus */}
          <div className="group relative rounded-2xl border border-ink-800/80 bg-ink-900/70 p-6 hover:border-ink-700 hover:bg-ink-900/90 hover:shadow-indigo-500/5 hover:shadow-lg transition-all duration-300 backdrop-blur-sm shadow-xl shadow-black/40">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-ink-850 border border-ink-750 text-white group-hover:bg-ink-800 transition-all">
              <svg className="h-6 w-6 text-ink-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </div>
            <h3 className="mt-5 text-lg font-bold text-white">Kho tài liệu khổng lồ</h3>
            <p className="mt-3 text-sm text-ink-400 leading-relaxed group-hover:text-ink-300 transition-colors">
              Tích hợp sẵn hàng trăm báo cáo tài chính kiểm toán và báo cáo thường niên giai đoạn 2025-2026 của rổ VN30. Mở app lên là hỏi được ngay.
            </p>
          </div>
        </div>
      </section>

      {/* --- Tech Stack Section --- */}
      <section id="tech" className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 border-t border-ink-800/40 scroll-mt-6">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <h2 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
            Công nghệ sử dụng
          </h2>
          <p className="mt-4 text-ink-400 text-sm sm:text-base leading-relaxed">
            Kiến trúc công nghệ tối ưu cho luồng xử lý trích xuất dữ liệu lớn và đối soát số liệu BCTC thời gian thực.
          </p>
        </div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {/* Frontend Stack */}
          <div className="group relative rounded-2xl border border-ink-800/80 bg-ink-900/70 p-5 hover:border-ink-700 hover:bg-ink-900/90 transition-all duration-300 backdrop-blur-sm shadow-xl shadow-black/40">
            <h4 className="text-xs font-bold text-white uppercase tracking-wider mb-4 border-b border-ink-800 pb-2">Web Frontend</h4>
            <ul className="space-y-2 text-xs text-ink-400">
              <li className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-white" />
                Next.js 15 (App Router)
              </li>
              <li className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-white" />
                Tailwind CSS
              </li>
              <li className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-white" />
                TypeScript & React 19
              </li>
            </ul>
          </div>

          {/* Backend Stack */}
          <div className="group relative rounded-2xl border border-ink-800/80 bg-ink-900/70 p-5 hover:border-ink-700 hover:bg-ink-900/90 transition-all duration-300 backdrop-blur-sm shadow-xl shadow-black/40">
            <h4 className="text-xs font-bold text-white uppercase tracking-wider mb-4 border-b border-ink-800 pb-2">API Backend</h4>
            <ul className="space-y-2 text-xs text-ink-400">
              <li className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-white" />
                FastAPI (Python)
              </li>
              <li className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-white" />
                SQLAlchemy & Alembic
              </li>
              <li className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-white" />
                Uvicorn Server
              </li>
            </ul>
          </div>

          {/* Database Stack */}
          <div className="group relative rounded-2xl border border-ink-800/80 bg-ink-900/70 p-5 hover:border-ink-700 hover:bg-ink-900/90 transition-all duration-300 backdrop-blur-sm shadow-xl shadow-black/40">
            <h4 className="text-xs font-bold text-white uppercase tracking-wider mb-4 border-b border-ink-800 pb-2">Database & Queue</h4>
            <ul className="space-y-2 text-xs text-ink-400">
              <li className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-white" />
                PostgreSQL (pgvector 16)
              </li>
              <li className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-white" />
                Redis (Queue & Caching)
              </li>
              <li className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-white" />
                RQ (Redis Queue) Worker
              </li>
            </ul>
          </div>

          {/* AI & OCR Stack */}
          <div className="group relative rounded-2xl border border-ink-800/80 bg-ink-900/70 p-5 hover:border-ink-700 hover:bg-ink-900/90 transition-all duration-300 backdrop-blur-sm shadow-xl shadow-black/40">
            <h4 className="text-xs font-bold text-white uppercase tracking-wider mb-4 border-b border-ink-800 pb-2">AI & OCR Ingestion</h4>
            <ul className="space-y-2 text-xs text-ink-400">
              <li className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-white" />
                Google Gemini API (1.5 Pro)
              </li>
              <li className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-white" />
                Ollama (nomic-embed-text)
              </li>
              <li className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-white" />
                Tesseract OCR (PDF scan)
              </li>
            </ul>
          </div>
        </div>
      </section>

      {/* --- Footer --- */}
      <footer className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 border-t border-ink-800/40 text-center text-xs text-ink-500">
        <p>© 2026 FinRAG. Sản xuất dành riêng cho bài toán phân tích RAG báo cáo tài chính doanh nghiệp Việt Nam.</p>
      </footer>
    </div>
  );
}
