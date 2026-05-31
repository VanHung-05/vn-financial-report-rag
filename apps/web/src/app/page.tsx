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
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-brand-600 to-emerald-500 shadow-lg shadow-brand-500/20">
              <span className="text-xl font-bold text-white">📊</span>
            </div>
            <div>
              <span className="text-xl font-bold tracking-tight bg-gradient-to-r from-white via-ink-100 to-brand-400 bg-clip-text text-transparent">
                FinRAG
              </span>
              <span className="ml-1.5 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[9px] font-semibold text-emerald-400 border border-emerald-500/20 uppercase">
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
        <div className="max-w-3xl">
          <div className="inline-flex items-center gap-2 rounded-full bg-brand-500/10 border border-brand-500/20 px-3 py-1 text-xs font-semibold text-brand-300 mb-6">
            <span>🚀 RAG Thế Hệ Mới Chuyên Biệt BCTC</span>
          </div>
          
          <h1 className="text-4xl font-extrabold tracking-tight text-white sm:text-5xl lg:text-6xl leading-[1.1]">
            Trợ lý AI Phân tích <br />
            <span className="bg-gradient-to-r from-brand-400 via-emerald-400 to-indigo-400 bg-clip-text text-transparent">
              Báo cáo Tài chính
            </span> <br />
            Việt Nam vượt trội
          </h1>
          
          <p className="mt-6 text-lg text-ink-300 leading-relaxed max-w-2xl">
            FinRAG mang lại độ chính xác số liệu tuyệt đối cho hoạt động đối soát tài chính nhờ cơ chế Định tuyến thông minh, đối soát số liệu SQL Database và RAG lai xếp hạng RRF thế hệ mới.
          </p>

          <div className="mt-10 flex flex-wrap gap-4">
            <Link
              href="/chat"
              className="rounded-xl bg-gradient-to-r from-brand-600 to-emerald-500 px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-brand-500/25 hover:scale-[1.03] transition-all"
            >
              💬 Trò chuyện với FinRAG
            </Link>
            <Link
              href="/documents"
              className="rounded-xl border border-ink-700 bg-ink-900/40 px-6 py-3.5 text-sm font-semibold text-ink-200 hover:bg-ink-800 hover:text-white hover:border-ink-600 transition-all"
            >
              📊 Quản lý tài liệu BCTC
            </Link>
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
          <div className="group relative rounded-2xl border border-ink-800 bg-ink-900/40 p-6 hover:border-brand-500/40 hover:bg-brand-500/5 transition-all duration-300">
            <div className="absolute top-0 right-0 h-20 w-20 rounded-full bg-brand-500/5 blur-[20px] group-hover:bg-brand-500/10" />
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-500/10 text-brand-400 group-hover:bg-brand-500/20 transition-all">
              <span className="text-2xl">🗄️</span>
            </div>
            <h3 className="mt-5 text-lg font-bold text-white flex items-center gap-2">
              Truy xuất SQL chính xác
              <span className="rounded-full bg-brand-500/10 px-2 py-0.5 text-[9px] text-brand-300 border border-brand-500/20 font-mono">
                + SQL
              </span>
            </h3>
            <p className="mt-3 text-sm text-ink-300 leading-relaxed">
              Tự động phân loại câu hỏi số liệu cấu trúc và định tuyến truy vấn trực tiếp từ cơ sở dữ liệu `financial_facts` SQL chính xác 100%.
            </p>
          </div>

          {/* Card 2: Hybrid Search RRF */}
          <div className="group relative rounded-2xl border border-ink-800 bg-ink-900/40 p-6 hover:border-brand-500/40 hover:bg-brand-500/5 transition-all duration-300">
            <div className="absolute top-0 right-0 h-20 w-20 rounded-full bg-indigo-500/5 blur-[20px] group-hover:bg-indigo-500/10" />
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-400 group-hover:bg-indigo-500/20 transition-all">
              <span className="text-2xl">🔍</span>
            </div>
            <h3 className="mt-5 text-lg font-bold text-white flex items-center gap-2">
              Tìm kiếm lai RRF
              <span className="rounded-full bg-indigo-500/10 px-2 py-0.5 text-[9px] text-indigo-300 border border-indigo-500/20 font-mono">
                + RRF
              </span>
            </h3>
            <p className="mt-3 text-sm text-ink-300 leading-relaxed">
              Kết hợp thế mạnh của Vector Search ngữ nghĩa và Postgres Full-Text Search chính xác từ khóa, xếp hạng lai bằng công thức RRF chuyên nghiệp.
            </p>
          </div>

          {/* Card 3: Interactive Citations */}
          <div className="group relative rounded-2xl border border-ink-800 bg-ink-900/40 p-6 hover:border-brand-500/40 hover:bg-brand-500/5 transition-all duration-300">
            <div className="absolute top-0 right-0 h-20 w-20 rounded-full bg-emerald-500/5 blur-[20px] group-hover:bg-emerald-500/10" />
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400 group-hover:bg-emerald-500/20 transition-all">
              <span className="text-2xl">📄</span>
            </div>
            <h3 className="mt-5 text-lg font-bold text-white">Trích dẫn gốc minh bạch</h3>
            <p className="mt-3 text-sm text-ink-300 leading-relaxed">
              Xem chi tiết nguồn tài liệu, trang số, phần trăm độ trùng khớp và hiển thị nội dung gốc trích xuất trực tiếp thông qua Popover Slide-over.
            </p>
          </div>

          {/* Card 4: Financial Table Converter */}
          <div className="group relative rounded-2xl border border-ink-800 bg-ink-900/40 p-6 hover:border-brand-500/40 hover:bg-brand-500/5 transition-all duration-300">
            <div className="absolute top-0 right-0 h-20 w-20 rounded-full bg-cyan-500/5 blur-[20px] group-hover:bg-cyan-500/10" />
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-400 group-hover:bg-cyan-500/20 transition-all">
              <span className="text-2xl">📊</span>
            </div>
            <h3 className="mt-5 text-lg font-bold text-white">Chuyển đổi bảng biểu</h3>
            <p className="mt-3 text-sm text-ink-300 leading-relaxed">
              Tự động định dạng các bảng thô từ PDF thành bảng HTML chuyên nghiệp: phân màu dòng (zebra), căn lề cột số liệu và căn chỉnh phông chữ.
            </p>
          </div>

          {/* Card 5: Smart Ingestion & OCR */}
          <div className="group relative rounded-2xl border border-ink-800 bg-ink-900/40 p-6 hover:border-brand-500/40 hover:bg-brand-500/5 transition-all duration-300">
            <div className="absolute top-0 right-0 h-20 w-20 rounded-full bg-amber-500/5 blur-[20px] group-hover:bg-amber-500/10" />
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-500/10 text-amber-400 group-hover:bg-amber-500/20 transition-all">
              <span className="text-2xl">✂️</span>
            </div>
            <h3 className="mt-5 text-lg font-bold text-white">Phân tách thông minh (OCR)</h3>
            <p className="mt-3 text-sm text-ink-300 leading-relaxed">
              Pipeline tách trang, nhận diện cấu trúc, chạy OCR Tesseract động trên từng trang chất lượng kém để đảm bảo xử lý được cả PDF scan.
            </p>
          </div>

          {/* Card 6: Rich Seed Financial Corpus */}
          <div className="group relative rounded-2xl border border-ink-800 bg-ink-900/40 p-6 hover:border-brand-500/40 hover:bg-brand-500/5 transition-all duration-300">
            <div className="absolute top-0 right-0 h-20 w-20 rounded-full bg-indigo-500/5 blur-[20px] group-hover:bg-indigo-500/10" />
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-400 group-hover:bg-indigo-500/20 transition-all">
              <span className="text-2xl">📚</span>
            </div>
            <h3 className="mt-5 text-lg font-bold text-white">Kho tài liệu khổng lồ</h3>
            <p className="mt-3 text-sm text-ink-300 leading-relaxed">
              Tích hợp sẵn hàng trăm báo cáo tài chính kiểm toán và báo cáo thường niên giai đoạn 2025-2026 của rổ VN30. Mở app lên là hỏi được ngay.
            </p>
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
