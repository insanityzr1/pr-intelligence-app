import json
import pytest
from fastapi.testclient import TestClient

import database
from config import settings
from routers.prs import _prs_cache
from services.ci_triage_service import CITriageService
from services.patch_service import PatchService


def test_truncate_log_error_clustering():
    long_log = "\n".join([f"Info line {i}" for i in range(100)])
    long_log += "\nERROR: AssertionError in test_runner.py at line 42\n"
    long_log += "\n".join([f"Trailing line {i}" for i in range(100)])

    truncated = CITriageService._truncate_log(long_log, max_lines=40)
    assert "AssertionError" in truncated
    assert "Truncated" in truncated


def test_heuristic_triage_categories():
    sample_pr = {"number": 101, "repo_name": "acme/repo", "head_sha": "abc1"}

    # 1. Lint
    lint_info = {"log": "flake8: F401 'os' imported but unused in app.py", "workflow": "CI"}
    triage = CITriageService._heuristic_triage(sample_pr, lint_info, "")
    assert triage["failure_category"] == "lint"
    assert "app.py" in triage["affected_files"]

    # 2. Type Error
    type_info = {"log": "mypy: Incompatible return value type (got int, expected str)", "workflow": "Typecheck"}
    triage = CITriageService._heuristic_triage(sample_pr, type_info, "")
    assert triage["failure_category"] == "type_error"

    # 3. Test Assertion
    test_info = {"log": "FAILED tests/test_app.py::test_calc - AssertionError: assert 1 == 2", "workflow": "Pytest"}
    triage = CITriageService._heuristic_triage(sample_pr, test_info, "")
    assert triage["failure_category"] == "test_assertion"

    # 4. Syntax Error
    syntax_info = {"log": "SyntaxError: invalid syntax in service.py line 12", "workflow": "Build"}
    triage = CITriageService._heuristic_triage(sample_pr, syntax_info, "")
    assert triage["failure_category"] == "build_failure"


def test_patch_service_helpers():
    patch_diff = "--- a/file.py\n+++ b/file.py\n@@ -1,2 +1,2 @@\n-old\n+new"
    assert PatchService.validate_patch(patch_diff) is True
    assert PatchService.validate_patch("invalid prose") is False

    cmd = PatchService.format_git_apply_command(55, "acme/repo", "feature/abc")
    assert "git checkout feature/abc" in cmd
    assert "/api/prs/55/download-patch" in cmd

    download_content = PatchService.format_patch_download(55, "acme/repo", patch_diff, "fix(ci): update file")
    assert "[PATCH] fix(ci): update file" in download_content
    assert "--- a/file.py" in download_content

    # Test apply_patch
    res = PatchService.apply_patch(
        repo_name="acme/repo",
        pr_number=55,
        head_ref="feature/abc",
        patch_text=patch_diff,
        commit_message="fix(ci): fix",
        action="push_to_pr"
    )
    assert res["status"] == "applied"
    assert res["target_branch"] == "feature/abc"


def test_ci_triage_endpoints(client):
    pr_sample = {
        "number": 777,
        "id_str": "PR #777",
        "url": "https://github.com/acme/repo/pull/777",
        "title": "Fix CI Pipeline test",
        "status": "Open",
        "summary": "Fix broken assertions",
        "type": "Bug Fix",
        "subtype": "Testing",
        "current_status": "Review Required",
        "risk": "Low",
        "risk_detail": "Low risk",
        "risk_score": 1,
        "rec_action": "Merge",
        "changed_files": 1,
        "additions": 5,
        "deletions": 2,
        "mergeable": "CLEAN",
        "author": "dev",
        "updated_at": "2026-08-08T00:00:00Z",
        "updated_rel": "Today",
        "created_at": "2026-08-08T00:00:00Z",
        "created_fmt": "Aug 8",
        "head_sha": "sha777",
        "headRefName": "fix/ci-tests",
        "repo_name": "acme/repo",
        "labels": []
    }
    database.save_prs([pr_sample], "acme/repo")
    _prs_cache["acme/repo#777"] = pr_sample

    # 1. Single PR triage with custom log
    log_sample = "FAILED test_api.py::test_status - AssertionError: assert 500 == 200"
    res = client.post(
        "/api/prs/777/ci-triage",
        json={"repo_name": "acme/repo", "custom_log": log_sample, "force": True}
    )
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "success"
    assert data["triage"]["failure_category"] == "test_assertion"
    assert "apply_command" in data
    assert "git checkout fix/ci-tests" in data["apply_command"]

    # 2. Verify cached retrieval
    cached = database.get_cached_ci_triage(777, "sha777", "acme/repo")
    assert cached is not None
    assert cached["failure_category"] == "test_assertion"

    # 3. Bulk triage endpoint
    bulk_res = client.post(
        "/api/prs/bulk/ci-triage",
        json={"pr_numbers": [777], "repo_name": "acme/repo"}
    )
    assert bulk_res.status_code == 200
    bulk_data = bulk_res.json()
    assert bulk_data["status"] == "success"
    assert len(bulk_data["results"]) == 1
    assert bulk_data["results"][0]["triage"]["pr_number"] == 777

    # 4. Apply fix endpoint
    fix_patch = "--- a/test_api.py\n+++ b/test_api.py\n@@ -1,2 +1,2 @@\n-assert 500 == 200\n+assert 200 == 200"
    apply_res = client.post(
        "/api/prs/777/apply-fix",
        json={
            "repo_name": "acme/repo",
            "action": "create_branch",
            "patch": fix_patch,
            "commit_message": "fix(tests): correct assertion"
        }
    )
    assert apply_res.status_code == 200
    assert apply_res.json()["result"]["target_branch"] == "patch/pr-777-ci-fix"

    # 5. Download patch endpoint
    dl_res = client.get("/api/prs/777/download-patch?repo_name=acme/repo")
    assert dl_res.status_code == 200
    assert "attachment; filename=pr-777-ci-fix.patch" in dl_res.headers.get("content-disposition", "")
    assert "[PATCH]" in dl_res.text
