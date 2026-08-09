"""
PR dependency / stacked-PR detection.

High-volume repos live on stacked PRs: B is branched off A rather than off main.
The app was completely blind to them, and worse, the file-overlap heuristic
*misreported* a stack as a conflict — a stacked PR necessarily touches the same
files as its parent, which looked identical to two PRs colliding.

Two independent signals:
  1. Explicit — B's base branch is A's head branch. Unambiguous.
  2. Ancestry — A's head commit is an ancestor of B's head. Catches stacks
     retargeted onto main before merge, which signal 1 misses.
"""

import logging
from typing import Dict, List, Optional

from services.git_service import GitService, GitServiceError

logger = logging.getLogger(__name__)


class DependencyService:
    @staticmethod
    def build_graph(prs: List[dict], repo_path: Optional[str] = None) -> dict:
        """
        Return {nodes, edges, stacks, roots}.

        `repo_path` enables the ancestry check; without it only the explicit
        base-branch relationship is detected.
        """
        by_head: Dict[str, dict] = {}
        for pr in prs:
            head = pr.get("headRefName")
            if head:
                by_head[head] = pr

        nodes, edges = [], []
        for pr in prs:
            number = pr.get("number")
            nodes.append({
                "pr_number": number,
                "title": pr.get("title"),
                "head": pr.get("headRefName"),
                "base": pr.get("baseRefName"),
                "repo_name": pr.get("repo_name"),
            })

            # Signal 1: this PR targets another PR's branch.
            parent = by_head.get(pr.get("baseRefName"))
            if parent and parent.get("number") != number:
                edges.append({
                    "child": number,
                    "parent": parent.get("number"),
                    "kind": "explicit",
                    "reason": f"base branch is {pr.get('baseRefName')}",
                })

        if repo_path:
            edges.extend(DependencyService._ancestry_edges(prs, repo_path, edges))

        return {
            "nodes": nodes,
            "edges": edges,
            "stacks": DependencyService.stacks(nodes, edges),
            "roots": DependencyService._roots(nodes, edges),
        }

    @staticmethod
    def _ancestry_edges(prs: List[dict], repo_path: str, existing: List[dict]) -> List[dict]:
        """Signal 2: A's head is an ancestor of B's head."""
        known = {(e["child"], e["parent"]) for e in existing}
        found = []

        for child in prs:
            for parent in prs:
                c_num, p_num = child.get("number"), parent.get("number")
                if c_num == p_num or (c_num, p_num) in known:
                    continue
                try:
                    if GitService.is_ancestor(
                        repo_path, GitService.pr_ref(p_num), GitService.pr_ref(c_num)
                    ):
                        found.append({
                            "child": c_num, "parent": p_num, "kind": "ancestry",
                            "reason": f"#{p_num} is contained in #{c_num}",
                        })
                except GitServiceError as exc:
                    logger.debug("Ancestry check %s→%s skipped: %s", p_num, c_num, exc)
        return found

    @staticmethod
    def _roots(nodes: List[dict], edges: List[dict]) -> List[int]:
        children = {e["child"] for e in edges}
        return [n["pr_number"] for n in nodes if n["pr_number"] not in children]

    @staticmethod
    def stacks(nodes: List[dict], edges: List[dict]) -> List[List[int]]:
        """
        Linear merge chains, parent first.

        Only chains of length > 1 are returned; a lone PR is not a stack.
        """
        parent_of: Dict[int, int] = {}
        for edge in edges:
            # A PR with two parents is not a linear stack; keep the first.
            parent_of.setdefault(edge["child"], edge["parent"])

        children_of: Dict[int, List[int]] = {}
        for child, parent in parent_of.items():
            children_of.setdefault(parent, []).append(child)

        all_numbers = [n["pr_number"] for n in nodes]
        roots = [n for n in all_numbers if n not in parent_of]

        chains = []
        for root in roots:
            chain, current, guard = [root], root, 0
            # `guard` prevents an infinite loop if the data ever contains a cycle.
            while current in children_of and guard < len(all_numbers):
                current = children_of[current][0]
                chain.append(current)
                guard += 1
            if len(chain) > 1:
                chains.append(chain)
        return chains

    @staticmethod
    def merge_order(
        nodes: List[dict],
        edges: List[dict],
        collisions: Optional[List[dict]] = None,
        mode: str = "topological"
    ) -> List[int]:
        """
        Merge order calculation supporting three strategies:
        - 'topological': Strict parent-before-child ordering.
        - 'degree': Least file collisions first.
        - 'hybrid': Topological dependency constraints preserved + ready nodes sorted by lowest conflict degree.
        """
        numbers = [n["pr_number"] for n in nodes]
        
        # Calculate conflict degree per PR number if collisions provided
        degree: Dict[int, int] = {n: 0 for n in numbers}
        if collisions:
            for c in collisions:
                pr_a = c.get("pr_a")
                pr_b = c.get("pr_b")
                if pr_a in degree:
                    degree[pr_a] += 1
                if pr_b in degree:
                    degree[pr_b] += 1

        if mode == "degree":
            return sorted(numbers, key=lambda n: (degree.get(n, 0), n))

        parents: Dict[int, set] = {n: set() for n in numbers}
        for edge in edges:
            if edge["child"] in parents and edge["parent"] in parents:
                parents[edge["child"]].add(edge["parent"])

        ordered, remaining = [], dict(parents)
        while remaining:
            ready = [n for n, ps in remaining.items() if not (ps - set(ordered))]
            if not ready:
                # Cycle: emit the rest deterministically rather than looping.
                ordered.extend(sorted(remaining))
                break

            if mode == "hybrid":
                ready_sorted = sorted(ready, key=lambda n: (degree.get(n, 0), n))
            else:
                ready_sorted = sorted(ready)

            ordered.extend(ready_sorted)
            for n in ready_sorted:
                remaining.pop(n)
        return ordered

    @staticmethod
    def filter_stack_false_positives(collisions: List[dict], edges: List[dict]) -> List[dict]:
        """
        Drop file collisions between PRs in the same stack.

        A stacked PR necessarily touches its parent's files. Reporting that as a
        collision is the single largest source of noise in the Collision Matrix.
        """
        related = {(e["parent"], e["child"]) for e in edges}
        related |= {(c, p) for p, c in related}

        filtered = []
        for collision in collisions:
            prs = [p.get("pr_number") for p in collision.get("prs", [])]
            pairs = [(a, b) for i, a in enumerate(prs) for b in prs[i + 1:]]
            if pairs and all(pair in related for pair in pairs):
                continue
            filtered.append(collision)
        return filtered
