"""
Tests for the real git merge engine.

These build actual repositories on disk and run real merges — no mocks. That is
the point: the whole reason this module exists is that the previous conflict
"detection" never executed git, so mocking git here would recreate the original
defect.
"""

import os
import subprocess
import pytest

from services.git_service import GitService, GitServiceError


def git(cwd, *args):
    return subprocess.run(
        ["git", *args], cwd=cwd, capture_output=True, text=True, check=True,
        encoding="utf-8",
    ).stdout


def commit_file(repo, name, content, message):
    with open(os.path.join(repo, name), "w", encoding="utf-8", newline="\n") as fh:
        fh.write(content)
    git(repo, "add", "-A")
    git(repo, "-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", message)


@pytest.fixture
def repo(tmp_path):
    """
    A repo with a base branch and three feature branches:
      feat-a / feat-b  -> both edit the same line of shared.txt (conflict)
      feat-c           -> adds an unrelated file (clean against everything)
    """
    path = str(tmp_path / "repo")
    os.makedirs(path)
    git(path, "init", "-q", "-b", "main")
    commit_file(repo=path, name="shared.txt", content="line1\nline2\nline3\n", message="base")

    git(path, "checkout", "-qb", "feat-a")
    commit_file(path, "shared.txt", "line1\nFROM-A\nline3\n", "a")

    git(path, "checkout", "-q", "main")
    git(path, "checkout", "-qb", "feat-b")
    commit_file(path, "shared.txt", "line1\nFROM-B\nline3\n", "b")

    git(path, "checkout", "-q", "main")
    git(path, "checkout", "-qb", "feat-c")
    commit_file(path, "unrelated.txt", "hello\n", "c")

    git(path, "checkout", "-q", "main")
    return path


def test_git_version_is_supported():
    GitService.ensure_supported()
    assert GitService.git_version() >= (2, 38)


def test_clean_merge_reports_clean(repo):
    result = GitService.merge_tree(repo, "main", "feat-c")
    assert result["clean"] is True
    assert result["conflicts"] == []
    assert len(result["tree"]) == 40


def test_conflicting_merge_names_the_file(repo):
    """The core capability: PR-vs-PR conflict detection with real file paths."""
    result = GitService.merge_tree(repo, "feat-a", "feat-b")
    assert result["clean"] is False
    assert [c["path"] for c in result["conflicts"]] == ["shared.txt"]
    # A tree is still written for a conflicted merge, so it can be inspected.
    assert len(result["tree"]) == 40
    assert any("CONFLICT" in m["type"] for m in result["messages"])


def test_conflict_markers_are_extractable(repo):
    """Real conflict markers, not a truncated slice of the PR diff."""
    result = GitService.merge_tree(repo, "feat-a", "feat-b")
    markers = GitService.conflict_markers(repo, result["tree"], "shared.txt")
    assert "<<<<<<<" in markers
    assert "FROM-A" in markers and "FROM-B" in markers
    assert ">>>>>>>" in markers


def test_generated_patch_actually_applies(repo, tmp_path):
    """
    The L1 acceptance test.

    The old `.patch` endpoint emitted a comment header plus LLM prose and would
    be rejected outright by `git apply`. A patch produced from a real merged
    tree must pass `git apply --check` against the base.
    """
    result = GitService.merge_tree(repo, "main", "feat-c")
    patch = GitService.diff_patch(repo, "main", result["tree"])

    assert patch.startswith("diff --git")

    patch_file = tmp_path / "change.patch"
    patch_file.write_text(patch, encoding="utf-8", newline="")

    git(repo, "checkout", "-q", "main")
    # Raises CalledProcessError if the patch is not appliable.
    git(repo, "apply", "--check", str(patch_file))


def test_sequence_simulation_isolates_the_breaking_pr(repo):
    """
    Two PRs that each merge cleanly into main still break as a set. This is the
    question a PR Workspace asks and `mergeable` cannot answer.
    """
    assert GitService.merge_tree(repo, "main", "feat-a")["clean"] is True
    assert GitService.merge_tree(repo, "main", "feat-b")["clean"] is True

    result = GitService.simulate_sequence(repo, "main", [
        {"ref": "feat-a", "label": "#1", "pr_number": 1},
        {"ref": "feat-c", "label": "#3", "pr_number": 3},
        {"ref": "feat-b", "label": "#2", "pr_number": 2},
    ])

    assert result["clean"] is False
    assert result["merged"] == ["#1", "#3"]
    assert result["blocked"] == ["#2"]
    breaking = next(s for s in result["steps"] if s["label"] == "#2")
    assert breaking["conflicts"] == ["shared.txt"]


def test_sequence_all_clean(repo):
    result = GitService.simulate_sequence(repo, "main", [
        {"ref": "feat-a", "label": "#1", "pr_number": 1},
        {"ref": "feat-c", "label": "#3", "pr_number": 3},
    ])
    assert result["clean"] is True
    assert result["blocked"] == []


def test_pairwise_matrix_identifies_the_colliding_pair(repo):
    heads = [
        {"ref": "feat-a", "label": "#1", "pr_number": 1},
        {"ref": "feat-b", "label": "#2", "pr_number": 2},
        {"ref": "feat-c", "label": "#3", "pr_number": 3},
    ]
    pairs = GitService.pairwise_conflicts(repo, "main", heads)

    assert len(pairs) == 1
    assert {pairs[0]["a"], pairs[0]["b"]} == {"#1", "#2"}
    assert pairs[0]["files"] == ["shared.txt"]


def test_suggest_order_puts_clean_prs_first(repo):
    heads = [
        {"ref": "feat-a", "label": "#1", "pr_number": 1},
        {"ref": "feat-b", "label": "#2", "pr_number": 2},
        {"ref": "feat-c", "label": "#3", "pr_number": 3},
    ]
    pairs = GitService.pairwise_conflicts(repo, "main", heads)
    order = [h["label"] for h in GitService.suggest_order(heads, pairs)]

    # #3 collides with nothing, so it should land before the tangled pair.
    assert order[0] == "#3"


def test_bad_ref_raises(repo):
    with pytest.raises(GitServiceError):
        GitService.merge_tree(repo, "main", "no-such-branch")
