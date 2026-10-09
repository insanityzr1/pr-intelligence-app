import json
import logging
import re
import subprocess
from typing import Dict, List, Optional

from config import settings
import database
from services.ai_service import AIService
from services.diff_parser import DiffParser
from services.github_service import GitHubService, GitHubServiceError

logger = logging.getLogger(__name__)


class CITriageService:
    @staticmethod
    def fetch_failed_ci_logs(pr_number: int, repo_name: Optional[str] = None) -> dict:
        """
        Query GitHub CLI for the latest failing workflow run on this PR and pull
        the failing step logs.
        """
        target_repo = repo_name or settings.DEFAULT_REPO
        cmd = [
            "gh", "run", "list",
            "--pr", str(pr_number),
            "--repo", target_repo,
            "--limit", "5",
            "--json", "databaseId,status,conclusion,workflowName,name,url,headSha"
        ]

        try:
            res = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", check=False)
            if res.returncode != 0:
                logger.warning("gh run list returned non-zero (%d): %s", res.returncode, res.stderr)
                return {
                    "has_failures": False,
                    "workflow": "",
                    "url": "",
                    "log": f"Could not list workflow runs: {res.stderr.strip() or 'No runs recorded'}"
                }

            runs = json.loads(res.stdout) if res.stdout.strip() else []
            if not runs:
                return {
                    "has_failures": False,
                    "workflow": "",
                    "url": "",
                    "log": "No GitHub Action workflow runs found for this PR."
                }

            # Locate latest failing run
            failed_run = None
            for run in runs:
                conclusion = (run.get("conclusion") or "").lower()
                status = (run.get("status") or "").lower()
                if conclusion in ("failure", "startup_failure", "timed_out", "action_required") or (status == "completed" and conclusion != "success"):
                    failed_run = run
                    break

            if not failed_run:
                return {
                    "has_failures": False,
                    "workflow": runs[0].get("workflowName", "CI"),
                    "url": runs[0].get("url", ""),
                    "log": "All recent workflow runs succeeded or are currently pending."
                }

            run_id = str(failed_run["databaseId"])
            workflow_name = failed_run.get("workflowName") or failed_run.get("name") or "CI"
            run_url = failed_run.get("url", "")

            # Fetch failed logs
            view_cmd = ["gh", "run", "view", run_id, "--repo", target_repo, "--log-failed"]
            log_res = subprocess.run(view_cmd, capture_output=True, text=True, encoding="utf-8", check=False)
            
            raw_log = log_res.stdout if log_res.returncode == 0 and log_res.stdout.strip() else (log_res.stderr or "Log output unavailable.")
            cleaned_log = CITriageService._truncate_log(raw_log)

            return {
                "has_failures": True,
                "run_id": run_id,
                "workflow": workflow_name,
                "url": run_url,
                "log": cleaned_log
            }

        except FileNotFoundError:
            logger.error("gh CLI not found on PATH.")
            return {
                "has_failures": False,
                "workflow": "",
                "url": "",
                "log": "GitHub CLI (`gh`) is not installed or available on PATH."
            }
        except Exception as e:
            logger.error("Failed to fetch CI logs for PR #%s: %s", pr_number, e)
            return {
                "has_failures": False,
                "workflow": "",
                "url": "",
                "log": f"Error querying CI logs: {str(e)}"
            }

    @staticmethod
    def _truncate_log(log_text: str, max_lines: int = 150) -> str:
        """
        Keep relevant failing lines and stack traces while staying within LLM token limits.
        """
        if not log_text:
            return ""
        lines = log_text.splitlines()
        if len(lines) <= max_lines:
            return "\n".join(lines)

        # Prioritize error and failure markers
        error_indices = [
            i for i, line in enumerate(lines)
            if re.search(r'(error|fail|exception|fatal|traceback|syntaxerror|assertionerror)', line, re.IGNORECASE)
        ]

        if error_indices:
            # Anchor around the first cluster of errors
            first_err = error_indices[0]
            start = max(0, first_err - 20)
            end = min(len(lines), start + max_lines)
            snippet = lines[start:end]
            return f"... [Truncated leading {start} lines] ...\n" + "\n".join(snippet)

        # Otherwise keep the tail where failures usually land
        return f"... [Truncated leading {len(lines) - max_lines} lines] ...\n" + "\n".join(lines[-max_lines:])

    @staticmethod
    def triage_pr(pr_data: dict, diff_text: str = "", custom_log: Optional[str] = None, force: bool = False) -> dict:
        """
        Diagnose CI failures for a PR, produce root cause analysis and a proposed fix patch.
        Uses cached triage if available and not forced.
        """
        pr_number = pr_data.get("number")
        repo_name = pr_data.get("repo_name", settings.DEFAULT_REPO)
        head_sha = pr_data.get("head_sha", "unknown")

        if not force:
            cached = database.get_cached_ci_triage(pr_number, head_sha, repo_name)
            if cached:
                return cached

        # Fetch CI log or use custom provided log
        if custom_log:
            ci_info = {
                "has_failures": True,
                "workflow": "Custom CI",
                "url": "",
                "log": CITriageService._truncate_log(custom_log)
            }
        else:
            ci_info = CITriageService.fetch_failed_ci_logs(pr_number, repo_name)

        # If PR diff is empty, attempt to fetch it
        if not diff_text:
            try:
                diff_text = GitHubService.fetch_pr_diff(pr_number, repo_name=repo_name)
            except Exception as e:
                logger.warning("Could not fetch diff for PR #%s: %s", pr_number, e)
                diff_text = ""

        # Run AI triage or heuristic fallback
        triage_result = CITriageService._generate_triage(pr_data, diff_text, ci_info)
        database.save_ci_triage(pr_number, head_sha, triage_result, repo_name)
        return triage_result

    @staticmethod
    def _generate_triage(pr_data: dict, diff_text: str, ci_info: dict) -> dict:
        pr_number = pr_data.get("number", 0)
        repo_name = pr_data.get("repo_name", settings.DEFAULT_REPO)
        title = pr_data.get("title", "")
        author = pr_data.get("author", "")
        head_ref = pr_data.get("headRefName", "feature-branch")
        ci_log = ci_info.get("log", "")
        workflow = ci_info.get("workflow", "CI")
        run_url = ci_info.get("url", "")

        diff_context = DiffParser.prepare_diff_context(diff_text, max_lines=250)

        prompt = f"""
You are an expert Automated DevOps and Software Engineering Lead.
A Pull Request CI build has failed. Diagnose the root cause and provide an actionable fix diff patch.

Pull Request Context:
- Repo: {repo_name}
- PR #{pr_number}: {title}
- Author: @{author}
- Branch: {head_ref}
- Workflow: {workflow}

Failing CI Log Snippet:
```
{ci_log}
```

PR Code Diff:
```diff
{diff_context}
```

Instructions:
1. Identify root cause category: one of ["lint", "type_error", "test_assertion", "build_failure", "other"].
2. Assess confidence: "High", "Medium", or "Low".
3. Write a concise 1-2 sentence executive summary.
4. Detail the root cause analysis explaining exact code failure and why the proposed fix works.
5. Provide a valid unified git diff patch (starting with `--- a/...` and `+++ b/...`) resolving the issue cleanly.
6. Provide an informative git commit message (e.g. `fix(ci): resolve syntax error in service`).

Respond ONLY with valid JSON matching this schema:
{{
  "failure_category": "lint",
  "confidence": "High",
  "summary": "Concise summary of CI failure.",
  "root_cause_analysis": "Detailed explanation.",
  "suggested_patch": "--- a/file.py\\n+++ b/file.py\\n@@ -1,3 +1,3 @@\\n-old\\n+new",
  "commit_message": "fix(ci): fix issue",
  "affected_files": ["file.py"]
}}
"""

        for call in AIService._available_providers():
            try:
                res = call(prompt)
                if isinstance(res, dict) and "root_cause_analysis" in res:
                    return {
                        "pr_number": pr_number,
                        "repo_name": repo_name,
                        "head_sha": pr_data.get("head_sha", ""),
                        "failure_category": res.get("failure_category", "other"),
                        "confidence": res.get("confidence", "Medium"),
                        "summary": res.get("summary", "CI Failure diagnosed."),
                        "root_cause_analysis": res.get("root_cause_analysis", ""),
                        "suggested_patch": res.get("suggested_patch", ""),
                        "commit_message": res.get("commit_message", f"fix(ci): resolve CI failure for PR #{pr_number}"),
                        "affected_files": res.get("affected_files", []),
                        "ci_run_url": run_url,
                        "workflow_name": workflow,
                        "raw_log_snippet": ci_log[:1000] if ci_log else ""
                    }
            except Exception as e:
                logger.error("AI triage provider call failed: %s", e)

        # Fallback heuristic diagnosis
        return CITriageService._heuristic_triage(pr_data, ci_info, diff_text)

    @staticmethod
    def _heuristic_triage(pr_data: dict, ci_info: dict, diff_text: str) -> dict:
        pr_number = pr_data.get("number", 0)
        repo_name = pr_data.get("repo_name", settings.DEFAULT_REPO)
        log = ci_info.get("log", "")
        log_lower = log.lower()

        category = "other"
        confidence = "Medium"
        summary = "Automated CI failure detected in test or build pipeline."
        analysis = "The CI pipeline encountered an error during automated checks."
        patch = ""
        commit_msg = f"fix(ci): remediate CI build issue for PR #{pr_number}"
        affected = []

        if "syntaxerror" in log_lower or "indentationerror" in log_lower or "parse error" in log_lower:
            category = "build_failure"
            confidence = "High"
            summary = "Syntax or parsing error detected in source code."
            analysis = "A syntax or indentation error prevented the runtime/compiler from compiling the modified files."
            commit_msg = f"fix(syntax): correct syntax errors in PR #{pr_number}"
        elif "flake8" in log_lower or "eslint" in log_lower or "black" in log_lower or "prettier" in log_lower or "lint" in log_lower:
            category = "lint"
            confidence = "High"
            summary = "Code formatting or linter rule violation detected."
            analysis = "Linter checks flagged styling, unused imports, or formatting inconsistencies according to repository rules."
            commit_msg = f"style(lint): resolve code style violations in PR #{pr_number}"
        elif "typeerror" in log_lower or "mypy" in log_lower or "tsc" in log_lower or "cannot assign" in log_lower:
            category = "type_error"
            confidence = "Medium"
            summary = "Type mismatch or typechecker assertion failure."
            analysis = "Static type analysis failed due to incompatible argument or return type annotations."
            commit_msg = f"fix(types): correct type annotations in PR #{pr_number}"
        elif "assertionerror" in log_lower or "failed" in log_lower or "test" in log_lower:
            category = "test_assertion"
            confidence = "Medium"
            summary = "Unit or integration test assertion failed."
            analysis = "One or more test assertions failed during test runner execution."
            commit_msg = f"test(fix): update failing test assertions in PR #{pr_number}"

        # Extract probable file paths from log or diff
        file_matches = re.findall(r'([a-zA-Z0-9_\-\./]+\.(?:py|js|jsx|ts|tsx|php|go|rb|json|css|html))', log)
        if file_matches:
            for f in file_matches:
                if f not in affected and not f.startswith("http"):
                    affected.append(f)
                if len(affected) >= 5:
                    break

        return {
            "pr_number": pr_number,
            "repo_name": repo_name,
            "head_sha": pr_data.get("head_sha", ""),
            "failure_category": category,
            "confidence": confidence,
            "summary": summary,
            "root_cause_analysis": analysis + "\n\nRefer to the failing logs below for stack traces and check definitions.",
            "suggested_patch": patch,
            "commit_message": commit_msg,
            "affected_files": affected,
            "ci_run_url": ci_info.get("url", ""),
            "workflow_name": ci_info.get("workflow", "CI"),
            "raw_log_snippet": log[:1000] if log else ""
        }
