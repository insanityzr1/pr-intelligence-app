import os
import sys
import tempfile
import pytest
from fastapi.testclient import TestClient

# Ensure backend directory is in sys.path
backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from config import settings
from main import app
import database

@pytest.fixture(scope="function", autouse=True)
def test_db():
    """Create a temporary isolated SQLite database file for each test function."""
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as tmp:
        tmp_db_path = tmp.name

    old_db_path = settings.DB_PATH
    settings.DB_PATH = tmp_db_path
    database.init_db()

    yield tmp_db_path

    # Restore DB path and cleanup
    settings.DB_PATH = old_db_path
    if os.path.exists(tmp_db_path):
        try:
            os.remove(tmp_db_path)
        except Exception:
            pass

@pytest.fixture
def client(test_db):
    """FastAPI TestClient fixture."""
    return TestClient(app)
