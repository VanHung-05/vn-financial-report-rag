# Vietnamese Financial Report RAG 📊

[![Python Version](https://img.shields.io/badge/Python-3.10%2B-blue.svg?style=for-the-badge&logo=python&logoColor=white)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.110%2B-009688.svg?style=for-the-badge&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![Next.js](https://img.shields.io/badge/Next.js-14-black.svg?style=for-the-badge&logo=next.js&logoColor=white)](https://nextjs.org/)
[![Docker](https://img.shields.io/badge/Docker-Enabled-2496ED.svg?style=for-the-badge&logo=docker&logoColor=white)](https://www.docker.com/)

Hệ thống **RAG (Retrieval-Augmented Generation)** chuyên nghiệp được thiết kế để phân tích chuyên sâu báo cáo tài chính doanh nghiệp Việt Nam (Bảng cân đối kế toán, Báo cáo KQKD, Báo cáo lưu chuyển tiền tệ và Thuyết minh BCTC) với độ chính xác cao nhất và loại bỏ hoàn toàn hiện tượng ảo tưởng (hallucination) đối với số liệu cốt lõi.

---

## ✨ Tính năng nổi bật

* **Tìm kiếm lai tối ưu (Hybrid Search)**: Kết hợp tìm kiếm ngữ nghĩa (Semantic Vector Search) sử dụng mô hình đa ngôn ngữ `bge-m3` và tìm kiếm từ khóa chính xác (FTS - Full-Text Search) trên PostgreSQL.
* **Xếp hạng lai RRF (Reciprocal Rank Fusion)**: Thuật toán trộn kết quả từ hai công cụ tìm kiếm giúp lấy ra các chunks văn bản có giá trị ngữ cảnh cao nhất.
* **Định tuyến SQL chính xác (SQL Fact Routing)**: Tự động phát hiện câu hỏi tra cứu số liệu (ví dụ: *"Doanh thu FPT năm 2025 là bao nhiêu?"*) để truy vấn trực tiếp từ bảng cơ sở dữ liệu đối soát chính xác **100%**, tránh ảo tưởng chữ viết từ mô hình ngôn ngữ lớn.
* **Bộ tách trang tài chính (Layout-Aware Chunker)**: Chunker thông minh tự động nhận diện bố cục bảng số liệu đa cột, giữ nguyên ngữ cảnh của các dòng số liệu kèm tiêu đề bảng và số trang nguồn.
* **Giới hạn phạm vi Công ty (Scope Guard)**: Tự động nhận diện mã chứng khoán (Ticker) trong câu hỏi để lọc phạm vi chunks tài liệu, tránh nhiễu thông tin giữa các công ty khác nhau.

---

## 🏗 Kiến trúc Hệ thống

```mermaid
graph TD
    User([Người dùng đặt câu hỏi]) --> Router{Bộ định tuyến câu hỏi}
    
    Router -- Tra cứu số liệu chuẩn --> FactEngine[SQL Fact Engine]
    FactEngine --> PostgresDB[(PostgreSQL Database)]
    
    Router -- Phân tích mở rộng --> HybridRAG[Hybrid Search RAG]
    HybridRAG --> DenseSearch[Tìm kiếm Vector Ngữ nghĩa]
    HybridRAG --> SparseSearch[Tìm kiếm Từ khóa FTS]
    
    DenseSearch --> PostgresDB
    SparseSearch --> PostgresDB
    
    DenseSearch & SparseSearch --> RRF[Trộn điểm RRF & Khử trùng lặp]
    RRF --> LLMContext[Lắp ghép Ngữ cảnh nguồn]
    LLMContext --> Gemini[Google Gemini API]
    Gemini --> FinalAnswer([Câu trả lời kèm Trích dẫn số trang nguồn])
```

---

## 🚀 Hướng dẫn Chạy nhanh (3 bước)

### 📋 Yêu cầu hệ thống
Yêu cầu máy tính cài đặt sẵn: **Docker Desktop**, **Python 3.10+**, **Node.js/npm**, và **[Ollama](https://ollama.com)**.

### Bước 1: Khởi tạo stack môi trường
Chạy script tự động cài đặt môi trường ảo Python, kéo các npm packages cho Next.js, tạo containers và chạy migrations database.

```bash
# Clone source code từ repository
git clone https://github.com/VanHung-05/vn-financial-report-rag.git
cd vn-financial-report-rag

# Chạy lệnh cấu hình tự động (setup venv, DB, migrate, npm)
./scripts/dev.sh setup
```

### Bước 2: Cấu hình file `.env`
Tạo file `.env` tại thư mục gốc của project (nếu chưa có) và cấu hình key của Google Gemini:

```env
# Cấu hình Kết nối Database
DATABASE_URL=postgresql+asyncpg://raguser:ragpass@localhost:5433/vnfinrag
DATABASE_URL_SYNC=postgresql://raguser:ragpass@localhost:5433/vnfinrag

# Cấu hình Hàng đợi Task Redis
REDIS_URL=redis://localhost:6379/0

# API key của Google Gemini (Lấy tại https://aistudio.google.com/apikey)
GEMINI_API_KEY=AIzaSyYourGeminiApiKeyHere
LLM_MODEL=gemini-3.1-flash-lite

# Mô hình Embedding chạy cục bộ qua Ollama
EMBEDDING_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434
EMBEDDING_MODEL=bge-m3
EMBEDDING_DIMENSIONS=1024
```

> [!IMPORTANT]
> Trước khi khởi động hệ thống, bạn cần tải model embedding đa ngôn ngữ `bge-m3` về Ollama:
> ```bash
> ollama pull bge-m3
> ```

### Bước 3: Khởi động hệ thống
Bật toàn bộ ứng dụng (FastAPI Backend, RQ Worker, Next.js Frontend và Docker DB/Redis) chỉ bằng 1 lệnh:

```bash
./scripts/dev.sh up
```

Sau khi stack khởi chạy thành công, truy cập:
* 🌐 **Giao diện Web Chat**: [http://localhost:3000](http://localhost:3000)
* 🔌 **Tài liệu Swagger API**: [http://localhost:8000/docs](http://localhost:8000/docs)

> [!TIP]
> Bạn có thể sử dụng các lệnh rút gọn qua Makefile: `make setup`, `make up`, và `make down`.

---

## 📊 Bảng điều khiển dịch vụ

| Địa chỉ URL | Dịch vụ | Chức năng | Port |
| :--- | :--- | :--- | :--- |
| `http://localhost:3000` | **Next.js Web App** | Giao diện Chat, hiển thị bảng số liệu trực quan, trang quản trị tài liệu và tải lên báo cáo mới. | `3000` |
| `http://localhost:8000` | **FastAPI Server** | Router API chính chịu trách nhiệm tìm kiếm lai RRF, phân quyền, và chat. | `8000` |
| `http://localhost:5433` | **PostgreSQL DB** | Lưu trữ dữ liệu cấu trúc và pgvector embeddings. | `5433` |
| `http://localhost:6379` | **Redis Cache/Queue** | Quản lý hàng đợi tải tài liệu và tiến độ băm chunks dữ liệu. | `6379` |

---

## 💡 Cấu hình RAG tối ưu (Tùy chọn)

> [!TIP]
> Bạn có thể tinh chỉnh các thông số tìm kiếm và định tuyến ngay trên giao diện web (Hộp thoại **Cài đặt** ở góc trên bên phải):

* **Số lượng Chunks truy xuất (Top-K)**: Số đoạn văn bản/bảng biểu nhiều nhất được đưa vào prompt ngữ cảnh cho Gemini (Mặc định: `15` chunks).
* **Tỷ lệ truy xuất lai (Hybrid Search)**: Phân chia trọng số giữa tìm kiếm vector ngữ nghĩa và tìm kiếm từ khóa FTS chính xác (Mặc định: `70% Vector / 30% FTS`).
* **Định tuyến SQL (SQL Routing)**: Bật tắt chế độ tra cứu chỉ tiêu từ cơ sở dữ liệu số liệu đối soát chính thức trước khi tìm kiếm chunks văn bản.

---

## 🛠 Xử lý sự cố thường gặp

### Lỗi `ModuleNotFoundError: No module named 'pytesseract'`
Lỗi xảy ra do lệnh được chạy bằng Python môi trường toàn cục (global) thay vì môi trường ảo của dự án. Hãy chắc chắn bạn đã kích hoạt venv trước khi chạy:
```bash
source venv/bin/activate
```
Nếu dùng VS Code, góc dưới cùng bên phải phải hiển thị Interpreter là `venv/bin/python`.

### Xóa toàn bộ dữ liệu để index/chunk lại từ đầu
Nếu muốn làm sạch cơ sở dữ liệu để chạy lại bộ tách chunk & Tesseract OCR từ đầu trên tập tài liệu mẫu (auto-seed):
```bash
# 1. Truncate sạch dữ liệu trong Postgres và xóa cache Redis
docker compose exec -T postgres psql -U raguser -d vnfinrag -c "TRUNCATE document_chunks, document_pages, financial_tables, financial_facts, chat_messages, chat_sessions, documents, companies CASCADE;"
docker compose exec -T redis redis-cli FLUSHDB

# 2. Khởi động lại worker để tự động tải lên và re-index lại các file từ manifest
./scripts/dev.sh restart worker
```
