# Financial Report Seed Manifests

Generated on 2026-05-19 from publicly accessible Vietstock Finance document endpoints.

Files:

- `companies_seed.csv`: source company list used for discovery.
- `public_demo.jsonl`: first 20 PDF reports for quick local demos.
- `initial_corpus.jsonl`: 200 PDF report metadata records for ingestion.

Important notes:

- The manifests store metadata and source URLs only; report files are not committed to git.
- `source_url` points to the public document file observed during discovery.
- Verify each source website's terms before redistributing files or using the corpus in production.
- A seed runner should download with rate limits, compute SHA-256, upload to object storage, and then enqueue ingestion jobs.
