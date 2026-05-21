import hashlib
import uuid
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.document import Document

router = APIRouter()

# Local upload directory — shared with worker via filesystem
_REPO_ROOT = Path(__file__).resolve().parents[4]
UPLOAD_DIR = _REPO_ROOT / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)

_ALLOWED_EXTENSIONS = {".pdf", ".xlsx", ".xls", ".csv", ".docx", ".txt", ".html", ".htm"}
_MAX_FILE_SIZE = 100 * 1024 * 1024  # 100 MB


class DocumentCreate(BaseModel):
    company_id: uuid.UUID | None = None
    title: str | None = None
    original_filename: str | None = None
    mime_type: str | None = None
    source_type: str = "user_upload"
    source_url: str | None = None
    storage_url: str | None = None
    storage_public_id: str | None = None
    file_sha256: str | None = None
    report_type: str | None = None
    report_period: str | None = None
    fiscal_year: int | None = None
    fiscal_quarter: int | None = None
    language: str = "vi"
    currency: str = "VND"
    unit_scale: str | None = None


class DocumentResponse(BaseModel):
    id: uuid.UUID
    company_id: uuid.UUID | None
    title: str | None
    original_filename: str | None
    mime_type: str | None
    source_type: str | None
    storage_url: str | None
    file_sha256: str | None
    report_type: str | None
    report_period: str | None
    fiscal_year: int | None
    fiscal_quarter: int | None
    status: str
    progress: int
    current_step: str | None
    error_message: str | None
    total_chunks: int
    processed_chunks: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class DocumentStatus(BaseModel):
    id: uuid.UUID
    status: str
    progress: int
    current_step: str | None
    error_message: str | None
    total_chunks: int
    processed_chunks: int

    class Config:
        from_attributes = True


@router.get("", response_model=list[DocumentResponse])
async def list_documents(
    company_id: uuid.UUID | None = None,
    status: str | None = None,
    fiscal_year: int | None = None,
    limit: int = Query(default=50, le=200),
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
):
    query = select(Document).order_by(Document.created_at.desc())
    if company_id:
        query = query.where(Document.company_id == company_id)
    if status:
        query = query.where(Document.status == status)
    if fiscal_year:
        query = query.where(Document.fiscal_year == fiscal_year)
    query = query.limit(limit).offset(offset)
    result = await db.execute(query)
    return result.scalars().all()


@router.post("", response_model=DocumentResponse, status_code=201)
async def create_document(body: DocumentCreate, db: AsyncSession = Depends(get_db)):
    if body.file_sha256:
        existing = await db.execute(
            select(Document).where(Document.file_sha256 == body.file_sha256)
        )
        if existing.scalar_one_or_none():
            raise HTTPException(status_code=409, detail="Duplicate file (same SHA-256)")
    doc = Document(**body.model_dump(), status="uploaded", progress=0)
    db.add(doc)
    await db.commit()
    await db.refresh(doc)

    from app.services.queue import enqueue_ingestion
    enqueue_ingestion(str(doc.id))

    return doc


@router.post("/upload", response_model=DocumentResponse, status_code=201)
async def upload_document(
    file: UploadFile = File(...),
    title: str = Form(""),
    ticker: str = Form(""),
    report_type: str = Form(""),
    fiscal_year: str = Form(""),
    fiscal_quarter: str = Form(""),
    db: AsyncSession = Depends(get_db),
):
    """Upload a PDF/document file directly instead of providing a URL."""
    # Validate file
    if not file.filename:
        raise HTTPException(status_code=400, detail="Thiếu tên file")

    ext = Path(file.filename).suffix.lower()
    if ext not in _ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Loại file không hỗ trợ: {ext}. Chấp nhận: {', '.join(sorted(_ALLOWED_EXTENSIONS))}",
        )

    # Read file content
    content = await file.read()
    if len(content) > _MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="File quá lớn (tối đa 100MB)")
    if len(content) == 0:
        raise HTTPException(status_code=400, detail="File rỗng")

    # Compute SHA-256 for dedup
    sha256 = hashlib.sha256(content).hexdigest()

    # Check for duplicate
    existing = await db.execute(
        select(Document).where(Document.file_sha256 == sha256)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="File trùng lặp (SHA-256 đã tồn tại)")

    # Save file to uploads directory
    doc_id = uuid.uuid4()
    safe_filename = f"{doc_id}{ext}"
    file_path = UPLOAD_DIR / safe_filename
    file_path.write_bytes(content)

    # Resolve company
    company_id = None
    if ticker.strip():
        from app.models.company import Company

        result = await db.execute(
            select(Company).where(Company.ticker == ticker.strip().upper())
        )
        co = result.scalar_one_or_none()
        if co:
            company_id = co.id

    # Create document record
    doc = Document(
        id=doc_id,
        company_id=company_id,
        title=title.strip() or None,
        original_filename=file.filename,
        mime_type=file.content_type,
        source_type="file_upload",
        storage_url=str(file_path.resolve()),  # Local file path
        file_sha256=sha256,
        report_type=report_type.strip() or None,
        fiscal_year=int(fiscal_year) if fiscal_year.strip() else None,
        fiscal_quarter=int(fiscal_quarter) if fiscal_quarter.strip() else None,
        status="uploaded",
        progress=0,
    )
    db.add(doc)
    await db.commit()
    await db.refresh(doc)

    from app.services.queue import enqueue_ingestion
    enqueue_ingestion(str(doc.id))

    return doc


@router.get("/{document_id}", response_model=DocumentResponse)
async def get_document(document_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    doc = await db.get(Document, document_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    return doc


@router.get("/{document_id}/status", response_model=DocumentStatus)
async def get_document_status(document_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    doc = await db.get(Document, document_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    return doc


@router.delete("/{document_id}", status_code=204)
async def delete_document(document_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    doc = await db.get(Document, document_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    await db.delete(doc)
    await db.commit()

