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
    
    # 1. AI Review Cache
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS ai_reviews (
        pr_number INTEGER PRIMARY KEY,
        head_sha TEXT NOT NULL,
        ai_data TEXT NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)
    
    # 2. Configured Repositories Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS repositories (
        repo_name TEXT PRIMARY KEY,
        is_active INTEGER DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)
    
    # 3. Persistent PR Chat Threads
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS pr_chats (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        pr_number INTEGER NOT NULL,
        repo_name TEXT NOT NULL,
        role TEXT NOT NULL,
        message TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)
    
    # 4. Cached PR Summaries (Persists across cold starts / restarts)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS prs (
        cache_key TEXT PRIMARY KEY,
        pr_number INTEGER NOT NULL,
        repo_name TEXT NOT NULL,
        pr_data TEXT NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)
    
    # Default repository insertion if empty
    cursor.execute("SELECT COUNT(*) as cnt FROM repositories")
    if cursor.fetchone()["cnt"] == 0:
        cursor.execute("INSERT INTO repositories (repo_name, is_active) VALUES ('rpnunez/wp-ai-scheduler', 1)")
        
    conn.commit()
    conn.close()

# AI Reviews
def get_cached_ai_review(pr_number: int, head_sha: str):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT ai_data FROM ai_reviews WHERE pr_number = ? AND head_sha = ?", (pr_number, head_sha))
    row = cursor.fetchone()
    conn.close()
    if row:
        try:
            return json.loads(row["ai_data"])
        except Exception:
            return None
    return None

def save_ai_review(pr_number: int, head_sha: str, ai_data: dict):
    conn = get_db()
    cursor = conn.cursor()
    ai_json = json.dumps(ai_data)
    cursor.execute("""
    INSERT INTO ai_reviews (pr_number, head_sha, ai_data, updated_at)
    VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(pr_number) DO UPDATE SET
        head_sha=excluded.head_sha,
        ai_data=excluded.ai_data,
        updated_at=CURRENT_TIMESTAMP
    """, (pr_number, head_sha, ai_json))
    conn.commit()
    conn.close()

# Repositories
def get_repositories():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT repo_name, is_active, created_at FROM repositories ORDER BY created_at ASC")
    rows = cursor.fetchall()
    conn.close()
    return [dict(r) for r in rows]

def add_repository(repo_name: str):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
    INSERT INTO repositories (repo_name, is_active) VALUES (?, 1)
    ON CONFLICT(repo_name) DO UPDATE SET is_active=1
    """, (repo_name,))
    conn.commit()
    conn.close()
    return get_repositories()

def delete_repository(repo_name: str):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM repositories WHERE repo_name = ?", (repo_name,))
    conn.commit()
    conn.close()
    return get_repositories()

# PR Chats
def get_pr_chat_history(pr_number: int, repo_name: str):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
    SELECT role, message, created_at FROM pr_chats
    WHERE pr_number = ? AND repo_name = ?
    ORDER BY id ASC
    """, (pr_number, repo_name))
    rows = cursor.fetchall()
    conn.close()
    return [dict(r) for r in rows]

def add_pr_chat_message(pr_number: int, repo_name: str, role: str, message: str):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
    INSERT INTO pr_chats (pr_number, repo_name, role, message)
    VALUES (?, ?, ?, ?)
    """, (pr_number, repo_name, role, message))
    conn.commit()
    conn.close()

# Persistent PR Summaries Cache across App Reloads
def save_prs(prs_list: list, repo_name: str):
    conn = get_db()
    cursor = conn.cursor()
    for pr in prs_list:
        num = pr.get("number")
        if not num:
            continue
        key = f"{repo_name}#{num}"
        pr_json = json.dumps(pr)
        cursor.execute("""
        INSERT INTO prs (cache_key, pr_number, repo_name, pr_data, updated_at)
        VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(cache_key) DO UPDATE SET
            pr_data=excluded.pr_data,
            updated_at=CURRENT_TIMESTAMP
        """, (key, num, repo_name, pr_json))
    conn.commit()
    conn.close()

def get_cached_prs(repo_name: str = None) -> list:
    conn = get_db()
    cursor = conn.cursor()
    if repo_name:
        cursor.execute("SELECT pr_data FROM prs WHERE repo_name = ? ORDER BY pr_number DESC", (repo_name,))
    else:
        cursor.execute("SELECT pr_data FROM prs ORDER BY pr_number DESC")
    rows = cursor.fetchall()
    conn.close()
    
    results = []
    for r in rows:
        try:
            results.append(json.loads(r["pr_data"]))
        except Exception:
            pass
    return results
