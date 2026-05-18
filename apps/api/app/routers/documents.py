import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.document import Document

router = APIRouter()


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
