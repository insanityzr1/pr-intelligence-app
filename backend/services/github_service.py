from datetime import datetime, timezone
import json
import re
import subprocess
import sys
from config import settings

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
    text = re.sub(r'[\r\n]+', ' ', text)
    text = re.sub(r'\s+', ' ', text)
    return text.strip()

def extract_summary(body, title):
    if not body:
        return title
    
    lines = [line.strip() for line in body.splitlines() if line.strip()]
    
    summary_lines = []
    in_summary = False
    
    for line in lines:
        if line.lower().startswith('## summary') or line.lower().startswith('### summary') or line.lower() == 'summary':
            in_summary = True
            continue
        elif in_summary and line.startswith('##'):
            break
        elif in_summary:
            if line.startswith('- ') or line.startswith('* '):
                line = line[2:].strip()
            summary_lines.append(line)
            
    if summary_lines:
        res = " ".join(summary_lines)
    else:
        filtered = [l for l in lines if not l.startswith('#') and not l.startswith('!') and not l.startswith('[')]
        if filtered:
            res = filtered[0]
        else:
            paragraphs = body.split('\n\n')
            res = paragraphs[0]
            
    res = clean_text(res)
    if not res or len(res) < 10:
        res = title
    if len(res) > 200:
        res = res[:197] + "..."
    return res

class GitHubService:
    @staticmethod
    def fetch_prs(count: int = None, state: str = "open", orderby: str = "updated-desc", repo_name: str = None, cwd: str = None):
        fetch_limit = count if (count and count > 0) else settings.PR_FETCH_LIMIT
        
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
            "--limit", str(fetch_limit),
            "--search", search_query,
            "--json", "number,title,isDraft,updatedAt,createdAt,url,labels,additions,deletions,changedFiles,mergeable,body,author,headRefName,baseRefName,headRefOid"
        ]

        if repo_name:
            cmd.extend(["--repo", repo_name])

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

            if "fix" in title_lower or "bug" in labels_lower or "timezone" in title_lower or "n+1" in title_lower:
                subtype = "Bug Fix"
            elif "palette" in title_lower or "accessibility" in title_lower or "a11y" in title_lower or "ui/ux" in labels_lower or "adminbar" in title_lower or "ux" in title_lower:
                subtype = "UI / UX & Accessibility"
            elif "docs" in title_lower or "documentation" in labels_lower or "readme" in title_lower:
                subtype = "Documentation"
            else:
                subtype = "Refactor / Enhancement"

            if mergeable == "CONFLICTING":
                current_status = "needs fixing"
                rec_action = "Needs Rebase & Conflict Fix"
            elif is_draft:
                current_status = "needs testing"
                rec_action = "In Development / Review"
            else:
                current_status = "ready to merge"
                rec_action = "Review & Merge"

            total_changes = additions + deletions
            if total_changes > 1000 or changed_files > 15 or mergeable == "CONFLICTING":
                risk = "High"
                risk_detail = "Large Refactor / Conflict"
                risk_score = 3
            elif total_changes > 200 or changed_files > 5:
                risk = "Medium"
                risk_detail = "Moderate Changes"
                risk_score = 2
            else:
                risk = "Low"
                risk_detail = "Small Change"
                risk_score = 1

            target_repo = repo_name if repo_name else "rpnunez/wp-ai-scheduler"

            processed.append({
                "number": num,
                "id_str": f"PR #{num}",
                "url": url,
                "title": title,
                "status": status,
                "summary": summary,
                "type": pr_type,
                "subtype": subtype,
                "current_status": current_status,
                "risk": risk,
                "risk_detail": risk_detail,
                "risk_score": risk_score,
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
                "repo_name": target_repo,
                "labels": labels,
                "body": body,
                "headRefName": pr.get("headRefName", ""),
                "baseRefName": pr.get("baseRefName", "main")
            })

        return processed

    @staticmethod
    def fetch_pr_diff(pr_number: int, repo_name: str = None, cwd: str = None) -> str:
        cmd = ["gh", "pr", "diff", str(pr_number)]
        if repo_name:
            cmd.extend(["--repo", repo_name])
        result = subprocess.run(cmd, capture_output=True, text=True, check=True, encoding="utf-8", cwd=cwd)
        return result.stdout
