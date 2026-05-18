from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session
from sqlalchemy.pool import NullPool

from worker.config import settings

# NullPool: no pooled connections (safer if anything forks after touching the DB)
engine = create_engine(
    settings.database_url_sync,
    echo=False,
    poolclass=NullPool,
)
SessionLocal = sessionmaker(bind=engine)


def get_db() -> Session:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
