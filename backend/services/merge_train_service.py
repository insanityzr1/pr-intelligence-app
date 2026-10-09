from datetime import datetime, timezone
import logging
import subprocess
from typing import Dict, List, Optional

from config import settings
from services.build_service import BuildService
from services.dependency_service import DependencyService
from services.git_service import GitService, GitServiceError, GitUnavailableError
from services.writeback_service import WriteBackService, _gh

logger = logging.getLogger(__name__)


class MergeTrainService:
    @staticmethod
    def simulate_train(
        prs: List[dict],
        repo_name: Optional[str] = None,
        base_branch: Optional[str] = "main",
        auto_order: bool = True
    ) -> dict:
        """
        Simulate a progressive merge train queue onto `base_branch`.
        Computes optimal ordering, executes sequential merges, and isolates derailments.
        """
        target_repo = repo_name or settings.DEFAULT_REPO
        target_base = base_branch or "main"
        timestamp_str = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
        candidate_branch = f"staging/merge-train-{timestamp_str}"

        if not prs:
            return {
                "status": "empty",
                "repo_name": target_repo,
                "base_branch": target_base,
                "total_prs": 0,
                "clean_count": 0,
                "blocked_count": 0,
                "steps": [],
                "clean_prs": [],
                "blocked_prs": [],
                "can_publish_staging": False,
                "staging_branch_candidate": candidate_branch
            }

        # Filter PRs belonging to target repository
        target_prs = [p for p in prs if not p.get("repo_name") or p.get("repo_name") == target_repo]
        if not target_prs:
            target_prs = prs

        # 1. Optimal Topological / Hybrid Ordering
        if auto_order and len(target_prs) > 1:
            try:
                graph = DependencyService.build_graph(target_prs)
                order = DependencyService.merge_order(graph["nodes"], graph["edges"])
                rank = {num: idx for idx, num in enumerate(order)}
                target_prs.sort(key=lambda p: rank.get(p.get("number") or p.get("pr_number"), 9999))
            except Exception as e:
                logger.warning("Auto-ordering failed, using provided order: %s", e)

        # Degraded mode if real git merges disabled
        if not settings.GIT_MERGE_ENABLED:
            steps = []
            for p in target_prs:
                num = p.get("number") or p.get("pr_number")
                steps.append({
                    "pr_number": num,
                    "title": p.get("title", ""),
                    "author": p.get("author", ""),
                    "clean": True,
                    "conflicts": [],
                    "error": None
                })
            return {
                "status": "clean",
                "repo_name": target_repo,
                "base_branch": target_base,
                "total_prs": len(target_prs),
                "clean_count": len(target_prs),
                "blocked_count": 0,
                "steps": steps,
                "clean_prs": [p.get("number") or p.get("pr_number") for p in target_prs],
                "blocked_prs": [],
                "can_publish_staging": True,
                "staging_branch_candidate": candidate_branch,
                "notice": "Simulated in offline/heuristic mode (GIT_MERGE_ENABLED=false)."
            }

        # 2. Run real git merge sequence in bare mirror
        try:
            path = GitService.ensure_mirror(target_repo)
            heads = [BuildService._head_for(p) for p in target_prs]
            base_ref = GitService.base_ref(target_base)
            sequence = GitService.simulate_sequence(path, base_ref, heads)
        except (GitServiceError, GitUnavailableError) as exc:
            logger.warning("Git simulation encountered an error for %s: %s", target_repo, exc)
            # Graceful fallback reporting
            return {
                "status": "error",
                "repo_name": target_repo,
                "base_branch": target_base,
                "error": str(exc),
                "total_prs": len(target_prs),
                "clean_count": 0,
                "blocked_count": len(target_prs),
                "steps": [{
                    "pr_number": p.get("number") or p.get("pr_number"),
                    "title": p.get("title", ""),
                    "author": p.get("author", ""),
                    "clean": False,
                    "conflicts": [],
                    "error": str(exc)
                } for p in target_prs],
                "clean_prs": [],
                "blocked_prs": [p.get("number") or p.get("pr_number") for p in target_prs],
                "can_publish_staging": False,
                "staging_branch_candidate": candidate_branch
            }

        clean_prs = []
        blocked_prs = []
        detailed_steps = []

        for idx, step in enumerate(sequence.get("steps", [])):
            pr_num = step.get("pr_number")
            is_clean = step.get("clean", False)
            title = ""
            author = ""
            for p in target_prs:
                if (p.get("number") or p.get("pr_number")) == pr_num:
                    title = p.get("title", "")
                    author = p.get("author", "")
                    break

            if is_clean:
                clean_prs.append(pr_num)
            else:
                blocked_prs.append(pr_num)

            detailed_steps.append({
                "step_index": idx + 1,
                "pr_number": pr_num,
                "title": title,
                "author": author,
                "clean": is_clean,
                "conflicts": step.get("conflicts", []),
                "error": step.get("error")
            })

        status = "clean" if not blocked_prs else ("partial" if clean_prs else "blocked")

        return {
            "status": status,
            "repo_name": target_repo,
            "base_branch": target_base,
            "total_prs": len(target_prs),
            "clean_count": len(clean_prs),
            "blocked_count": len(blocked_prs),
            "ordered_prs": [p.get("number") or p.get("pr_number") for p in target_prs],
            "steps": detailed_steps,
            "clean_prs": clean_prs,
            "blocked_prs": blocked_prs,
            "final_commit": sequence.get("commit"),
            "final_tree": sequence.get("tree"),
            "can_publish_staging": len(clean_prs) > 0 and bool(sequence.get("commit")),
            "staging_branch_candidate": candidate_branch
        }

    @staticmethod
    def publish_staging_branch(
        repo_name: str,
        staging_branch: str,
        final_commit: str,
        pr_numbers: List[int],
        create_pr: bool = False,
        pr_title: Optional[str] = "",
        pr_body: Optional[str] = ""
    ) -> dict:
        """
        Push the accumulated simulated commit to a remote staging branch on GitHub,
        and optionally open a draft release pull request.
        """
        if not staging_branch or not staging_branch.startswith("staging/"):
            staging_branch = f"staging/{staging_branch.lstrip('/')}" if staging_branch else "staging/merge-train"

        if not final_commit:
            raise GitServiceError("No valid merged commit available to publish.")

        target_repo = repo_name or settings.DEFAULT_REPO
        mirror_path = GitService.ensure_mirror(target_repo)

        # Push commit to remote staging branch
        cmd = [
            "git", "push", "--force",
            GitService._auth_url(target_repo),
            f"{final_commit}:refs/heads/{staging_branch}"
        ]
        res = subprocess.run(cmd, cwd=mirror_path, capture_output=True, text=True, check=False)
        if res.returncode != 0:
            logger.error("Failed to push staging branch %s: %s", staging_branch, res.stderr)
            raise GitServiceError(f"Could not push staging branch: {res.stderr.strip() or 'git push failed'}")

        pr_info = None
        if create_pr:
            title = pr_title or f"🚀 Staging Release Integration: {staging_branch}"
            body = pr_body or (
                f"## 🚆 Automated Merge Train Integration Candidate\n\n"
                f"This staging branch consolidates {len(pr_numbers)} pull requests verified clean through the Merge Train Simulator:\n\n"
                + "\n".join([f"- PR #{n}" for n in pr_numbers])
                + "\n\n---\n<sub>Generated by PR Intelligence App Merge Train.</sub>"
            )
            try:
                pr_info = WriteBackService.open_release_pr(
                    repo_name=target_repo,
                    head_branch=staging_branch,
                    base_branch="main",
                    title=title,
                    body=body
                )
            except Exception as e:
                logger.warning("Could not open draft PR for staging branch %s: %s", staging_branch, e)
                pr_info = {"status": "skipped", "reason": str(e)}

        return {
            "status": "published",
            "repo_name": target_repo,
            "staging_branch": staging_branch,
            "commit_sha": final_commit,
            "pr": pr_info
        }
