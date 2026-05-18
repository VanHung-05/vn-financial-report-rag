import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.company import Company

router = APIRouter()


class CompanyCreate(BaseModel):
    ticker: str
    name: str
    exchange: str | None = None
    industry: str | None = None


class CompanyResponse(BaseModel):
    id: uuid.UUID
    ticker: str
    name: str
    exchange: str | None
    industry: str | None

    class Config:
        from_attributes = True


@router.get("", response_model=list[CompanyResponse])
async def list_companies(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Company).order_by(Company.ticker))
    return result.scalars().all()


@router.post("", response_model=CompanyResponse, status_code=201)
async def create_company(body: CompanyCreate, db: AsyncSession = Depends(get_db)):
    existing = await db.execute(select(Company).where(Company.ticker == body.ticker))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail=f"Company {body.ticker} already exists")
    company = Company(**body.model_dump())
    db.add(company)
    await db.commit()
    await db.refresh(company)
    return company
