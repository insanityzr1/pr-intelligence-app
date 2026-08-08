import json
import sqlite3
import os
from config import settings

def get_db():
    conn = sqlite3.connect(settings.DB_PATH)
    conn.row_factory = sqlite3.Row
    # Declared foreign keys (pr_group_items -> pr_groups ON DELETE CASCADE) are
    # inert in SQLite unless this pragma is set, per-connection.
    conn.execute("PRAGMA foreign_keys = ON")
    return conn

def _migrate_ai_reviews_key(cursor):
    """
    Rebuild a pre-existing `ai_reviews` table that still uses the old
    pr_number-only primary key. Existing rows are attributed to DEFAULT_REPO,
    which is where they must have come from on a single-repo install.

    No-op once the table already carries a repo_name column.
    """
    cols = [r["name"] for r in cursor.execute("PRAGMA table_info(ai_reviews)").fetchall()]
    if not cols or "repo_name" in cols:
        return

    cursor.execute("ALTER TABLE ai_reviews RENAME TO ai_reviews_legacy")
    cursor.execute("""
    CREATE TABLE ai_reviews (
        repo_name TEXT NOT NULL,
        pr_number INTEGER NOT NULL,
        head_sha TEXT NOT NULL,
        ai_data TEXT NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (repo_name, pr_number)
    )
    """)
    cursor.execute("""
    INSERT INTO ai_reviews (repo_name, pr_number, head_sha, ai_data, updated_at)
    SELECT ?, pr_number, head_sha, ai_data, updated_at FROM ai_reviews_legacy
    """, (settings.DEFAULT_REPO,))
    cursor.execute("DROP TABLE ai_reviews_legacy")


def init_db():
    conn = get_db()
    cursor = conn.cursor()
    
    # 1. AI Review Cache
    # Keyed by (repo_name, pr_number): a PR number alone is not unique once more
    # than one repository is configured, and the old pr_number-only primary key
    # meant PR #5 in one repo silently overwrote PR #5 in another.
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS ai_reviews (
        repo_name TEXT NOT NULL,
        pr_number INTEGER NOT NULL,
        head_sha TEXT NOT NULL,
        ai_data TEXT NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (repo_name, pr_number)
    )
    """)
    _migrate_ai_reviews_key(cursor)
    
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
    
    # 4. Cached PR Summaries
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS prs (
        cache_key TEXT PRIMARY KEY,
        pr_number INTEGER NOT NULL,
        repo_name TEXT NOT NULL,
        pr_data TEXT NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)

    # 5. Custom PR Tags
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS pr_tags (
        pr_number INTEGER NOT NULL,
        repo_name TEXT NOT NULL,
        tag TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (pr_number, repo_name, tag)
    )
    """)

    # 6. Custom PR Staging Groups & Buckets
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS pr_groups (
        group_id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        description TEXT DEFAULT '',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)
    try:
        cursor.execute("ALTER TABLE pr_groups ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP")
    except Exception:
        pass

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS pr_group_items (
        group_id INTEGER NOT NULL,
        pr_number INTEGER NOT NULL,
        repo_name TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (group_id, pr_number, repo_name),
        FOREIGN KEY (group_id) REFERENCES pr_groups(group_id) ON DELETE CASCADE
    )
    """)

    # 7. Saved Changelogs & Release Notes
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS changelogs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        pr_numbers TEXT NOT NULL,
        branches TEXT NOT NULL,
        markdown TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)
    
    # Default repository insertion if empty
    cursor.execute("SELECT COUNT(*) as cnt FROM repositories")
    if cursor.fetchone()["cnt"] == 0:
        cursor.execute("INSERT INTO repositories (repo_name, is_active) VALUES ('rpnunez/wp-ai-scheduler', 1)")
        
    conn.commit()
    conn.close()

# AI Reviews
def get_cached_ai_review(pr_number: int, head_sha: str, repo_name: str = None):
    target_repo = repo_name or settings.DEFAULT_REPO
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT ai_data FROM ai_reviews WHERE repo_name = ? AND pr_number = ? AND head_sha = ?",
        (target_repo, pr_number, head_sha),
    )
    row = cursor.fetchone()
    conn.close()
    if row:
        try:
            return json.loads(row["ai_data"])
        except Exception:
            return None
    return None

def save_ai_review(pr_number: int, head_sha: str, ai_data: dict, repo_name: str = None):
    target_repo = repo_name or settings.DEFAULT_REPO
    conn = get_db()
    cursor = conn.cursor()
    ai_json = json.dumps(ai_data)
    cursor.execute("""
    INSERT INTO ai_reviews (repo_name, pr_number, head_sha, ai_data, updated_at)
    VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(repo_name, pr_number) DO UPDATE SET
        head_sha=excluded.head_sha,
        ai_data=excluded.ai_data,
        updated_at=CURRENT_TIMESTAMP
    """, (target_repo, pr_number, head_sha, ai_json))
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

# Persistent PR Summaries Cache
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

# PR Custom Tags Helpers
def get_pr_tags(pr_number: int, repo_name: str):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT tag FROM pr_tags WHERE pr_number = ? AND repo_name = ?", (pr_number, repo_name))
    rows = cursor.fetchall()
    conn.close()
    return [r["tag"] for r in rows]

def get_all_pr_tags_map():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT pr_number, repo_name, tag FROM pr_tags")
    rows = cursor.fetchall()
    conn.close()
    res = {}
    for r in rows:
        key = f"{r['repo_name']}#{r['pr_number']}"
        if key not in res:
            res[key] = []
        res[key].append(r["tag"])
    return res

def add_pr_tag(pr_number: int, repo_name: str, tag: str):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
    INSERT INTO pr_tags (pr_number, repo_name, tag)
    VALUES (?, ?, ?)
    ON CONFLICT(pr_number, repo_name, tag) DO NOTHING
    """, (pr_number, repo_name, tag.strip()))
    conn.commit()
    conn.close()
    return get_pr_tags(pr_number, repo_name)

def remove_pr_tag(pr_number: int, repo_name: str, tag: str):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM pr_tags WHERE pr_number = ? AND repo_name = ? AND tag = ?", (pr_number, repo_name, tag))
    conn.commit()
    conn.close()
    return get_pr_tags(pr_number, repo_name)

# PR Staging Groups Helpers
def get_groups():
    conn = get_db()
    cursor = conn.cursor()
    try:
        cursor.execute("""
        SELECT g.group_id, g.name, g.description, g.created_at,
               COALESCE(g.updated_at, g.created_at) as updated_at,
               COUNT(i.pr_number) as item_count
        FROM pr_groups g
        LEFT JOIN pr_group_items i ON g.group_id = i.group_id
        GROUP BY g.group_id
        ORDER BY updated_at DESC, g.group_id DESC
        """)
    except Exception:
        cursor.execute("""
        SELECT g.group_id, g.name, g.description, g.created_at,
               g.created_at as updated_at,
               COUNT(i.pr_number) as item_count
        FROM pr_groups g
        LEFT JOIN pr_group_items i ON g.group_id = i.group_id
        GROUP BY g.group_id
        ORDER BY g.created_at DESC, g.group_id DESC
        """)
    rows = cursor.fetchall()
    conn.close()
    return [dict(r) for r in rows]

def create_group(name: str, description: str = ""):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
    INSERT INTO pr_groups (name, description) VALUES (?, ?)
    """, (name.strip(), description.strip()))
    group_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return {"group_id": group_id, "name": name, "description": description}

def update_group(group_id: int, name: str, description: str = ""):
    conn = get_db()
    cursor = conn.cursor()
    try:
        cursor.execute("""
        UPDATE pr_groups
        SET name = ?, description = ?, updated_at = CURRENT_TIMESTAMP
        WHERE group_id = ?
        """, (name.strip(), description.strip(), group_id))
    except Exception:
        cursor.execute("""
        UPDATE pr_groups
        SET name = ?, description = ?
        WHERE group_id = ?
        """, (name.strip(), description.strip(), group_id))
    conn.commit()
    conn.close()
    return {"group_id": group_id, "name": name, "description": description}

def delete_group(group_id: int):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM pr_groups WHERE group_id = ?", (group_id,))
    conn.commit()
    conn.close()
    return True

def get_group_items(group_id: int):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
    SELECT pr_number, repo_name, created_at
    FROM pr_group_items
    WHERE group_id = ?
    """, (group_id,))
    rows = cursor.fetchall()
    conn.close()
    return [dict(r) for r in rows]

def add_prs_to_group(group_id: int, pr_numbers: list, repo_name: str):
    conn = get_db()
    cursor = conn.cursor()
    for num in pr_numbers:
        cursor.execute("""
        INSERT INTO pr_group_items (group_id, pr_number, repo_name)
        VALUES (?, ?, ?)
        ON CONFLICT(group_id, pr_number, repo_name) DO NOTHING
        """, (group_id, num, repo_name))
    try:
        cursor.execute("UPDATE pr_groups SET updated_at = CURRENT_TIMESTAMP WHERE group_id = ?", (group_id,))
    except Exception:
        pass
    conn.commit()
    conn.close()
    return get_group_items(group_id)

def remove_pr_from_group(group_id: int, pr_number: int, repo_name: str):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM pr_group_items WHERE group_id = ? AND pr_number = ? AND repo_name = ?", (group_id, pr_number, repo_name))
    try:
        cursor.execute("UPDATE pr_groups SET updated_at = CURRENT_TIMESTAMP WHERE group_id = ?", (group_id,))
    except Exception:
        pass
    conn.commit()
    conn.close()
    return get_group_items(group_id)

# Saved Changelogs Helpers
def save_changelog(title: str, pr_numbers: list, branches: list, markdown: str):
    conn = get_db()
    cursor = conn.cursor()
    pr_json = json.dumps(pr_numbers)
    branch_json = json.dumps(branches)
    cursor.execute("""
    INSERT INTO changelogs (title, pr_numbers, branches, markdown)
    VALUES (?, ?, ?, ?)
    """, (title, pr_json, branch_json, markdown))
    changelog_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return {
        "id": changelog_id,
        "title": title,
        "pr_numbers": pr_numbers,
        "branches": branches,
        "markdown": markdown
    }

def get_changelogs():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
    SELECT id, title, pr_numbers, branches, markdown, created_at
    FROM changelogs
    ORDER BY id DESC
    """)
    rows = cursor.fetchall()
    conn.close()
    results = []
    for r in rows:
        item = dict(r)
        try:
            item["pr_numbers"] = json.loads(r["pr_numbers"])
        except Exception:
            item["pr_numbers"] = []
        try:
            item["branches"] = json.loads(r["branches"])
        except Exception:
            item["branches"] = []
        results.append(item)
    return results

def delete_changelog(changelog_id: int):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM changelogs WHERE id = ?", (changelog_id,))
    conn.commit()
    conn.close()
    return True
