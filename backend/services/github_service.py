from datetime import datetime, timezone
import json
import logging
import re
import subprocess
import sys
from config import settings

logger = logging.getLogger(__name__)


class GitHubServiceError(RuntimeError):
    """Raised when a `gh` invocation fails. Callers should surface this, not mask it."""

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
        return f"PR addressing {title.lower()}."
    lines = [clean_text(line) for line in body.split('\n') if clean_text(line)]
    for line in lines:
        if len(line) > 15 and not line.startswith('#') and not line.startswith('http'):
            return line[:140] + ('...' if len(line) > 140 else '')
    return lines[0][:140] if lines else f"PR addressing {title.lower()}."

class GitHubService:
    @staticmethod
    def fetch_prs(count=100, state="open", orderby="updated-desc", repo_name=None, cwd=None):
        fetch_limit = count if (count and count > 0) else settings.PR_FETCH_LIMIT
        cmd = [
            "gh", "pr", "list",
            "--limit", str(fetch_limit),
            "--state", state,
            "--json", "number,title,author,url,updatedAt,createdAt,isDraft,mergeable,labels,body,headRefName,baseRefName,additions,deletions,changedFiles,headRefOid"
        ]
        if repo_name:
            cmd.extend(["--repo", repo_name])

        try:
            result = subprocess.run(
                cmd, capture_output=True, text=True, check=True, encoding="utf-8", cwd=cwd
            )
            raw_prs = json.loads(result.stdout)
        except subprocess.CalledProcessError as exc:
            stderr = (exc.stderr or "").strip()
            logger.error("gh pr list failed for %s: %s", repo_name or "<default repo>", stderr)
            raise GitHubServiceError(
                f"Could not list PRs for {repo_name or 'the default repository'}"
                + (f": {stderr}" if stderr else "")
            ) from exc
        except FileNotFoundError as exc:
            logger.error("The `gh` CLI was not found on PATH.")
            raise GitHubServiceError(
                "The GitHub CLI (`gh`) is not installed or not on PATH."
            ) from exc
        except json.JSONDecodeError as exc:
            logger.error("Unparseable JSON from gh pr list: %s", exc)
            raise GitHubServiceError("Malformed response from GitHub while listing PRs.") from exc

        processed = []
        for pr in raw_prs:
            num = pr["number"]
            title = clean_text(pr["title"])
            author = pr["author"]["login"] if isinstance(pr["author"], dict) else pr["author"]
            url = pr["url"]
            updated_at = pr["updatedAt"]
            created_at = pr["createdAt"]
            updated_rel = format_relative_time(updated_at)
            created_fmt = format_created_date(created_at)

            is_draft = pr.get("isDraft", False)
            mergeable = pr.get("mergeable", "UNKNOWN")

            if is_draft:
                status = "Draft"
            elif mergeable == "CONFLICTING":
                status = "Conflicting"
            else:
                status = "Open"

            body = pr.get("body", "")
            summary = extract_summary(body, title)

            labels = [lbl["name"] for lbl in pr.get("labels", []) if isinstance(lbl, dict)]
            head_sha = pr.get("headRefOid", "unknown")

            # Classification
            title_lower = title.lower()
            if "fix" in title_lower or "bug" in title_lower:
                pr_type = "Bug Fix"
            elif "feat" in title_lower or "add" in title_lower:
                pr_type = "New Feature"
            elif "refactor" in title_lower:
                pr_type = "Refactor"
            else:
                pr_type = "Enhancement"

            if "ui" in title_lower or "css" in title_lower:
                subtype = "UI / UX & Accessibility"
            elif "api" in title_lower or "endpoint" in title_lower:
                subtype = "Backend API"
            elif "test" in title_lower:
                subtype = "Testing & QA"
            else:
                subtype = "Core Logic"

            # Risk Assessment
            changed_files = pr.get("changedFiles", 0)
            additions = pr.get("additions", 0)
            deletions = pr.get("deletions", 0)
            total_lines = additions + deletions

            if mergeable == "CONFLICTING":
                current_status = "Merge Conflict"
                rec_action = "Resolve Conflicts"
            elif is_draft:
                current_status = "Draft PR"
                rec_action = "Wait for Ready"
            else:
                current_status = "Review Required"
                rec_action = "Review Code"

            if mergeable == "CONFLICTING" or total_lines > 500 or changed_files > 10:
                risk = "High"
                risk_detail = "High Risk Changes"
                risk_score = 3
            elif total_lines > 150 or changed_files > 4:
                risk = "Medium"
                risk_detail = "Moderate Changes"
                risk_score = 2
            else:
                risk = "Low"
                risk_detail = "Small Change"
                risk_score = 1

            target_repo = repo_name if repo_name else settings.DEFAULT_REPO

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
        """
        Return the raw unified diff for a PR.

        Raises on failure. This used to swallow every exception and return a
        fabricated diff ("-old code / +new code"), which was then fed to the LLM
        and to the conflict resolver — producing confident, entirely fictional
        reviews with no error surfaced anywhere.
        """
        cmd = ["gh", "pr", "diff", str(pr_number)]
        if repo_name:
            cmd.extend(["--repo", repo_name])
        try:
            result = subprocess.run(
                cmd, capture_output=True, text=True, check=True, encoding="utf-8", cwd=cwd
            )
            return result.stdout
        except subprocess.CalledProcessError as exc:
            stderr = (exc.stderr or "").strip()
            logger.error("gh pr diff failed for PR #%s (%s): %s", pr_number, repo_name, stderr)
            raise GitHubServiceError(
                f"Could not fetch diff for PR #{pr_number}"
                + (f" in {repo_name}" if repo_name else "")
                + (f": {stderr}" if stderr else "")
            ) from exc
        except FileNotFoundError as exc:
            logger.error("The `gh` CLI was not found on PATH.")
            raise GitHubServiceError(
                "The GitHub CLI (`gh`) is not installed or not on PATH."
            ) from exc

    @staticmethod
    def fetch_pr_files(pr_number: int, repo_name: str = None, cwd: str = None) -> list:
        """
        Return the file paths touched by a PR.

        Asks GitHub for the file list directly instead of downloading and
        re-parsing the entire diff — the old approach cost one full `gh pr diff`
        per PR, which dominated the runtime of the collision matrix.
        """
        cmd = ["gh", "pr", "view", str(pr_number), "--json", "files"]
        if repo_name:
            cmd.extend(["--repo", repo_name])
        try:
            result = subprocess.run(
                cmd, capture_output=True, text=True, check=True, encoding="utf-8", cwd=cwd
            )
            payload = json.loads(result.stdout or "{}")
        except subprocess.CalledProcessError as exc:
            stderr = (exc.stderr or "").strip()
            logger.error("gh pr view --json files failed for PR #%s (%s): %s", pr_number, repo_name, stderr)
            raise GitHubServiceError(
                f"Could not fetch file list for PR #{pr_number}"
                + (f": {stderr}" if stderr else "")
            ) from exc
        except FileNotFoundError as exc:
            logger.error("The `gh` CLI was not found on PATH.")
            raise GitHubServiceError(
                "The GitHub CLI (`gh`) is not installed or not on PATH."
            ) from exc
        except json.JSONDecodeError as exc:
            logger.error("Unparseable JSON from gh for PR #%s: %s", pr_number, exc)
            raise GitHubServiceError(
                f"Malformed response from GitHub for PR #{pr_number}."
            ) from exc

        files = []
        for entry in payload.get("files") or []:
            path = entry.get("path") if isinstance(entry, dict) else None
            if path and path not in files:
                files.append(path)
        return files
