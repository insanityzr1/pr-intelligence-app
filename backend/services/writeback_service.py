"""
Write-back to GitHub.

The app was strictly read-only: `gh` was only ever invoked with `pr list` and
`pr diff`. Analysis that cannot leave the tool is analysis the rest of the team
never sees, so this closes the loop — posting reviews, syncing tags to labels,
and merging in the order the build simulation computed.

Every call here mutates a real repository, so each is explicit and none are
invoked implicitly by a read path.
"""

import json
import logging
import subprocess
from typing import List, Optional

from services.github_service import GitHubServiceError

logger = logging.getLogger(__name__)


def _gh(args: List[str], repo_name: Optional[str] = None, stdin: Optional[str] = None) -> str:
    cmd = ["gh", *args]
    if repo_name:
        cmd += ["--repo", repo_name]
    try:
        result = subprocess.run(
            cmd, input=stdin, capture_output=True, text=True,
            encoding="utf-8", check=False,
        )
    except FileNotFoundError as exc:
        raise GitHubServiceError("The GitHub CLI (`gh`) is not installed or not on PATH.") from exc

    if result.returncode != 0:
        stderr = (result.stderr or "").strip()
        logger.error("gh %s failed: %s", " ".join(args[:2]), stderr)
        raise GitHubServiceError(stderr or f"`gh {' '.join(args[:2])}` failed.")
    return result.stdout


class WriteBackService:
    @staticmethod
    def post_review_comment(pr_number: int, repo_name: str, ai_review: dict) -> dict:
        """Publish an AI review as a PR comment, formatted as markdown."""
        body = WriteBackService.format_review(pr_number, ai_review)
        _gh(["pr", "comment", str(pr_number), "--body-file", "-"], repo_name, stdin=body)
        return {"status": "posted", "pr_number": pr_number, "repo_name": repo_name}

    @staticmethod
    def format_review(pr_number: int, review: dict) -> str:
        lines = [
            "## 🤖 AI Code Review",
            "",
            f"**Code quality score:** {review.get('code_quality_score', 'n/a')}/100",
            "",
            "### Summary",
            review.get("ai_summary", "_No summary produced._"),
            "",
            "### Architectural impact",
            review.get("architectural_impact", "_None identified._"),
        ]

        for title, key in (("⚠️ Breaking changes", "breaking_changes"),
                           ("🔐 Security risks", "security_risks")):
            items = review.get(key) or []
            if items:
                lines += ["", f"### {title}"] + [f"- {i}" for i in items]

        scenarios = review.get("qa_test_scenarios") or []
        if scenarios:
            lines += ["", "### 🧪 Suggested QA scenarios"] + [f"- {s}" for s in scenarios]

        lines += ["", "---", "<sub>Posted by PR Intelligence.</sub>"]
        return "\n".join(lines)

    @staticmethod
    def sync_labels(pr_number: int, repo_name: str, tags: List[str]) -> dict:
        """
        Mirror app tags onto the PR as GitHub labels.

        Emoji are stripped: GitHub allows them in label names, but they make
        labels awkward to filter on from the CLI and in search.
        """
        labels = [WriteBackService._label_from_tag(t) for t in tags if t.strip()]
        if not labels:
            return {"status": "noop", "reason": "no tags to sync"}

        applied, failed = [], []
        for label in labels:
            try:
                _gh(["pr", "edit", str(pr_number), "--add-label", label], repo_name)
                applied.append(label)
            except GitHubServiceError as exc:
                # Most often the label does not exist in the repo; report it
                # rather than failing the whole batch.
                failed.append({"label": label, "error": str(exc)})

        return {"status": "ok", "applied": applied, "failed": failed}

    @staticmethod
    def _label_from_tag(tag: str) -> str:
        return "".join(c for c in tag if c.isascii()).strip() or tag

    @staticmethod
    def merge_pr(pr_number: int, repo_name: str, method: str = "squash",
                 delete_branch: bool = False) -> dict:
        if method not in ("merge", "squash", "rebase"):
            raise GitHubServiceError(f"Unsupported merge method '{method}'.")

        args = ["pr", "merge", str(pr_number), f"--{method}"]
        if delete_branch:
            args.append("--delete-branch")
        _gh(args, repo_name)
        return {"status": "merged", "pr_number": pr_number, "method": method}

    @staticmethod
    def merge_sequence(pr_numbers: List[int], repo_name: str, method: str = "squash",
                       dry_run: bool = True, delete_branch: bool = False) -> dict:
        """
        Merge a workspace in the computed order, stopping at the first failure.

        Defaults to a dry run: this is the single most destructive thing the app
        can do, and the caller should have to ask for it explicitly.
        """
        planned = [{"pr_number": n, "method": method} for n in pr_numbers]
        if dry_run:
            return {"dry_run": True, "planned": planned, "merged": [], "failed": None}

        merged = []
        for number in pr_numbers:
            try:
                WriteBackService.merge_pr(number, repo_name, method, delete_branch)
                merged.append(number)
            except GitHubServiceError as exc:
                # Abort rather than continue: once one merge fails, every
                # subsequent merge is against a base the simulation never modelled.
                return {
                    "dry_run": False, "planned": planned, "merged": merged,
                    "failed": {"pr_number": number, "error": str(exc)},
                    "aborted": True,
                }
        return {"dry_run": False, "planned": planned, "merged": merged, "failed": None}

    @staticmethod
    def open_release_pr(repo_name: str, head_branch: str, base_branch: str,
                        title: str, body: str) -> dict:
        out = _gh(
            ["pr", "create", "--head", head_branch, "--base", base_branch,
             "--title", title, "--body-file", "-"],
            repo_name, stdin=body,
        )
        return {"status": "created", "url": out.strip()}
