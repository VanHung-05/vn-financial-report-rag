# Vietnamese Financial Report RAG

Ứng dụng RAG cho báo cáo tài chính doanh nghiệp Việt Nam. Hệ thống có sẵn ~200 BCTC (VN30/HOSE 2025–2026), user mở lên hỏi được ngay. Nếu không có dữ liệu liên quan, API trả lời rõ và gợi ý upload thêm file.

- **Embedding:** Ollama (local, không cần API key)
- **Chat:** Google Gemini
- **DB:** PostgreSQL + pgvector | **Queue:** Redis

---

## Chạy nhanh (3 lệnh)

Cần cài sẵn: **Docker Desktop**, **Python 3.10+**, **Node/npm**, **[Ollama](https://ollama.com)**, **Gemini API key**.

```bash
cd vn-financial-report-rag

# 1) Lần đầu — venv, DB, migrate, npm
./scripts/dev.sh setup
# Sửa .env: GEMINI_API_KEY=...
# ollama pull nomic-embed-text
# brew install tesseract tesseract-lang   # OCR PDF scan

# 2) Mỗi lần dev — bật API + Worker + Web (1 lệnh)
./scripts/dev.sh up

# Mở http://localhost:3000
```

```bash
# Dừng app (giữ Docker DB)
./scripts/dev.sh down

# Kiểm tra / log / index lại PDF trống
./scripts/dev.sh status
./scripts/dev.sh logs worker
./scripts/dev.sh reindex
```

Tương đương: `make setup` · `make up` · `make down`

| URL | Dịch vụ |
|-----|---------|
| http://localhost:3000 | Giao diện web |
| http://localhost:8000/docs | API Swagger |
| http://localhost:8000/health | Health check |

Log nằm trong `.dev/logs/` (api, worker, web).

---

## Yêu cầu trước khi chạy

| Thành phần | Phiên bản / ghi chú |
|------------|---------------------|
| Python | **3.10 trở lên** (không dùng 3.8) |
| Docker Desktop | Postgres + Redis |
| [Ollama](https://ollama.com) | Embed văn bản local |
| Gemini API key | [Google AI Studio](https://aistudio.google.com/apikey) |

Kiểm tra Python:

```bash
python3 --version
# Python 3.10.x hoặc 3.11/3.12 — OK
```

---

## Hướng dẫn chi tiết từng bước (tùy chọn)

### Bước 0 — Vào thư mục project

```bash
cd /Users/macbook/Documents/vn-financial-report-rag
```

(Thay đường dẫn nếu bạn clone repo ở chỗ khác.)

---

### Bước 1 — Tạo môi trường ảo (venv)

**Tạo venv** (chỉ làm một lần):

```bash
# macOS/Linux — ưu tiên python3.10 hoặc python3.11
python3.10 -m venv venv

# Nếu không có python3.10, thử:
# python3 -m venv venv
```

**Kích hoạt venv** (mỗi lần mở terminal mới):

```bash
# macOS / Linux
source venv/bin/activate
```

```powershell
# Windows (PowerShell)
venv\Scripts\Activate.ps1
```

```cmd
# Windows (CMD)
venv\Scripts\activate.bat
```

Sau khi kích hoạt, prompt có tiền tố `(venv)` và lệnh `which python` trỏ vào `.../vn-financial-report-rag/venv/bin/python`.

```bash
which python
python --version
```

**Cài dependencies** (trong venv, chỉ làm một lần hoặc khi đổi `requirements.txt`):

```bash
pip install --upgrade pip
pip install -r apps/api/requirements.txt -r apps/worker/requirements.txt
```

Kiểm tra nhanh:

```bash
python -c "import redis, fastapi; print('OK')"
```

---

### Bước 2 — Cấu hình file `.env`

File `.env` đặt **ở thư mục gốc repo** (cùng cấp `docker-compose.yml`):

```text
vn-financial-report-rag/
├── .env              ← file cấu hình thật (không commit git)
├── .env.example      ← mẫu
├── docker-compose.yml
├── venv/
└── apps/
```

Tạo từ mẫu (nếu chưa có):

```bash
cp .env.example .env
```

Mở `.env` và điền ít nhất:

```text
GEMINI_API_KEY=your_key_here
```

Các biến quan trọng khác (thường giữ mặc định khi chạy local):

| Biến | Giá trị gợi ý |
|------|----------------|
| `OLLAMA_BASE_URL` | `http://localhost:11434` |
| `EMBEDDING_MODEL` | `nomic-embed-text` |
| `EMBEDDING_DIMENSIONS` | `768` |
| `LLM_MODEL` | `gemini-2.0-flash` |

---

### Bước 3 — Cài và chạy Ollama (embedding)

Ollama **không cần API key**. Chỉ cần app Ollama chạy trên máy.

1. Cài từ https://ollama.com/download  
2. Pull model embed:

```bash
ollama pull nomic-embed-text
```

3. Kiểm tra Ollama đang chạy:

```bash
curl http://localhost:11434/api/tags
```

Nếu trả JSON danh sách model → OK.

> **Lưu ý:** Nếu sau này chạy API/worker **trong Docker** mà Ollama vẫn trên máy host, sửa trong `.env`:  
> `OLLAMA_BASE_URL=http://host.docker.internal:11434`

---

### Bước 4 — Chạy PostgreSQL và Redis (Docker)

Đảm bảo Docker Desktop đang chạy, rồi:

```bash
# Từ thư mục gốc repo
docker compose up postgres redis -d
```

Kiểm tra container:

```bash
docker compose ps
```

Cả `postgres` và `redis` phải ở trạng thái `running` / `healthy`.

---

### Bước 5 — Migration database

**Bật venv** nếu chưa bật (`source venv/bin/activate`), rồi:

```bash
cd apps/api
alembic upgrade head
cd ../..
```

Lần đầu sẽ tạo bảng + extension `pgvector`. Nếu lỗi kết nối DB, kiểm tra Docker postgres đã chạy và `DATABASE_URL` trong `.env`.

---

### Bước 6 — Chạy API (terminal 1)

```bash
# Từ thư mục gốc repo, venv đã activate
source venv/bin/activate
cd apps/api
uvicorn app.main:app --reload --port 8000
```

Mở trình duyệt hoặc curl:

- Docs API: http://localhost:8000/docs  
- Health: http://localhost:8000/health  

Giữ terminal này chạy, không tắt.

---

### Bước 7 — Chạy Worker (terminal 2)

Mở **terminal mới**, lại activate venv:

```bash
cd /Users/macbook/Documents/vn-financial-report-rag
source venv/bin/activate
cd apps/worker
python run_worker.py
```

**Lần đầu chạy** (khi bảng `documents` còn trống): worker tự index theo `.env`:

| Biến | Ý nghĩa | Gợi ý dev |
|------|---------|-----------|
| `AUTO_SEED_ENABLED` | Bật/tắt auto-index | `true` |
| `AUTO_SEED_MANIFEST` | File manifest | `public_demo.jsonl` (20 báo cáo) |
| `AUTO_SEED_LIMIT` | Chỉ lấy N dòng đầu | `5` (thử nhanh), `0` = hết file manifest |
| `SEED_DATA_RATE_LIMIT` | Giây giữa mỗi job | `2` |

Ví dụ chỉ chạy **5 báo cáo** từ demo (mặc định trong `.env`):

```text
AUTO_SEED_ENABLED=true
AUTO_SEED_MANIFEST=public_demo.jsonl
AUTO_SEED_LIMIT=5
```

Tắt auto-index, tự chọn số lượng:

```bash
# Trong .env
AUTO_SEED_ENABLED=false

# Rồi chạy thủ công (từ apps/worker, venv đã bật)
python -m worker.seed_runner ../../samples/manifests/public_demo.jsonl --limit 3
# hoặc
python -m worker.seed_runner ../../samples/manifests/initial_corpus.jsonl --limit 10
```

Nếu DB **đã có** documents, auto-seed sẽ bỏ qua. Muốn chạy lại từ đầu:

```bash
# Cẩn thận: xóa hết dữ liệu đã index
docker compose exec postgres psql -U raguser -d vnfinrag -c "TRUNCATE document_chunks, document_pages, financial_tables, financial_facts, documents, companies CASCADE;"
```

Theo dõi tiến độ:

```bash
# Terminal 3 (venv activate)
curl http://localhost:8000/documents?limit=5
curl http://localhost:8000/documents/<DOCUMENT_ID>/status
```

Khi `status` = `ready` là báo cáo đó đã hỏi được.

---

### Bước 8 — Thử hỏi đáp

```bash
# Tìm kiếm theo nội dung
curl "http://localhost:8000/search?q=doanh+thu+FPT"

# Tạo phiên chat
curl -X POST http://localhost:8000/chat/sessions \
  -H "Content-Type: application/json" \
  -d '{"title": "Phân tích FPT"}'

# Gửi câu hỏi (thay SESSION_ID bằng id trả về ở bước trên)
curl -X POST http://localhost:8000/chat/sessions/SESSION_ID/messages \
  -H "Content-Type: application/json" \
  -d '{"content": "Doanh thu của FPT quý 1 năm 2026 là bao nhiêu?"}'
```

Nếu **không có dữ liệu** trong corpus, câu trả lời sẽ nói rõ không tìm thấy và gợi ý upload thêm báo cáo.

---

## Tóm tắt lệnh (copy nhanh)

```bash
# === Một lần đầu ===
cd vn-financial-report-rag
python3.10 -m venv venv
source venv/bin/activate
pip install --upgrade pip
pip install -r apps/api/requirements.txt -r apps/worker/requirements.txt
cp .env.example .env   # rồi sửa GEMINI_API_KEY
ollama pull nomic-embed-text

# === Mỗi lần dev ===
source venv/bin/activate
docker compose up postgres redis -d

# Terminal 1
cd apps/api && alembic upgrade head && uvicorn app.main:app --reload --port 8000

# Terminal 2
cd apps/worker && python run_worker.py
```

---

## Xử lý lỗi thường gặp

### `ModuleNotFoundError: No module named 'redis'`

Chưa bật venv hoặc chưa cài package:

```bash
source venv/bin/activate
pip install -r apps/api/requirements.txt -r apps/worker/requirements.txt
```

Đừng chạy `uvicorn` bằng Python 3.8 hệ thống.

### `python3` là 3.8 / quá cũ

Tạo venv bằng Python mới hơn:

```bash
python3.10 -m venv venv
source venv/bin/activate
```

### Ollama embedding failed

- Mở app Ollama hoặc `ollama serve`
- `ollama pull nomic-embed-text`
- `curl http://localhost:11434/api/tags`

### Gemini / chat lỗi

- Kiểm tra `GEMINI_API_KEY` trong `.env` (thư mục gốc repo)
- Restart API sau khi sửa `.env`

### `password authentication failed for user "raguser"`

Thường do **sai cổng**: app kết nối `localhost:5432` (Postgres khác trên máy) trong khi Docker map Postgres project ở **`5433`**.

Kiểm tra trong `.env`:

```text
DATABASE_URL=...@localhost:5433/vnfinrag
DATABASE_URL_SYNC=...@localhost:5433/vnfinrag
```

```bash
docker compose ps          # postgres phải map 0.0.0.0:5433->5432
PGPASSWORD=ragpass psql -h localhost -p 5433 -U raguser -d vnfinrag -c 'SELECT 1'
```

### Không kết nối được Postgres

```bash
docker compose up postgres redis -d
docker compose ps
```

### Worker không tự tải báo cáo

- DB đã có `documents` từ lần chạy trước → worker bỏ qua auto-seed
- Xem log terminal worker
- Manifest: `samples/manifests/initial_corpus.jsonl`

### `signal 11` / `Work-horse terminated unexpectedly` (macOS)

RQ fork job sau khi process cha đã mở PostgreSQL → crash trên macOS. Đã xử lý bằng:

- Auto-seed chạy subprocess (`run_auto_seed.py`), không import DB trong `run_worker.py`
- Trên macOS dùng `SimpleWorker` (không fork)

Cập nhật code rồi **chạy lại worker** từ repo root:

```bash
source venv/bin/activate
cd apps/worker
python run_worker.py
```

Job lỗi trước đó nằm trong Redis Failed registry — reset và enqueue lại:

```bash
cd apps/worker
python -m worker.requeue_failed
```

Hoặc xóa documents lỗi và truncate DB rồi chạy lại worker (xem mục auto-seed).

---

## Cấu trúc thư mục

```text
vn-financial-report-rag/
├── .env
├── .env.example
├── docker-compose.yml
├── venv/                    # môi trường ảo Python (gitignore)
├── apps/
│   ├── api/                 # FastAPI
│   └── worker/              # ingestion + auto-index
└── samples/manifests/       # metadata ~200 BCTC
```

---

## Kiến trúc

```text
User → FastAPI → PostgreSQL (metadata + pgvector)
              → Redis Queue → Worker
                                → Parse PDF
                                → Chunk
                                → Ollama embed
              → Chat → Gemini + citations
```

---

## API chính

| Method | Path | Mô tả |
|--------|------|--------|
| GET | `/health` | Kiểm tra API |
| GET | `/documents` | Danh sách báo cáo |
| GET | `/documents/{id}/status` | Tiến độ xử lý |
| GET | `/search?q=` | Tìm chunk liên quan |
| POST | `/chat/sessions` | Tạo phiên chat |
| POST | `/chat/sessions/{id}/messages` | Hỏi đáp |

Chi tiết: http://localhost:8000/docs

---

## Dữ liệu có sẵn

~200 báo cáo tài chính PDF từ 29 mã (FPT, VCB, BID, HPG, VNM, MWG, …), kỳ 2025–2026. Tự index lần đầu khi worker chạy — **không cần lệnh seed thủ công**.
