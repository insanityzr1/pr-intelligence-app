"""
Real git operations against a bare mirror clone.

Everything the app previously called "conflict detection" was either GitHub's
`mergeable` flag (PR-vs-base only) or a same-file-touched heuristic. Neither
answers the question a release build actually asks: *do these N PRs merge into
each other?* This module answers it by running an actual merge.

`git merge-tree --write-tree` performs a full merge entirely in the object
database — no working tree, no checkout, no index — so merges are cheap and safe
to run concurrently. It exits 0 for a clean merge and 1 when conflicts exist,
writing the resulting tree OID either way. Requires git >= 2.38.
"""

import logging
import os
import re
import shutil
import subprocess
import time
from typing import Dict, List, Optional

from config import settings

logger = logging.getLogger(__name__)

MIN_GIT_VERSION = (2, 38)


class GitServiceError(RuntimeError):
    """Raised when a git operation fails. Callers should surface this, not mask it."""


class GitUnavailableError(GitServiceError):
    """Raised when git is missing or too old for `merge-tree --write-tree`."""


# Fetch timestamps per mirror, so a burst of merge simulations does not refetch
# the remote once per pair.
_last_fetch: Dict[str, float] = {}


def _run(cmd: List[str], cwd: Optional[str] = None, check: bool = True, binary: bool = False):
    """Run a git command, raising GitServiceError with stderr on failure."""
    try:
        result = subprocess.run(
            cmd,
            cwd=cwd,
            capture_output=True,
            check=False,
            **({} if binary else {"text": True, "encoding": "utf-8", "errors": "replace"}),
        )
    except FileNotFoundError as exc:
        raise GitUnavailableError("git is not installed or not on PATH.") from exc

    if check and result.returncode != 0:
        stderr = (result.stderr or b"" if binary else result.stderr or "")
        if binary:
            stderr = stderr.decode("utf-8", "replace")
        raise GitServiceError(f"`{' '.join(cmd[:3])}...` failed: {stderr.strip()}")
    return result


class GitService:
    # ---- capability -----------------------------------------------------

    @staticmethod
    def git_version() -> tuple:
        out = _run(["git", "--version"]).stdout
        match = re.search(r"(\d+)\.(\d+)", out or "")
        return (int(match.group(1)), int(match.group(2))) if match else (0, 0)

    @staticmethod
    def ensure_supported():
        version = GitService.git_version()
        if version < MIN_GIT_VERSION:
            raise GitUnavailableError(
                f"git {version[0]}.{version[1]} is too old; "
                f"`merge-tree --write-tree` needs {MIN_GIT_VERSION[0]}.{MIN_GIT_VERSION[1]}+."
            )

    # ---- mirror management ----------------------------------------------

    @staticmethod
    def mirror_path(repo_name: str) -> str:
        safe = repo_name.replace("/", "__")
        return os.path.join(os.path.abspath(settings.GIT_MIRROR_DIR), f"{safe}.git")

    @staticmethod
    def _auth_url(repo_name: str) -> str:
        """
        Clone URL, with a token when one is available.

        There is no GITHUB_TOKEN anywhere in the original codebase — auth was
        entirely ambient via `gh auth login`. Reuse that token when the env var
        is unset so existing installs keep working.
        """
        token = settings.GITHUB_TOKEN
        if not token:
            try:
                result = subprocess.run(
                    ["gh", "auth", "token"], capture_output=True, text=True, check=False
                )
                if result.returncode == 0:
                    token = (result.stdout or "").strip()
            except FileNotFoundError:
                token = ""

        if token:
            return f"https://x-access-token:{token}@github.com/{repo_name}.git"
        return f"https://github.com/{repo_name}.git"

    @staticmethod
    def ensure_mirror(repo_name: str, force_fetch: bool = False) -> str:
        """
        Return the path to a bare mirror of `repo_name`, creating or refreshing
        it as needed. Fetches at most once per GIT_FETCH_TTL seconds.
        """
        GitService.ensure_supported()
        path = GitService.mirror_path(repo_name)
        os.makedirs(os.path.dirname(path), exist_ok=True)

        if not os.path.isdir(os.path.join(path, "objects")):
            logger.info("Creating bare mirror for %s at %s", repo_name, path)
            if os.path.exists(path):
                shutil.rmtree(path, ignore_errors=True)
            _run(["git", "clone", "--bare", "--filter=blob:none",
                  GitService._auth_url(repo_name), path])
            # PR heads live under refs/pull/<n>/head and are not fetched by
            # default. Without them there is no ref to merge for a PR whose
            # branch lives in a fork.
            _run(["git", "config", "--add", "remote.origin.fetch",
                  "+refs/pull/*/head:refs/pull/*/head"], cwd=path)
            _last_fetch[repo_name] = time.time()
            GitService._fetch(repo_name, path)
            return path

        age = time.time() - _last_fetch.get(repo_name, 0)
        if force_fetch or age > settings.GIT_FETCH_TTL:
            GitService._fetch(repo_name, path)
        return path

    @staticmethod
    def _fetch(repo_name: str, path: str):
        logger.info("Fetching %s", repo_name)
        # The URL is passed explicitly so a rotated token is picked up without
        # rewriting the stored remote.
        _run(["git", "fetch", "--prune", "--quiet",
              GitService._auth_url(repo_name),
              "+refs/heads/*:refs/heads/*",
              "+refs/pull/*/head:refs/pull/*/head"], cwd=path)
        _last_fetch[repo_name] = time.time()

    @staticmethod
    def pr_ref(pr_number: int) -> str:
        return f"refs/pull/{pr_number}/head"

    @staticmethod
    def base_ref(base_branch: str) -> str:
        return f"refs/heads/{base_branch}"

    @staticmethod
    def rev_parse(path: str, ref: str) -> str:
        """Resolve a ref to a commit OID, raising if it is missing or not a commit."""
        result = _run(["git", "rev-parse", "--verify", "--quiet", f"{ref}^{{commit}}"],
                      cwd=path, check=False)
        oid = (result.stdout or "").strip()
        if result.returncode != 0 or not oid:
            raise GitServiceError(f"Unknown ref '{ref}'.")
        return oid

    @staticmethod
    def commit_tree(path: str, tree: str, parents: List[str], message: str) -> str:
        """
        Wrap a merged tree in a real commit.

        `merge-tree` needs *commits* on both sides so it can find a merge base —
        feeding it a bare tree fails with "expected commit type". Sequential
        simulation therefore has to commit each intermediate result, which also
        gives the accumulated build correct ancestry (exactly what a real merge
        queue does).
        """
        cmd = ["git", "commit-tree", tree]
        for parent in parents:
            cmd += ["-p", parent]
        cmd += ["-m", message]
        env_run = subprocess.run(
            cmd, cwd=path, capture_output=True, text=True, encoding="utf-8", check=False,
            env={
                **os.environ,
                "GIT_AUTHOR_NAME": "PR Intelligence",
                "GIT_AUTHOR_EMAIL": "pr-intelligence@localhost",
                "GIT_COMMITTER_NAME": "PR Intelligence",
                "GIT_COMMITTER_EMAIL": "pr-intelligence@localhost",
            },
        )
        if env_run.returncode != 0:
            raise GitServiceError(f"commit-tree failed: {(env_run.stderr or '').strip()}")
        return (env_run.stdout or "").strip()

    # ---- merging ---------------------------------------------------------

    @staticmethod
    def merge_tree(path: str, left: str, right: str) -> dict:
        """
        Merge two refs (or tree-ish OIDs) in memory.

        Returns {clean, tree, conflicts: [{path, stages}], messages: [...]}.
        `tree` is written to the object DB even on conflict, so a conflicted
        merge can still be diffed and inspected.
        """
        # Validate both sides first: merge-tree exits 1 for an unmergeable ref
        # *and* for a genuine conflict, so the exit code alone cannot tell a
        # typo'd branch from a real collision.
        GitService.rev_parse(path, left)
        GitService.rev_parse(path, right)

        result = _run(
            ["git", "merge-tree", "--write-tree", "-z", "--name-only", left, right],
            cwd=path,
            check=False,
        )
        # 0 = clean, 1 = conflicts. Anything else is a real error.
        if result.returncode not in (0, 1):
            raise GitServiceError(
                f"merge-tree failed for {left}..{right}: {(result.stderr or '').strip()}"
            )
        if "not something we can merge" in (result.stderr or ""):
            raise GitServiceError(
                f"merge-tree could not merge {left}..{right}: {(result.stderr or '').strip()}"
            )

        clean = result.returncode == 0
        fields = (result.stdout or "").split("\0")
        tree = fields[0].strip() if fields else ""

        conflicts, messages = [], []
        if not clean:
            # With -z --name-only the payload is:
            #   <tree>NUL  <path>NUL...  NUL  <message records...>
            # and each message record is
            #   <path-count>NUL <path>*count NUL <type>NUL <message>NUL
            idx = 1
            seen = set()
            while idx < len(fields) and fields[idx] != "":
                path_name = fields[idx]
                if path_name and path_name not in seen:
                    seen.add(path_name)
                    conflicts.append({"path": path_name})
                idx += 1

            idx += 1  # skip the empty section separator
            while idx < len(fields):
                try:
                    count = int(fields[idx])
                except (ValueError, IndexError):
                    break
                paths = fields[idx + 1: idx + 1 + count]
                kind_at = idx + 1 + count
                message_at = kind_at + 1
                if message_at >= len(fields):
                    break
                messages.append({
                    "type": fields[kind_at],
                    "message": fields[message_at].strip(),
                    "paths": paths,
                })
                idx = message_at + 1

        return {"clean": clean, "tree": tree, "conflicts": conflicts, "messages": messages}

    @staticmethod
    def conflicted_files(path: str, left: str, right: str) -> List[str]:
        return [c["path"] for c in GitService.merge_tree(path, left, right)["conflicts"]]

    @staticmethod
    def conflict_markers(path: str, tree: str, file_path: str, max_lines: int = 200) -> str:
        """
        The conflicted content of one file from a merged tree, complete with
        `<<<<<<<` markers — the actual text the AI resolver should reason over,
        rather than a truncated slice of the PR diff.
        """
        try:
            blob = _run(["git", "show", f"{tree}:{file_path}"], cwd=path).stdout
        except GitServiceError:
            return ""
        lines = blob.splitlines()
        if len(lines) <= max_lines:
            return blob
        # Keep the region around the first conflict marker.
        start = next((i for i, l in enumerate(lines) if l.startswith("<<<<<<<")), 0)
        lo = max(0, start - 20)
        return "\n".join(lines[lo:lo + max_lines])

    @staticmethod
    def diff_patch(path: str, base: str, tree: str) -> str:
        """
        A real unified diff between a base commit and a merged tree.

        The previous `.patch` endpoint emitted a comment header plus LLM prose,
        which `git apply` rejects outright. This output is produced by git and
        passes `git apply --check`.
        """
        return _run(["git", "diff", base, tree], cwd=path).stdout

    # ---- build simulation ------------------------------------------------

    @staticmethod
    def simulate_sequence(path: str, base: str, heads: List[dict]) -> dict:
        """
        Merge `heads` onto `base` one at a time, in order.

        This is the question a PR Workspace is really asking: not "does each PR
        merge into main?" but "does this *set* of PRs merge together?" A PR can
        be individually mergeable and still break the build when combined with
        another.

        Each head is {"ref": str, "label": str}. Returns the accumulated tree
        plus a per-step record. A conflicting head is reported and skipped so
        the rest of the set is still evaluated.
        """
        base_commit = GitService.rev_parse(path, base)
        acc_commit = base_commit
        acc_tree = _run(["git", "rev-parse", f"{base_commit}^{{tree}}"], cwd=path).stdout.strip()
        steps, merged, blocked = [], [], []

        for head in heads:
            label = head.get("label")
            try:
                head_commit = GitService.rev_parse(path, head["ref"])
                result = GitService.merge_tree(path, acc_commit, head["ref"])
            except GitServiceError as exc:
                # An unreachable PR ref must not abort the whole simulation, and
                # must not be silently reported as "merges cleanly".
                logger.warning("Skipping %s in simulation: %s", label, exc)
                steps.append({
                    "label": label, "pr_number": head.get("pr_number"),
                    "repo_name": head.get("repo_name"), "clean": False,
                    "conflicts": [], "error": str(exc),
                })
                blocked.append(label)
                continue

            steps.append({
                "label": label,
                "pr_number": head.get("pr_number"),
                "repo_name": head.get("repo_name"),
                "clean": result["clean"],
                "conflicts": [c["path"] for c in result["conflicts"]],
            })

            if result["clean"]:
                # Commit the intermediate result so the next merge has a proper
                # merge base; merge-tree rejects a bare tree.
                acc_tree = result["tree"]
                acc_commit = GitService.commit_tree(
                    path, acc_tree, [acc_commit, head_commit],
                    f"simulated merge of {label or head['ref']}",
                )
                merged.append(label)
            else:
                blocked.append(label)

        return {
            "base": base,
            "base_commit": base_commit,
            "tree": acc_tree,
            "commit": acc_commit,
            "clean": not blocked,
            "steps": steps,
            "merged": merged,
            "blocked": blocked,
        }

    @staticmethod
    def pairwise_conflicts(path: str, base: str, heads: List[dict]) -> List[dict]:
        """
        Every unordered pair of heads, merged against each other.

        This is what tells a release manager *which two PRs* collide, rather
        than just that the set as a whole failed.
        """
        pairs = []
        for i in range(len(heads)):
            for j in range(i + 1, len(heads)):
                a, b = heads[i], heads[j]
                try:
                    result = GitService.merge_tree(path, a["ref"], b["ref"])
                except GitServiceError as exc:
                    logger.warning("Pairwise merge %s/%s failed: %s", a.get("label"), b.get("label"), exc)
                    continue
                if not result["clean"]:
                    pairs.append({
                        "a": a.get("label"),
                        "b": b.get("label"),
                        "a_pr": a.get("pr_number"),
                        "b_pr": b.get("pr_number"),
                        "files": [c["path"] for c in result["conflicts"]],
                    })
        return pairs

    @staticmethod
    def suggest_order(heads: List[dict], pairs: List[dict]) -> List[dict]:
        """
        Order heads so the least-entangled PRs merge first.

        Not a topological sort — conflict pairs are undirected, so there is no
        true dependency order. Sorting by conflict degree puts the clean PRs
        first, letting a release manager land most of the set before dealing
        with the tangled remainder.
        """
        degree = {h.get("label"): 0 for h in heads}
        for pair in pairs:
            degree[pair["a"]] = degree.get(pair["a"], 0) + 1
            degree[pair["b"]] = degree.get(pair["b"], 0) + 1
        return sorted(heads, key=lambda h: (degree.get(h.get("label"), 0), h.get("pr_number") or 0))
