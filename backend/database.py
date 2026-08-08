import json
import sqlite3
import os
from config import settings

def get_db():
    conn = sqlite3.connect(settings.DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db()
    cursor = conn.cursor()
    
    # Cache table for AI Analysis keyed by PR ID + Head Commit SHA
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS ai_reviews (
        pr_number INTEGER PRIMARY KEY,
        head_sha TEXT NOT NULL,
        ai_data TEXT NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)
    
    conn.commit()
    conn.close()

def get_cached_ai_review(pr_number: int, head_sha: str):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT ai_data FROM ai_reviews WHERE pr_number = ? AND head_sha = ?", (pr_number, head_sha))
    row = cursor.fetchone()
    conn.close()
    if row:
        return json.loads(row["ai_data"])
    return None

def save_ai_review(pr_number: int, head_sha: str, ai_data: dict):
    conn = get_db()
    cursor = conn.cursor()
    data_str = json.dumps(ai_data)
    cursor.execute("""
    INSERT OR REPLACE INTO ai_reviews (pr_number, head_sha, ai_data, updated_at)
    VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    """, (pr_number, head_sha, data_str))
    conn.commit()
    conn.close()
