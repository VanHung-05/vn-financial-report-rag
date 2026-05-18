# Kế hoạch dự án: Vietnamese Financial Report RAG


## Mục tiêu

Xây dựng ứng dụng RAG cho báo cáo tài chính doanh nghiệp Việt Nam. Hệ thống cho phép user upload báo cáo tài chính của họ ở nhiều định dạng, lưu file gốc, trích xuất văn bản và bảng, chuẩn hóa metadata tài chính, tạo embeddings, lưu vào vector database và cho phép hỏi đáp có trích dẫn nguồn.

Mục tiêu khác biệt so với RAG tài liệu thường là phải hiểu được bảng số liệu, kỳ báo cáo, mã chứng khoán, loại báo cáo và đơn vị tiền tệ. Câu trả lời cần trích dẫn được đến báo cáo, kỳ, trang, bảng hoặc dòng chỉ tiêu liên quan.

## Phạm vi MVP

- Upload file báo cáo tài chính ở nhiều định dạng: `pdf`, `xlsx`, `xls`, `docx`, `doc`, `txt`, `html`, `csv`, `png`, `jpg`.
- Lưu file gốc trên Cloudinary hoặc object storage tương đương.
- Trích xuất cả text và bảng từ báo cáo tài chính.
- Hỗ trợ PDF text-based trước, sau đó bổ sung OCR cho PDF scan/ảnh.
- Dashboard quản lý tài liệu theo công ty, mã chứng khoán, năm, quý và loại báo cáo.
- Hiển thị tiến độ xử lý: upload, extract, parse table, normalize, chunk, embedding, indexed, ready.
- Cho phép truy vấn trên một báo cáo, nhiều báo cáo của một công ty hoặc toàn bộ bộ dữ liệu mẫu.
- Câu trả lời có citation theo báo cáo/kỳ/trang/bảng/chunk.
- Có sẵn vài trăm báo cáo tài chính gần đây đã index, user mở app lên hỏi được ngay mà không cần upload hay chạy lệnh seed gì.
- Khi câu hỏi không tìm được dữ liệu liên quan, hệ thống phải trả lời rõ ràng rằng chưa có thông tin này và gợi ý user upload thêm báo cáo.

## Dữ liệu ban đầu: lấy từ đâu và cách lấy

Không đưa vài trăm file báo cáo lớn trực tiếp vào git. Dữ liệu ban đầu nên đi qua `seed manifest`: file nhỏ chứa metadata và URL nguồn, còn file báo cáo gốc được tải về object storage bằng seed runner.

Nguồn dữ liệu ưu tiên:

- Website quan hệ cổ đông của từng doanh nghiệp niêm yết. Đây là nguồn nên ưu tiên nhất vì thường có báo cáo gốc, tiêu đề rõ, ít rủi ro sai nguồn.
- Trang công bố thông tin của HOSE, HNX/UPCoM và cơ quan quản lý nếu điều khoản sử dụng cho phép tải và lưu trữ cho mục đích demo/nội bộ.
- Website doanh nghiệp, mục `Nhà đầu tư`, `Quan hệ cổ đông`, `Báo cáo tài chính`, `Báo cáo thường niên`, `Công bố thông tin`.
- Nguồn tổng hợp như Vietstock, CafeF hoặc nhà cung cấp dữ liệu thương mại chỉ dùng khi có license hoặc điều khoản cho phép. Không dùng làm nguồn chính nếu chưa rõ quyền sử dụng.

Phạm vi seed nên bắt đầu với 200-500 báo cáo:

- Ưu tiên VN30, HNX30 và một số mã UPCoM vốn hóa/thanh khoản lớn.
- Mỗi công ty lấy báo cáo quý, bán niên, năm và báo cáo kiểm toán trong 2-4 năm gần nhất.
- Ví dụ: 50 công ty x 4 kỳ/năm x 2 năm = khoảng 400 báo cáo.

Cách lấy dữ liệu:

1. Tạo danh sách công ty seed trong `samples/manifests/companies_seed.csv` gồm `ticker`, `company_name`, `exchange`, `ir_url`, `disclosure_url`.
2. Viết script discovery đọc danh sách công ty, truy cập `ir_url` và `disclosure_url`, tìm link file theo từ khóa như `BCTC`, `báo cáo tài chính`, `financial statements`, `annual report`, `quý`, `Q1`, `Q2`, `Q3`, `Q4`, `kiểm toán`.
3. Với mỗi link tìm được, tạo record trong `public_demo.jsonl` hoặc `initial_corpus.jsonl` gồm `ticker`, `company_name`, `report_type`, `fiscal_year`, `fiscal_quarter`, `period`, `source_url`, `source_page_url`, `file_format`, `license_note`.
4. Chạy seed runner ở chế độ `dry_run` để kiểm tra URL còn sống, content type, dung lượng file, trùng URL và metadata thiếu.
5. Tải file theo batch nhỏ, có rate limit, retry và user-agent rõ ràng. Không scrape ồ ạt hoặc vượt điều khoản sử dụng của nguồn.
6. Tính SHA-256 cho từng file để dedupe. Nếu cùng checksum xuất hiện ở nhiều nguồn, giữ nguồn chính thống hơn và lưu các URL còn lại vào metadata.
7. Upload file gốc lên Cloudinary hoặc object storage, tạo `documents` với `source_type = public_seed`, rồi đẩy job vào ingestion queue.
8. Ghi log chất lượng từng file: tải thành công, parse được text, parse được bảng, cần OCR, lỗi metadata, lỗi định dạng.

Dữ liệu ban đầu phải được tải và index tự động khi deploy hoặc khởi động lần đầu. User không cần chạy lệnh seed. Hệ thống kiểm tra nếu DB chưa có dữ liệu thì tự đọc manifest, tải file và index ở background. Khi xong, user hỏi được ngay.

## Loại báo cáo cần hỗ trợ

- Báo cáo tài chính quý.
- Báo cáo tài chính bán niên.
- Báo cáo tài chính năm.
- Báo cáo tài chính kiểm toán.
- Báo cáo thường niên.
- Báo cáo riêng lẻ và hợp nhất.
- Thuyết minh báo cáo tài chính.

## Stack đề xuất

- Frontend: Next.js, TypeScript, Tailwind CSS, shadcn/ui.
- Backend API: FastAPI.
- Worker xử lý file: Python worker.
- Queue: Redis với RQ hoặc Celery.
- Database: PostgreSQL + pgvector.
- File storage: Cloudinary cho MVP, có thể đổi sang S3/R2/MinIO nếu cần lưu nhiều file rẻ hơn.
- Parsing:
  - PDF text: `pdfplumber`, `pypdf`, `PyMuPDF`.
  - PDF tables: `pdfplumber`, Camelot hoặc Tabula tùy chất lượng file.
  - Excel: `openpyxl`, `pandas`.
  - CSV: `pandas`.
  - DOCX: `python-docx`.
  - DOC: convert bằng LibreOffice headless sang DOCX/PDF/TXT trước khi parse.
  - HTML: BeautifulSoup hoặc lxml.
  - Ảnh/PDF scan: OCR bằng Tesseract, PaddleOCR hoặc dịch vụ OCR cloud.
- Embedding: OpenAI, Gemini hoặc model multilingual phù hợp tiếng Việt.
- LLM trả lời: OpenAI, Gemini, Claude hoặc provider tùy budget.

## Kiến trúc tổng quan

```text
User
  -> Next.js Web App
  -> FastAPI API
  -> Object Storage lưu file gốc
  -> PostgreSQL lưu metadata
  -> Redis Queue
  -> Python Worker
  -> Text extraction + Table extraction + OCR nếu cần
  -> Financial normalization
  -> Financial-aware chunking
  -> Embedding
  -> PostgreSQL pgvector
  -> RAG Chat API
  -> Câu trả lời có trích dẫn
```

## Cấu trúc thư mục đề xuất

```text
apps/
  web/                       # Next.js frontend
  api/                       # FastAPI backend
  worker/                    # Worker xử lý document ingestion
packages/
  shared/                    # Shared types/config nếu cần
docs/
  architecture.md
  api.md
  ingestion-pipeline.md
  financial-data-seeding.md
samples/
  manifests/
    public_demo.jsonl        # Metadata cho bộ demo nhỏ
    initial_corpus.jsonl     # Metadata cho vài trăm BCTC
  documents/                 # Chỉ chứa file mẫu rất nhỏ nếu thật sự cần
docker-compose.yml
.env.example
README.md
PROJECT_PLAN.md
```

## Database schema MVP

### Bảng `companies`

```text
id
ticker
name
exchange
industry
created_at
updated_at
```

### Bảng `documents`

```text
id
company_id
title
original_filename
mime_type
source_type
source_url
storage_public_id
storage_url
file_sha256
report_type
report_period
fiscal_year
fiscal_quarter
language
currency
unit_scale
status
progress
current_step
error_message
total_chunks
processed_chunks
created_at
updated_at
```

### Bảng `document_pages`

```text
id
document_id
page_number
text
ocr_used
extraction_quality
metadata
created_at
```

### Bảng `financial_tables`

```text
id
document_id
page_number
table_index
title
raw_table_json
normalized_table_json
extraction_method
confidence
created_at
```

### Bảng `financial_facts`

```text
id
document_id
company_id
statement_type
metric_name
metric_alias
period
value
currency
unit_scale
source_table_id
source_page
confidence
created_at
```

### Bảng `document_chunks`

```text
id
document_id
chunk_index
content
chunk_type
section_title
page_start
page_end
table_id
token_count
embedding
metadata
created_at
```

### Bảng `chat_sessions`

```text
id
title
scope
created_at
updated_at
```

### Bảng `chat_messages`

```text
id
session_id
role
content
citations
created_at
```

## Trạng thái xử lý tài liệu

```text
uploaded
queued
downloading
extracting_text
extracting_tables
ocr_processing
normalizing_financial_data
chunking
embedding
indexed
ready
failed
```

Dashboard nên lấy `status`, `progress`, `current_step`, `processed_chunks`, `total_chunks`, `extraction_quality` để hiển thị tiến độ và chất lượng xử lý.

## Pipeline upload và xử lý

1. User chọn file trên giao diện.
2. Frontend gọi API tạo signed upload params.
3. Frontend upload file lên Cloudinary hoặc object storage.
4. Frontend gọi API tạo document record với metadata user nhập: công ty, kỳ báo cáo, loại báo cáo.
5. API tạo job trong Redis Queue.
6. Worker tải file từ storage.
7. Worker nhận diện định dạng, kiểm tra checksum và dedupe.
8. Worker extract text theo định dạng file.
9. Worker extract bảng nếu file có bảng.
10. Worker chạy OCR nếu PDF/ảnh không có text đủ tốt.
11. Worker chuẩn hóa metadata tài chính: kỳ, tiền tệ, đơn vị, loại báo cáo.
12. Worker chunk theo cấu trúc báo cáo tài chính.
13. Worker tạo embedding từng chunk.
14. Worker lưu tables, facts, chunks và embeddings vào PostgreSQL/pgvector.
15. Worker update document thành `ready`.

## Pipeline seed dữ liệu ban đầu

1. Chuẩn bị manifest cho từng nguồn báo cáo.
2. Chạy seed job ở chế độ `dry_run` để kiểm tra URL, metadata và trùng lặp.
3. Tải file theo batch nhỏ, có rate limit và retry.
4. Lưu file gốc vào object storage.
5. Tạo document records với `source_type = public_seed`.
6. Đẩy ingestion jobs vào queue.
7. Ghi log kết quả từng file: thành công, lỗi tải, lỗi parse, cần OCR.
8. Tạo báo cáo chất lượng seed: số file ready, số file lỗi, số bảng extract được, số chunk, số công ty/kỳ.

## Chiến lược chunking cho báo cáo tài chính

Không nên cắt text theo token ngay từ đầu. Nên ưu tiên cấu trúc tài chính:

- Thông tin chung về doanh nghiệp.
- Bảng cân đối kế toán.
- Báo cáo kết quả hoạt động kinh doanh.
- Báo cáo lưu chuyển tiền tệ.
- Thuyết minh báo cáo tài chính.
- Ý kiến kiểm toán.
- Báo cáo ban lãnh đạo hoặc phần phân tích trong báo cáo thường niên.

Quy tắc MVP:

- Mỗi section chính là một nhóm chunk.
- Với bảng, tạo chunk dạng text mô tả bảng và giữ `raw_table_json` để truy xuất chính xác.
- Với thuyết minh dài, cắt theo tiêu đề thuyết minh rồi mới cắt theo token.
- Mỗi chunk cần giữ metadata: công ty, mã chứng khoán, kỳ báo cáo, loại báo cáo, trang, section, table id.
- Citation nên dựa vào metadata báo cáo/trang/bảng thay vì chỉ dựa vào số chunk.

## RAG và truy vấn số liệu

MVP nên kết hợp hai kiểu retrieval:

- Semantic retrieval trên `document_chunks` để trả lời câu hỏi diễn giải, rủi ro, thuyết minh, chính sách kế toán.
- Structured retrieval trên `financial_facts` để trả lời câu hỏi số liệu như doanh thu, lợi nhuận, tài sản, nợ vay, dòng tiền.

Ví dụ câu hỏi cần hỗ trợ:

- "Doanh thu năm 2023 của FPT là bao nhiêu?"
- "So sánh lợi nhuận sau thuế của HPG trong 4 quý gần nhất."
- "Dòng tiền từ hoạt động kinh doanh năm 2022 có âm không?"
- "Báo cáo kiểm toán có ý kiến ngoại trừ không?"
- "Rủi ro lớn nhất trong thuyết minh báo cáo tài chính là gì?"

## API MVP

```text
POST /documents/upload-signature
POST /documents
GET  /documents
GET  /documents/{id}
GET  /documents/{id}/status
DELETE /documents/{id}

GET  /companies
POST /companies

POST /seed-runs
GET  /seed-runs/{id}

POST /chat/sessions
GET  /chat/sessions
POST /chat/sessions/{id}/messages

GET  /financial-facts
GET  /search
```

Ban đầu dashboard có thể polling `GET /documents/{id}/status` mỗi 1-2 giây. Sau khi MVP ổn định có thể nâng cấp sang SSE hoặc WebSocket.

## UI MVP

### Upload page

- Dropzone upload file.
- Hiển thị định dạng được hỗ trợ.
- Form nhập metadata: công ty, mã chứng khoán, năm, quý, loại báo cáo, riêng lẻ/hợp nhất.
- Hiển thị lỗi nếu file quá lớn, sai định dạng hoặc trùng checksum.
- Sau upload thành công, chuyển về dashboard.

### Documents dashboard

- Danh sách tài liệu.
- Bộ lọc theo công ty, mã chứng khoán, năm, quý, loại báo cáo, trạng thái.
- Badge trạng thái.
- Progress bar.
- Bước đang xử lý hiện tại.
- Chất lượng extraction: text, table, OCR.
- Số chunk đã xử lý / tổng chunk.
- Nút retry nếu failed.
- Nút bắt đầu chat chỉ active khi document `ready`.

### Seed data dashboard

- Hiển thị số báo cáo có sẵn.
- Hiển thị số công ty, số năm, số quý, số báo cáo theo loại.
- Theo dõi seed run: tổng URL, đã tải, đã index, lỗi, cần OCR.
- Cho phép chạy lại các file lỗi sau khi pipeline parse được cải thiện.

### Chat page

- Khung hỏi đáp.
- Chọn phạm vi truy vấn: một báo cáo, một công ty, một ngành, một khoảng thời gian hoặc toàn bộ corpus.
- Câu trả lời có danh sách citations.
- Citation hiển thị công ty, mã chứng khoán, kỳ báo cáo, trang, section, bảng nếu có.
- Với câu hỏi số liệu, hiển thị giá trị, đơn vị, kỳ và nguồn.

## Kế hoạch triển khai một lượt

Không chia dự án thành các phase tách rời. Làm theo một vòng triển khai chung, trong đó web, API, worker, database, ingestion, seed data và chat được nối với nhau sớm để luôn có một luồng end-to-end chạy được. Mỗi mảng có thể làm song song, nhưng tiêu chí chính là sau mỗi lần merge lớn hệ thống vẫn upload hoặc seed được tài liệu, xử lý được tài liệu và hỏi đáp được trên dữ liệu đã index.

Các mảng công việc cần làm cùng lúc:

- Khởi tạo monorepo/app structure: Next.js web, FastAPI API, Python worker, Docker Compose cho PostgreSQL và Redis, `.env.example`, health check.
- Database và migration: tạo các bảng `companies`, `documents`, `document_pages`, `financial_tables`, `financial_facts`, `document_chunks`, `chat_sessions`, `chat_messages`; bật `pgvector`; thêm repository/service layer.
- Upload và lưu file gốc: cấu hình Cloudinary hoặc object storage, API signed upload, validate định dạng, tính checksum, dedupe, tạo document record và hiển thị trong dashboard.
- Worker ingestion: nhận job từ Redis, tải file từ storage, nhận diện định dạng, extract text, extract bảng, chạy OCR khi cần, cập nhật `status`, `progress`, `current_step`.
- Parser theo định dạng: xử lý `pdf`, `xlsx`, `xls`, `docx`, `doc`, `txt`, `html`, `csv`, `png`, `jpg`; với `doc` thì convert bằng LibreOffice headless trước khi parse.
- Financial normalization: chuẩn hóa công ty, mã chứng khoán, kỳ báo cáo, loại báo cáo, tiền tệ, đơn vị; parse các chỉ tiêu chính vào `financial_facts`.
- Financial-aware chunking: chunk theo section báo cáo tài chính, bảng, thuyết minh, trang và metadata thay vì chỉ cắt theo token.
- Embedding và retrieval: tạo embedding cho chunk, lưu vào pgvector, thêm semantic search và structured search trên `financial_facts`.
- RAG chat: tạo session, message API, prompt trả lời theo context, kết hợp semantic retrieval và structured retrieval, bắt buộc citation.
- Seed data: tạo `companies_seed.csv`, `public_demo.jsonl`, `initial_corpus.jsonl`, seed runner có `dry_run`, rate limit, retry, checksum, log chất lượng và ingestion report.
- UI dashboard: upload page, document list, status/progress, seed data dashboard, chat page, citations và lỗi xử lý.
- Verification: tests cho parser/chunker/retrieval, bộ câu hỏi benchmark cho BCTC, đo citation accuracy và factual accuracy, README hướng dẫn setup/upload/seed.

Luồng end-to-end bắt buộc phải chạy được:

1. User upload một báo cáo hoặc seed runner tải một báo cáo từ manifest.
2. File gốc được lưu vào object storage và có record trong `documents`.
3. Worker xử lý file, lưu text, bảng, facts, chunks và embeddings.
4. Dashboard hiển thị tiến độ và trạng thái `ready` hoặc `failed` có lý do.
5. User hỏi trên một báo cáo, một công ty hoặc toàn bộ corpus.
6. API trả lời dựa trên dữ liệu đã index và citation đến báo cáo/kỳ/trang/bảng/chunk.

Thứ tự ưu tiên trong cùng một vòng triển khai:

1. Làm skeleton end-to-end mỏng trước: upload/seed một file PDF text-based, extract text, chunk, embed, search, chat có citation.
2. Mở rộng parser cho Excel, CSV, DOCX, HTML, ảnh và PDF scan.
3. Thêm table extraction, OCR, financial facts và structured retrieval.
4. Mở rộng seed data từ 20-50 báo cáo demo lên 200-500 báo cáo.
5. Polish UI, benchmark chất lượng và hoàn thiện tài liệu setup.

Kết quả cần đạt: demo MVP hoàn chỉnh, có dữ liệu mẫu, xử lý được nhiều định dạng báo cáo tài chính, hỏi đáp có citation, có seed runner để lấy dữ liệu công khai có kiểm soát và có tiêu chí đánh giá chất lượng rõ ràng.

## Kiến trúc tùy chọn: Worker trên Databricks

Nên **không** chuyển toàn bộ hệ thống lên Databricks. Nên dùng **kiến trúc lai (hybrid)**:

| Thành phần | Chạy ở đâu | Lý do |
|------------|------------|--------|
| FastAPI, chat RAG, search | VM / Docker / cloud nhỏ | Latency thấp, gần Postgres + pgvector |
| PostgreSQL + pgvector | Docker / RDS / managed Postgres | RAG query hiện tại gắn pgvector |
| **Batch ingestion** (~200 BCTC, re-index định kỳ) | **Databricks Job** | Scale, retry, log, chạy nền không cần máy dev |
| Upload 1 file user vừa thêm | Worker nhẹ (RQ) **hoặc** trigger 1 Databricks job | Tùy độ trễ chấp nhận được |
| Embedding batch lớn | Databricks + **Gemini Embedding API** (hoặc model trên Model Serving) | Ollama local **không** chạy được trên cluster Databricks |
| Chat trả lời | Gemini (giữ như hiện tại) | Không đổi |

### Luồng đề xuất khi có Databricks

```text
Manifest (JSONL) / upload metadata
  -> Object storage (S3 / ADLS / Cloudinary)
  -> Databricks Workflow Job
        1. Đọc manifest / bảng documents status=queued
        2. Tải PDF, parse text/bảng (notebook Python hoặc UDF)
        3. Chunk + normalize metadata
        4. Embed (Gemini Embedding API — không dùng Ollama trên DBX)
        5. Ghi chunks + vectors vào Postgres (JDBC) hoặc Delta rồi sync sang pgvector
        6. Cập nhật documents.status = ready | failed
  -> FastAPI đọc pgvector, user hỏi đáp ngay
```

### Khi nào nên dùng Databricks

- Index lại **hàng trăm** báo cáo ban đầu hoặc cập nhật corpus theo quý.
- Cần lịch chạy (cron), giám sát job, retry từng file lỗi.
- Team đã có workspace Databricks, Unity Catalog, secret scope.

### Khi nào giữ worker local (hiện tại)

- Dev local, demo MVP, máy có Ollama + Docker.
- User upload 1 file và muốn xử lý trong vài phút.
- Chưa có budget / setup Databricks.

### Việc cần làm nếu chuyển batch sang Databricks

1. Đưa file PDF lên **Volumes** hoặc S3/ADLS (không đọc manifest từ laptop).
2. Notebook / Python wheel: tái sử dụng logic `parsers/`, `chunker/` từ `apps/worker` (đóng gói package chung).
3. Thay `embedder.py` (Ollama) bằng **Gemini Embedding** hoặc API embed cloud khi chạy trên cluster.
4. Job ghi kết quả qua **JDBC** vào Postgres (`document_chunks.embedding`) hoặc dùng Databricks Vector Search rồi nối API sau (đổi lớn hơn).
5. API: bỏ auto-seed trong `run_worker.py`; thay bằng `POST /ingestion-runs` trigger Databricks Job (REST Jobs API 2.1).
6. Secrets: `GEMINI_API_KEY`, JDBC URL Postgres trong Databricks Secret Scope — không hardcode.

### Khuyến nghị thực tế

- **Giai đoạn hiện tại:** giữ worker local + Ollama để hoàn thành MVP và hỏi đáp nhanh.
- **Bước tiếp theo:** tách job **ingestion_batch** lên Databricks; giữ worker RQ chỉ cho upload đơn lẻ (hoặc cũng trigger Databricks).
- **Không** bắt buộc Redis/RQ trên Databricks — dùng Databricks Workflows + bảng `documents` làm hàng đợi trạng thái.

## Biến môi trường cần có

File `.env` đặt tại **thư mục gốc repo** (cùng cấp `docker-compose.yml`). Copy từ `.env.example`.

```text
DATABASE_URL=
REDIS_URL=
EMBEDDING_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434
EMBEDDING_MODEL=nomic-embed-text
EMBEDDING_DIMENSIONS=768
LLM_PROVIDER=gemini
GEMINI_API_KEY=
LLM_MODEL=gemini-2.0-flash
OCR_PROVIDER=
SEED_DATA_RATE_LIMIT=
```

## Rủi ro và cách giảm thiểu

- Nguồn dữ liệu công khai có điều khoản sử dụng khác nhau: chỉ dùng nguồn được phép, lưu source URL và license note trong manifest.
- PDF báo cáo tài chính có layout phức tạp: lưu cả raw text/raw table để có thể parse lại khi cải thiện pipeline.
- PDF scan hoặc ảnh chất lượng thấp: thêm OCR và quality flag, không âm thầm coi dữ liệu OCR là chắc chắn.
- Bảng tài chính dễ sai đơn vị: bắt buộc lưu `currency`, `unit_scale`, `period` và citation đến bảng gốc.
- Câu hỏi số liệu cần độ chính xác cao: dùng `financial_facts` cho số liệu chính, không chỉ dựa vào chunk semantic.
- Vài trăm báo cáo xử lý chậm: dùng queue/worker, batch ingestion, retry và dashboard tiến độ.
- File lớn làm tốn storage và token: không commit file vào git, lưu object storage và chỉ embed chunk đã chuẩn hóa.
- Hallucination: prompt bắt buộc chỉ trả lời dựa trên context retrieved và structured facts.
- Tiếng Việt embedding kém: benchmark nhiều provider embedding với bộ câu hỏi mẫu.

## Tiêu chí hoàn thành MVP

- Upload được `pdf`, `xlsx`, `xls`, `docx`, `doc`, `txt`, `html`, `csv`, `png`, `jpg`.
- File gốc nằm trên Cloudinary hoặc object storage.
- Dashboard hiển thị đúng tiến độ xử lý và chất lượng extraction.
- Tài liệu chuyển sang `ready` khi indexing xong.
- Hỏi đáp được trên tài liệu user upload.
- Hỏi đáp được trên bộ dữ liệu có sẵn.
- Câu trả lời có citation đến báo cáo/kỳ/trang/bảng/chunk.
- Có manifest và seed runner cho tối thiểu 200 báo cáo tài chính.
- Có ít nhất 20 báo cáo demo nhỏ để chạy nhanh local.
- Có hướng dẫn chạy local, upload file và seed data trong `README.md`.
