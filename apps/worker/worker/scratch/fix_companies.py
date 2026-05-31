import csv
import logging
import uuid
from pathlib import Path
from sqlalchemy import text as sa_text

# Adjust paths to match repo root
from worker.config import settings
from worker.database import SessionLocal

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("fix_companies")

REPO_ROOT = Path(__file__).resolve().parents[4]
CSV_PATH = REPO_ROOT / "samples" / "manifests" / "companies_seed.csv"

def load_seed_companies() -> dict:
    """Load companies from companies_seed.csv as ticker -> {name, exchange}"""
    seeds = {}
    if not CSV_PATH.exists():
        logger.warning("companies_seed.csv not found at %s", CSV_PATH)
        return seeds
    
    with open(CSV_PATH, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            ticker = row.get("ticker", "").strip().upper()
            if ticker:
                seeds[ticker] = {
                    "name": row.get("company_name", ticker).strip(),
                    "exchange": row.get("exchange", "HOSE").strip()
                }
    return seeds

def main():
    db = SessionLocal()
    seeds = load_seed_companies()
    
    try:
        # Fetch documents
        docs = db.execute(
            sa_text("SELECT id, original_filename, company_id FROM documents")
        ).mappings().all()
        
        logger.info("Found %d total documents in the database", len(docs))
        
        for doc in docs:
            doc_id = str(doc["id"])
            filename = doc["original_filename"] or ""
            current_company_id = doc["company_id"]
            
            # Infer ticker from filename (e.g., FPT_Baocaotaichinh... -> FPT)
            if "_" not in filename:
                logger.warning("Filename '%s' doesn't follow expected prefix pattern", filename)
                continue
                
            ticker = filename.split("_")[0].strip().upper()
            if not ticker or len(ticker) > 5:
                logger.warning("Inferred ticker '%s' from filename '%s' is invalid", ticker, filename)
                continue
            
            logger.info("Document %s -> Inferred ticker: %s", filename, ticker)
            
            # Check if company exists in DB
            company_row = db.execute(
                sa_text("SELECT id FROM companies WHERE ticker = :t"),
                {"t": ticker}
            ).first()
            
            if company_row:
                company_id = company_row[0]
                logger.info("Company %s already exists in database with ID: %s", ticker, company_id)
                # Update existing company name/exchange if in seeds
                if ticker in seeds:
                    seed = seeds[ticker]
                    db.execute(
                        sa_text("UPDATE companies SET name = :name, exchange = :exchange WHERE id = :id"),
                        {"name": seed["name"], "exchange": seed["exchange"], "id": company_id}
                    )
                    db.commit()
                    logger.info("Updated existing company %s name -> '%s', exchange -> '%s'", ticker, seed["name"], seed["exchange"])
            else:
                # Create company using seed data if available
                seed = seeds.get(ticker, {"name": f"CTCP {ticker}", "exchange": "HOSE"})
                company_id = str(uuid.uuid4())
                
                db.execute(
                    sa_text(
                        "INSERT INTO companies (id, ticker, name, exchange, created_at, updated_at) "
                        "VALUES (:id, :ticker, :name, :exchange, now(), now())"
                    ),
                    {
                        "id": company_id,
                        "ticker": ticker,
                        "name": seed["name"],
                        "exchange": seed["exchange"]
                    }
                )
                db.commit()
                logger.info("Created new company %s: %s (ID: %s)", ticker, seed["name"], company_id)
            
            # Update document company link if it's currently NULL or different
            if str(current_company_id) != company_id:
                db.execute(
                    sa_text("UPDATE documents SET company_id = :cid WHERE id = :did"),
                    {"cid": company_id, "did": doc_id}
                )
                db.commit()
                logger.info("Updated document %s company_id -> %s", filename, company_id)
                
        logger.info("Company fixing completed successfully.")
        
    except Exception as e:
        logger.exception("Error occurred while fixing companies")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    main()
