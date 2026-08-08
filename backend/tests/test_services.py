import json
import subprocess

import pytest

from services.ai_service import AIService
from services.conflict_resolution_service import ConflictResolutionService
from services.github_service import (
    GitHubService,
    GitHubServiceError,
    clean_text,
    extract_summary,
)
from services.changelog_service import ChangelogService
from services.diff_parser import DiffParser

def test_ai_service_heuristic_analysis():
    pr_data = {
        "number": 101,
        "title": "Refactor admin template rendering",
        "author": "rpnunez",
        "changed_files": 3,
        "additions": 45,
        "deletions": 20
    }
    diff_excerpt = "--- a/admin.php\n+++ b/admin.php\n@@ -1,5 +1,5 @@\n-echo 'old';\n+echo 'new';"
    
    result = AIService.analyze_pr(pr_data, diff_excerpt)
    assert "code_quality_score" in result
    assert "ai_summary" in result
    assert "architectural_impact" in result
    assert "qa_test_scenarios" in result
    assert isinstance(result["code_quality_score"], int)

def test_ai_service_chat_response():
    pr_data = {
        "number": 101,
        "title": "Fix memory leak in planner",
        "author": "rpnunez",
        "summary": "Optimize caching layer"
    }
    diff_text = "--- a/planner.php\n+++ b/planner.php"

    ans1 = AIService.chat_response(pr_data, diff_text, "How can I resolve conflicts?")
    assert "Conflict" in ans1 or "rebase" in ans1.lower()

    ans2 = AIService.chat_response(pr_data, diff_text, "Write unit tests for this PR")
    assert "Test" in ans2 or "php" in ans2.lower()

def test_conflict_resolution_service():
    pr_data = {
        "number": 1874,
        "title": "Refactor template rendering",
        "repo_name": "rpnunez/wp-ai-scheduler",
        "headRefName": "feature/admin-refactor",
        "baseRefName": "main"
    }
    diff_text = """
<<<<<<< HEAD
$class = 'old-class';
=======
$class = 'new-class';
>>>>>>> feature/admin-refactor
"""
    resolution = ConflictResolutionService.resolve_conflicts(pr_data, diff_text)
    assert "resolution_steps" in resolution
    assert "conflict_cause" in resolution
    assert len(resolution["resolution_steps"]) > 0
    
    bash_script = ConflictResolutionService.generate_bash_script(1874, resolution)
    assert "#!/usr/bin/env bash" in bash_script
    assert "git fetch origin" in bash_script

    patch_text = ConflictResolutionService.generate_patch(1874, resolution)
    assert "AI Conflict Resolution Patch" in patch_text

def test_github_service_helpers():
    text = clean_text("Fix bug in   scheduler:\n\nresolve race condition")
    assert text == "Fix bug in scheduler: resolve race condition"

    summary = extract_summary("This PR resolves race conditions in cron execution.", "Fix bug")
    assert "resolves race condition" in summary


def test_fetch_pr_files_parses_gh_json(monkeypatch):
    """File paths come from `gh pr view --json files`, not from re-parsing the diff."""
    captured = {}

    def fake_run(cmd, **kwargs):
        captured["cmd"] = cmd
        return subprocess.CompletedProcess(
            cmd, 0,
            stdout=json.dumps({"files": [
                {"path": "backend/database.py"},
                {"path": "frontend/src/App.jsx"},
                {"path": "backend/database.py"},  # duplicates collapse
            ]}),
            stderr="",
        )

    monkeypatch.setattr(subprocess, "run", fake_run)

    files = GitHubService.fetch_pr_files(1874, repo_name="acme/widgets")
    assert files == ["backend/database.py", "frontend/src/App.jsx"]
    assert captured["cmd"][:5] == ["gh", "pr", "view", "1874", "--json"]
    assert "--repo" in captured["cmd"] and "acme/widgets" in captured["cmd"]


def test_fetch_pr_diff_raises_instead_of_fabricating(monkeypatch):
    """
    A failed `gh` call must surface as an error. It previously returned a fake
    "-old code / +new code" diff that was fed to the LLM as if it were real.
    """
    def fake_run(cmd, **kwargs):
        raise subprocess.CalledProcessError(1, cmd, stderr="no such PR")

    monkeypatch.setattr(subprocess, "run", fake_run)

    with pytest.raises(GitHubServiceError):
        GitHubService.fetch_pr_diff(999, repo_name="acme/widgets")

    with pytest.raises(GitHubServiceError):
        GitHubService.fetch_pr_files(999, repo_name="acme/widgets")

def test_changelog_service():
    selected_prs = [
        {
            "number": 101,
            "title": "Add telemetry logging",
            "type": "New Feature",
            "subtype": "Telemetry",
            "author": "rpnunez",
            "summary": "Add subsystem telemetry logs"
        },
        {
            "number": 102,
            "title": "Fix SQL injection vulnerability",
            "type": "Bug Fix",
            "subtype": "Security",
            "author": "security_dev",
            "summary": "Sanitize query params"
        }
    ]

    changelog_out = ChangelogService.generate_changelog(selected_prs)
    assert "markdown" in changelog_out
    assert "# Release Notes" in changelog_out["markdown"]
    assert "#101" in changelog_out["markdown"]
    assert "#102" in changelog_out["markdown"]

def test_diff_parser():
    diff_raw = """diff --git a/includes/class-aips-config.php b/includes/class-aips-config.php
index abc..def 100644
--- a/includes/class-aips-config.php
+++ b/includes/class-aips-config.php
@@ -10,3 +10,4 @@ class AIPS_Config {
+    public function get_version() { return '2.9.1'; }
"""
    parsed = DiffParser.prepare_diff_context(diff_raw)
    assert isinstance(parsed, str)
