from datetime import datetime, timezone
import json
import re
import subprocess
import sys

def format_relative_time(iso_str):
    if not iso_str:
        return ""
    try:
        dt = datetime.fromisoformat(iso_str.replace("Z", "+00:00"))
        now = datetime.now(timezone.utc)
        diff = now - dt
        seconds = int(diff.total_seconds())

        if seconds < 0:
            return "Just now"
        
        minutes = seconds // 60
        hours = minutes // 60
        days = hours // 24

        if seconds < 60:
            return "Just now"
        elif minutes < 60:
            return f"{minutes} minute{'s' if minutes != 1 else ''} ago"
        elif hours < 24:
            rem_min = minutes % 60
            if rem_min > 0:
                return f"{hours} hour{'s' if hours != 1 else ''} and {rem_min} minute{'s' if rem_min != 1 else ''} ago"
            else:
                return f"{hours} hour{'s' if hours != 1 else ''} ago"
        elif days == 1:
            return "Yesterday"
        elif days < 7:
            return f"{days} days ago"
        else:
            return dt.strftime("%b %d, %Y")
    except Exception:
        return iso_str[:10]

def format_created_date(iso_str):
    if not iso_str:
        return ""
    try:
        dt = datetime.fromisoformat(iso_str.replace("Z", "+00:00"))
        return dt.strftime("%b %d, %Y")
    except Exception:
        return iso_str[:10]

def clean_text(text):
    if not text:
        return ""
    text = text.replace('\r\n', ' ').replace('\n', ' ')
    text = re.sub(r'\s+', ' ', text).strip()
    return text

def extract_summary(body, title):
    if not body or len(body.strip()) < 10:
        return title
    
    lines = body.splitlines()
    bullets = []
    in_summary = False
    
    for line in lines:
        l = line.strip()
        if re.search(r'#(?:#)?\s*(?:Summary|Motivation|Overview|Description|What changed)', l, re.IGNORECASE):
            in_summary = True
            continue
        if in_summary and l.startswith('#'):
            in_summary = False
            
        if l.startswith('- ') or l.startswith('* ') or l.startswith('1. '):
            clean_b = re.sub(r'^[-*1-9.]+\s*', '', l)
            clean_b = re.sub(r'\*\*([^*]+)\*\*', r'\1', clean_b)
            if len(clean_b) > 10 and not clean_b.startswith("Ran ") and not clean_b.startswith("Verified"):
                bullets.append(clean_b)
                if len(" ".join(bullets)) > 160:
                    break
        elif in_summary and len(l) > 15 and not l.startswith('<') and not l.startswith('---'):
            bullets.append(l)
            if len(" ".join(bullets)) > 160:
                break
                
    res = " ".join(bullets).strip()
    if not res or len(res) < 15:
        paragraphs = [p.strip() for p in body.split('\n\n') if p.strip() and not p.strip().startswith('#') and not p.strip().startswith('---')]
        if paragraphs:
            res = paragraphs[0]
            
    res = clean_text(res)
    if not res or len(res) < 10:
        res = title
    if len(res) > 200:
        res = res[:197] + "..."
    return res

class GitHubService:
    @staticmethod
    def fetch_prs(count: int = 40, state: str = "open", orderby: str = "updated-desc", cwd: str = None):
        sort_mapping = {
            "updated-desc": "sort:updated-desc",
            "updated-asc": "sort:updated-asc",
            "created-desc": "sort:created-desc",
            "created-asc": "sort:created-asc",
            "number-desc": "sort:created-desc",
            "number-asc": "sort:created-asc"
        }

        sort_query = sort_mapping.get(orderby, "sort:updated-desc")
        search_query = f"is:{state} {sort_query}" if state != "all" else sort_query

        cmd = [
            "gh", "pr", "list",
            "--limit", str(count),
            "--search", search_query,
            "--json", "number,title,isDraft,updatedAt,createdAt,url,labels,additions,deletions,changedFiles,mergeable,body,author,headRefName,baseRefName,headRefOid"
        ]

        result = subprocess.run(cmd, capture_output=True, text=True, check=True, encoding="utf-8", cwd=cwd)
        prs = json.loads(result.stdout)

        processed = []
        for pr in prs:
            num = pr.get('number')
            title = clean_text(pr.get('title'))
            is_draft = pr.get('isDraft', False)
            status = "Draft" if is_draft else "Open"
            url = pr.get('url', '')
            additions = pr.get('additions', 0)
            deletions = pr.get('deletions', 0)
            changed_files = pr.get('changedFiles', 0)
            mergeable = pr.get('mergeable', 'UNKNOWN')
            labels = [l.get('name', '') for l in pr.get('labels', [])]
            body = pr.get('body', '') or ''
            author = pr.get('author', {}).get('login', 'unknown')
            updated_at = pr.get('updatedAt', '')
            created_at = pr.get('createdAt', '')
            head_sha = pr.get('headRefOid', '')
            
            summary = extract_summary(body, title)
            updated_rel = format_relative_time(updated_at)
            created_fmt = format_created_date(created_at)

            title_lower = title.lower()
            labels_lower = [l.lower() for l in labels]
            
            # Type classification
            if is_draft and ("recipe" in title_lower or "proposal" in title_lower or "catalog" in title_lower):
                pr_type = "Draft Feature"
            elif "new-feature" in labels_lower or title_lower.startswith("feat:") or "add " in title_lower or "implement" in title_lower:
                pr_type = "New Feature"
            elif "refactor" in title_lower or "rewrite" in title_lower or "decouple" in title_lower or "clean up" in title_lower:
                pr_type = "Refactor"
            elif "qa" in title_lower or "test" in title_lower or "tests" in labels_lower:
                pr_type = "Testing & QA"
            elif "build" in title_lower or "infra" in title_lower or "tooling" in title_lower or "script" in title_lower or "skills" in title_lower:
                pr_type = "Infrastructure & Tooling"
            else:
                pr_type = "Enhancement"

            # Subtype classification
            if "fix" in title_lower or "bug" in labels_lower or "timezone" in title_lower or "n+1" in title_lower:
                subtype = "Bug Fix"
            elif "palette" in title_lower or "accessibility" in title_lower or "a11y" in title_lower or "ui/ux" in labels_lower or "adminbar" in title_lower or "ux" in title_lower:
                subtype = "UI / UX & Accessibility"
            elif "cache" in title_lower or "query" in title_lower or "queries" in title_lower or "db" in title_lower or "performance" in labels_lower or "indexes" in title_lower:
                subtype = "Performance & Database"
            elif "ai provider" in title_lower or "capability" in title_lower or "ability" in title_lower or "prompt" in title_lower or "generator" in title_lower:
                subtype = "AI Engine & Architecture"
            elif "notification" in title_lower or "bridge" in title_lower or "integration" in title_lower or "crud" in title_lower or "quality gate" in title_lower or "affiliate" in title_lower or "enhancements" in title_lower:
                subtype = "Plugin Features & API"
            elif "telemetry" in title_lower or "diagnostics" in title_lower or "dev tools" in title_lower:
                subtype = "Observability & Dev Tools"
            elif "clean" in title_lower or "stale" in title_lower or "remove" in title_lower:
                subtype = "Repo Maintenance"
            else:
                subtype = "General Enhancement"

            # Current Status
            if mergeable == "CONFLICTING":
                curr_status = "Has merge conflicts"
            elif is_draft:
                curr_status = "In Draft"
            elif "ready-to-merge" in labels_lower:
                curr_status = "Ready to merge"
            elif "testing-needed" in labels_lower:
                curr_status = "Needs testing"
            elif "review-needed" in labels_lower:
                curr_status = "Needs code review"
            elif mergeable == "MERGEABLE":
                curr_status = "Mergeable"
            else:
                curr_status = "Pending check"

            # Risk calculation
            total_changes = additions + deletions
            if mergeable == "CONFLICTING":
                risk = "High"
                risk_detail = f"High (Merge conflicts present)"
                risk_score = 3
            elif total_changes > 5000 or changed_files > 30:
                risk = "High"
                risk_detail = f"High ({changed_files} files, +{additions}/-{deletions})"
                risk_score = 3
            elif total_changes > 1000 or changed_files > 15:
                risk = "Medium"
                risk_detail = f"Medium ({changed_files} files, +{additions}/-{deletions})"
                risk_score = 2
            else:
                risk = "Low"
                risk_detail = f"Low ({changed_files} files, +{additions}/-{deletions})"
                risk_score = 1

            # Action recommendation
            if mergeable == "CONFLICTING":
                rec_action = "Rebase & resolve conflicts"
            elif is_draft:
                rec_action = "Keep in Draft"
            elif "ready-to-merge" in labels_lower and mergeable == "MERGEABLE":
                rec_action = "Approve and merge"
            elif "testing-needed" in labels_lower:
                rec_action = "Execute integration/QA testing"
            elif "review-needed" in labels_lower:
                rec_action = "Conduct code review"
            elif total_changes < 300 and mergeable == "MERGEABLE":
                rec_action = "Quick review & merge"
            else:
                rec_action = "Review & run test suite"

            processed.append({
                "number": num,
                "id_str": f"#{num}",
                "url": url,
                "title": title,
                "status": status,
                "summary": summary,
                "type": pr_type,
                "subtype": subtype,
                "current_status": curr_status,
                "risk": risk,
                "risk_score": risk_score,
                "risk_detail": risk_detail,
                "rec_action": rec_action,
                "changed_files": changed_files,
                "additions": additions,
                "deletions": deletions,
                "mergeable": mergeable,
                "author": author,
                "updated_at": updated_at,
                "updated_rel": updated_rel,
                "created_at": created_at,
                "created_fmt": created_fmt,
                "head_sha": head_sha,
                "labels": labels,
                "body": body
            })
            
        return processed

    @staticmethod
    def fetch_pr_diff(pr_number: int, cwd: str = None) -> str:
        try:
            cmd = ["gh", "pr", "diff", str(pr_number)]
            result = subprocess.run(cmd, capture_output=True, text=True, check=True, encoding="utf-8", cwd=cwd)
            return result.stdout
        except Exception:
            return ""

    @staticmethod
    def fetch_pr_files(pr_number: int, cwd: str = None) -> List[str]:
        try:
            cmd = ["gh", "pr", "view", str(pr_number), "--json", "files"]
            result = subprocess.run(cmd, capture_output=True, text=True, check=True, encoding="utf-8", cwd=cwd)
            data = json.loads(result.stdout)
            return [f["path"] for f in data.get("files", [])]
        except Exception:
            return []
