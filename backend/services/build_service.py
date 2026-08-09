"""
Workspace-as-candidate-build.

A PR Workspace is a *proposed release*, not just a list. This service answers
the questions that actually matter before shipping one:

  - Does this set of PRs merge together (not merely each into main)?
  - If not, which specific pairs collide, on which files?
  - What order lands the most PRs before hitting trouble?

Simulation is per-repository: merging PRs from different repos into one tree is
meaningless, so a multi-repo workspace produces one result per repo.
"""

import logging
from collections import defaultdict
from typing import Dict, List, Optional

from config import settings
from services.git_service import GitService, GitServiceError, GitUnavailableError

logger = logging.getLogger(__name__)


class BuildService:
    @staticmethod
    def _head_for(pr: dict) -> dict:
        number = pr.get("number") or pr.get("pr_number")
        return {
            "ref": GitService.pr_ref(number),
            "label": f"#{number}",
            "pr_number": number,
            "repo_name": pr.get("repo_name"),
            "title": pr.get("title"),
            "base": pr.get("baseRefName") or "main",
        }

    @staticmethod
    def simulate(prs: List[dict], order: Optional[List[int]] = None) -> dict:
        """
        Run a full build simulation over `prs`.

        Returns a per-repository report plus an overall verdict. Degrades to a
        clearly-labelled "unavailable" result rather than lying when git or the
        network is not usable.
        """
        if not settings.GIT_MERGE_ENABLED:
            return BuildService._unavailable(prs, "Real merge simulation is disabled (GIT_MERGE_ENABLED=false).")

        by_repo: Dict[str, List[dict]] = defaultdict(list)
        for pr in prs:
            repo = pr.get("repo_name")
            if repo:
                by_repo[repo].append(pr)

        if order:
            rank = {num: i for i, num in enumerate(order)}
            for repo in by_repo:
                by_repo[repo].sort(key=lambda p: rank.get(p.get("number"), 10**6))

        repos_out, all_clean, any_available = [], True, False

        for repo_name, repo_prs in by_repo.items():
            try:
                path = GitService.ensure_mirror(repo_name)
            except (GitServiceError, GitUnavailableError) as exc:
                logger.warning("Mirror unavailable for %s: %s", repo_name, exc)
                repos_out.append({
                    "repo_name": repo_name,
                    "available": False,
                    "reason": str(exc),
                    "pr_count": len(repo_prs),
                })
                all_clean = False
                continue

            any_available = True
            heads = [BuildService._head_for(p) for p in repo_prs]
            # Every PR in a workspace should share a base; if they don't, the
            # most common one is the release target.
            base_branch = BuildService._dominant_base(heads)
            base = GitService.base_ref(base_branch)

            try:
                sequence = GitService.simulate_sequence(path, base, heads)
            except GitServiceError as exc:
                logger.warning("Simulation failed for %s: %s", repo_name, exc)
                repos_out.append({
                    "repo_name": repo_name, "available": False,
                    "reason": str(exc), "pr_count": len(repo_prs),
                })
                all_clean = False
                continue

            # Pairwise is O(n^2) merges; cap it and say so rather than hanging.
            pairs, truncated = [], False
            if len(heads) <= settings.GIT_MAX_PAIRWISE_PRS:
                pairs = GitService.pairwise_conflicts(path, base, heads)
            else:
                truncated = True
                logger.info(
                    "Skipping pairwise matrix for %s: %d PRs exceeds GIT_MAX_PAIRWISE_PRS=%d",
                    repo_name, len(heads), settings.GIT_MAX_PAIRWISE_PRS,
                )

            suggested = [h["pr_number"] for h in GitService.suggest_order(heads, pairs)]

            if not sequence["clean"]:
                all_clean = False

            repos_out.append({
                "repo_name": repo_name,
                "available": True,
                "base_branch": base_branch,
                "pr_count": len(heads),
                "clean": sequence["clean"],
                "steps": sequence["steps"],
                "merged": sequence["merged"],
                "blocked": sequence["blocked"],
                "tree": sequence["tree"],
                "commit": sequence.get("commit"),
                "conflict_pairs": pairs,
                "pairwise_truncated": truncated,
                "suggested_order": suggested,
            })

        return {
            "available": any_available,
            "clean": all_clean and any_available,
            "repos": repos_out,
            "total_prs": len(prs),
        }

    @staticmethod
    def readiness(prs: List[dict], simulation: Optional[dict] = None) -> dict:
        """
        Ship blockers for a workspace, in one verdict.

        Combines the three independent reasons a release stalls: CI is red,
        reviews are outstanding, and the set does not merge. Previously none of
        these were visible on a workspace at all.
        """
        blocked_labels = set()
        if simulation:
            for repo in simulation.get("repos", []):
                for label in repo.get("blocked", []) or []:
                    blocked_labels.add(label)

        failing_ci, pending_ci, unapproved, changes_requested, drafts, conflicting = [], [], [], [], [], []

        for pr in prs:
            number = pr.get("number")
            ref = {"pr_number": number, "repo_name": pr.get("repo_name"), "title": pr.get("title")}

            state = pr.get("checks_state") or "NONE"
            if state == "FAILING":
                failing_ci.append({**ref, "failed_checks": pr.get("failed_checks") or []})
            elif state == "PENDING":
                pending_ci.append(ref)

            decision = (pr.get("review_decision") or "").upper()
            if decision == "CHANGES_REQUESTED":
                changes_requested.append(ref)
            elif decision != "APPROVED":
                unapproved.append(ref)

            if pr.get("status") == "Draft":
                drafts.append(ref)

            if f"#{number}" in blocked_labels:
                conflicting.append(ref)

        blockers = {
            "failing_ci": failing_ci,
            "changes_requested": changes_requested,
            "unapproved": unapproved,
            "conflicting": conflicting,
            "drafts": drafts,
        }
        # Pending CI is a warning, not a blocker: it may still go green.
        hard_count = sum(len(v) for k, v in blockers.items() if k != "unapproved")
        total_blockers = sum(len(v) for v in blockers.values())

        return {
            "ready": total_blockers == 0,
            "shippable_with_review": hard_count == 0,
            "total_prs": len(prs),
            "blockers": blockers,
            "warnings": {"pending_ci": pending_ci},
            "blocker_count": total_blockers,
        }

    @staticmethod
    def _dominant_base(heads: List[dict]) -> str:
        counts: Dict[str, int] = defaultdict(int)
        for head in heads:
            counts[head.get("base") or "main"] += 1
        return max(counts.items(), key=lambda kv: kv[1])[0] if counts else "main"

    @staticmethod
    def _unavailable(prs: List[dict], reason: str) -> dict:
        return {
            "available": False,
            "clean": False,
            "reason": reason,
            "repos": [],
            "total_prs": len(prs),
        }

    # ---- single-PR helpers used by the conflict resolver ------------------

    @staticmethod
    def pr_merge_state(pr: dict) -> dict:
        """
        Merge a single PR against its base for real, returning conflicted paths
        and the merged tree. This replaces trusting GitHub's `mergeable` flag,
        which can be stale or `UNKNOWN` while GitHub recomputes it.
        """
        repo_name = pr.get("repo_name")
        number = pr.get("number") or pr.get("pr_number")
        base_branch = pr.get("baseRefName") or "main"

        path = GitService.ensure_mirror(repo_name)
        base = GitService.base_ref(base_branch)
        result = GitService.merge_tree(path, base, GitService.pr_ref(number))

        return {
            "repo_path": path,
            "base": base,
            "base_branch": base_branch,
            "clean": result["clean"],
            "tree": result["tree"],
            "conflict_files": [c["path"] for c in result["conflicts"]],
            "messages": result["messages"],
        }

    @staticmethod
    def conflict_context(pr: dict, max_files: int = 5) -> str:
        """
        Real conflict markers for the AI resolver.

        Previously the resolver was handed a truncated slice of the PR diff and
        asked to imagine the conflict; this hands it the actual conflicted text.
        """
        state = BuildService.pr_merge_state(pr)
        if state["clean"]:
            return ""

        blocks = []
        for file_path in state["conflict_files"][:max_files]:
            markers = GitService.conflict_markers(state["repo_path"], state["tree"], file_path)
            if markers:
                blocks.append(f"### Conflicted file: {file_path}\n{markers}")

        remaining = len(state["conflict_files"]) - max_files
        if remaining > 0:
            blocks.append(f"\n[... {remaining} more conflicted file(s) omitted ...]")
        return "\n\n".join(blocks)
