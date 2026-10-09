import pytest
from fastapi.testclient import TestClient

import database
from config import settings
from routers.prs import _prs_cache
from services.merge_train_service import MergeTrainService


def test_merge_train_service_empty():
    res = MergeTrainService.simulate_train([], repo_name="acme/repo")
    assert res["status"] == "empty"
    assert res["total_prs"] == 0
    assert res["can_publish_staging"] is False


def test_merge_train_offline_simulation(monkeypatch):
    monkeypatch.setattr(settings, "GIT_MERGE_ENABLED", False)

    prs = [
        {"number": 201, "title": "Feature A", "author": "alice", "repo_name": "acme/repo"},
        {"number": 202, "title": "Feature B", "author": "bob", "repo_name": "acme/repo"},
    ]

    res = MergeTrainService.simulate_train(prs, repo_name="acme/repo")
    assert res["status"] == "clean"
    assert res["total_prs"] == 2
    assert res["clean_count"] == 2
    assert len(res["steps"]) == 2
    assert res["clean_prs"] == [201, 202]
    assert res["can_publish_staging"] is True


def test_merge_train_endpoints(client, monkeypatch):
    monkeypatch.setattr(settings, "GIT_MERGE_ENABLED", False)

    pr_sample = {
        "number": 888,
        "id_str": "PR #888",
        "url": "https://github.com/acme/repo/pull/888",
        "title": "Train Car #1",
        "status": "Open",
        "summary": "Merge train candidate",
        "type": "New Feature",
        "subtype": "Core Logic",
        "current_status": "Review Required",
        "risk": "Low",
        "risk_detail": "Low risk",
        "risk_score": 1,
        "rec_action": "Merge",
        "changed_files": 1,
        "additions": 10,
        "deletions": 2,
        "mergeable": "CLEAN",
        "author": "dev",
        "updated_at": "2026-08-08T00:00:00Z",
        "updated_rel": "Today",
        "created_at": "2026-08-08T00:00:00Z",
        "created_fmt": "Aug 8",
        "head_sha": "sha888",
        "headRefName": "feature/train-1",
        "repo_name": "acme/repo",
        "labels": []
    }
    database.save_prs([pr_sample], "acme/repo")
    _prs_cache["acme/repo#888"] = pr_sample

    # 1. Capability Status
    status_res = client.get("/api/merge-train/status")
    assert status_res.status_code == 200
    assert status_res.json()["enabled"] is False

    # 2. Simulate empty
    empty_res = client.post("/api/merge-train/simulate", json={"pr_numbers": []})
    assert empty_res.status_code == 400

    # 3. Simulate with PR
    sim_res = client.post(
        "/api/merge-train/simulate",
        json={"pr_numbers": [888], "repo_name": "acme/repo", "auto_order": True}
    )
    assert sim_res.status_code == 200
    result = sim_res.json()["result"]
    assert result["total_prs"] == 1
    assert result["clean_count"] == 1
    assert result["clean_prs"] == [888]
    assert len(result["steps"]) == 1

    # 4. Publish validation
    pub_err = client.post(
        "/api/merge-train/publish",
        json={"staging_branch": "", "final_commit": ""}
    )
    assert pub_err.status_code == 400
