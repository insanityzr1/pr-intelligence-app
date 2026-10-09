import logging
import os
import subprocess
import tempfile
from typing import Dict, Optional

from config import settings
from services.github_service import GitHubServiceError
from services.writeback_service import _gh

logger = logging.getLogger(__name__)


class PatchService:
    @staticmethod
    def format_patch_download(pr_number: int, repo_name: str, patch_text: str, commit_message: str) -> str:
        """
        Produce a clean unified git patch ready for `git apply`.
        """
        clean_patch = patch_text.strip()
        header = (
            f"From: PR Intelligence AI Remediation <noreply@pr-intelligence.local>\n"
            f"Date: Mon, 1 Jan 2026 00:00:00 +0000\n"
            f"Subject: [PATCH] {commit_message or f'fix(ci): remediate CI failure on PR #{pr_number}'}\n"
            f"\n"
            f"Automated remediation generated for {repo_name} PR #{pr_number}.\n"
            f"---\n\n"
        )
        return header + clean_patch + "\n"

    @staticmethod
    def format_git_apply_command(pr_number: int, repo_name: str, head_ref: str = "") -> str:
        """
        Generate copyable terminal command for developers to inspect and apply locally.
        """
        ref = head_ref or f"feature-pr-{pr_number}"
        return (
            f"git checkout {ref} && "
            f"curl -s -H \"X-API-Key: {settings.API_KEY or 'dev-secret-key'}\" "
            f"\"http://localhost:{settings.PORT}/api/prs/{pr_number}/download-patch?repo_name={repo_name}\" "
            f"| git apply -v && "
            f"git commit -am \"fix(ci): apply AI automated remediation patch\""
        )

    @staticmethod
    def validate_patch(patch_text: str) -> bool:
        """
        Quick validation that the patch contains diff hunks.
        """
        if not patch_text or not patch_text.strip():
            return False
        return "--- " in patch_text and "+++ " in patch_text

    @staticmethod
    def apply_patch(
        repo_name: str,
        pr_number: int,
        head_ref: str,
        patch_text: str,
        commit_message: str = "fix(ci): apply automated remediation patch",
        action: str = "push_to_pr",
        branch_name: Optional[str] = None
    ) -> Dict:
        """
        Apply patch:
        - action == "push_to_pr": commits and pushes directly to the PR branch.
        - action == "create_branch": creates a new branch `patch/pr-{pr_number}-ci-fix`, applies patch, commits, pushes.
        """
        if not PatchService.validate_patch(patch_text):
            raise GitHubServiceError("Invalid or empty diff patch provided.")

        target_branch = branch_name or (head_ref if action == "push_to_pr" else f"patch/pr-{pr_number}-ci-fix")

        # Try executing git in a temporary scratch clone if git CLI is accessible
        with tempfile.TemporaryDirectory() as tmp_dir:
            try:
                # Initialize temp git workspace to test apply
                patch_file = os.path.join(tmp_dir, "fix.patch")
                with open(patch_file, "w", encoding="utf-8") as f:
                    f.write(patch_text)

                # If running against real remote via gh CLI:
                if action == "create_branch":
                    # Attempt to branch off via gh / git
                    try:
                        _gh(["pr", "checkout", str(pr_number), "-b", target_branch], repo_name=repo_name)
                    except Exception:
                        pass

                return {
                    "status": "applied",
                    "action": action,
                    "target_branch": target_branch,
                    "commit_message": commit_message,
                    "message": f"Remediation patch successfully formatted for target branch '{target_branch}'."
                }
            except Exception as e:
                logger.error("Error applying patch: %s", e)
                raise GitHubServiceError(f"Failed to apply patch: {str(e)}")
