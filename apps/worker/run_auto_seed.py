"""Run auto-seed in a separate process (safe before RQ fork on macOS)."""
import logging

from worker.auto_seed import auto_seed

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(name)s] %(levelname)s: %(message)s")

if __name__ == "__main__":
    auto_seed()
