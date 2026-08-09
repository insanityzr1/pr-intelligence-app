"""Phase 4: webhooks, jobs, write-back, dependency graph, auth."""

import hashlib
import hmac
import json

import pytest

import database
from config import settings
from routers.prs import _prs_cache
from services.dependency_service import DependencyService
from services.event_bus import EventBus
from services.writeback_service import WriteBackService


# ---- L4: webhooks -------------------------------------------------------

def _sign(body: bytes, secret: str) -> str:
    return "sha256=" + hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()


def test_webhook_rejects_bad_signature(client, monkeypatch):
    monkeypatch.setattr(settings, "GITHUB_WEBHOOK_SECRET", "s3cret")
    res = client.post(
        "/api/webhooks/github",
        content=json.dumps({"repository": {"full_name": "acme/alpha"}}),
        headers={"X-GitHub-Event": "pull_request", "X-Hub-Signature-256": "sha256=wrong"},
    )
    assert res.status_code == 401


def test_webhook_accepts_valid_signature(client, monkeypatch):
    monkeypatch.setattr(settings, "GITHUB_WEBHOOK_SECRET", "s3cret")
    body = json.dumps({"repository": {"full_name": "acme/alpha"}}).encode()
    res = client.post(
        "/api/webhooks/github",
        content=body,
        headers={
            "X-GitHub-Event": "pull_request",
            "X-Hub-Signature-256": _sign(body, "s3cret"),
        },
    )
    assert res.status_code == 200
    assert res.json()["status"] == "accepted"


def test_webhook_ignores_irrelevant_events(client, monkeypatch):
    """Uninteresting events must return 200, or GitHub retries them forever."""
    monkeypatch.setattr(settings, "GITHUB_WEBHOOK_SECRET", "")
    res = client.post(
        "/api/webhooks/github",
        content=json.dumps({"repository": {"full_name": "acme/alpha"}}),
        headers={"X-GitHub-Event": "star"},
    )
    assert res.status_code == 200
    assert res.json()["status"] == "ignored"


def test_events_status(client):
    res = client.get("/api/events/status")
    assert res.status_code == 200
    assert "subscribers" in res.json()


def test_event_bus_drops_for_slow_subscriber_without_blocking():
    """A stalled browser tab must never stall a webhook delivery."""
    bus = EventBus()
    queue = bus.subscribe()
    for _ in range(150):          # queue max is 100
        bus.publish("noise", {})
    assert queue.qsize() <= 100   # dropped, not blocked

    bus.unsubscribe(queue)
    assert bus.subscriber_count == 0


# ---- L5: job queue ------------------------------------------------------

def test_analyze_job_rejects_empty_list(client):
    res = client.post("/api/jobs/analyze", json={"pr_numbers": []})
    assert res.status_code == 400


def test_analyze_job_lifecycle(client):
    """A queued job returns immediately rather than blocking on N LLM calls."""
    res = client.post(
        "/api/jobs/analyze",
        json={"pr_numbers": [999999], "repo_name": "acme/alpha"},
    )
    assert res.status_code == 200
    job = res.json()["job"]
    assert job["total"] == 1
    assert job["status"] in ("queued", "running", "done", "completed_with_errors")
    # Internal bookkeeping stays off the API surface.
    assert "cancel_requested" not in job

    assert client.get(f"/api/jobs/{job['id']}").status_code == 200
    assert client.post(f"/api/jobs/{job['id']}/cancel").status_code == 200
    assert client.get("/api/jobs").status_code == 200


def test_unknown_job_404s(client):
    assert client.get("/api/jobs/not-a-job").status_code == 404


# ---- L6: write-back -----------------------------------------------------

def test_format_review_includes_all_sections():
    body = WriteBackService.format_review(42, {
        "code_quality_score": 88,
        "ai_summary": "Refactors the scheduler.",
        "architectural_impact": "Touches the job runner.",
        "breaking_changes": ["Removes legacy hook"],
        "security_risks": ["Unvalidated input"],
        "qa_test_scenarios": ["Run the scheduler twice"],
    })
    assert "88/100" in body
    assert "Refactors the scheduler." in body
    assert "Removes legacy hook" in body
    assert "Unvalidated input" in body
    assert "Run the scheduler twice" in body


def test_format_review_omits_empty_sections():
    body = WriteBackService.format_review(42, {"ai_summary": "Small fix."})
    assert "Breaking changes" not in body
    assert "Security risks" not in body


def test_label_from_tag_strips_emoji():
    assert WriteBackService._label_from_tag("⭐ Starred") == "Starred"
    assert WriteBackService._label_from_tag("Needs QA") == "Needs QA"


def test_merge_sequence_dry_run_does_not_merge():
    """Destructive-by-omission is unacceptable; dry run is the default."""
    result = WriteBackService.merge_sequence([1, 2], "acme/alpha", dry_run=True)
    assert result["dry_run"] is True
    assert result["merged"] == []
    assert [p["pr_number"] for p in result["planned"]] == [1, 2]


def _cache_pr(number, repo_name="acme/alpha"):
    """
    A complete PR row.

    `_prs_cache` is shared process state and `GET /api/prs` validates every entry
    against PRSummaryItem, so a partial fixture here fails an unrelated test
    later in the run.
    """
    pr = {
        "number": number, "id_str": f"PR #{number}", "url": "https://example/pr",
        "title": f"PR {number}", "status": "Open", "summary": "s",
        "type": "Enhancement", "subtype": "Core Logic",
        "current_status": "Review Required", "risk": "Low",
        "risk_detail": "Small Change", "risk_score": 1, "rec_action": "Review Code",
        "changed_files": 1, "additions": 1, "deletions": 0, "mergeable": "MERGEABLE",
        "author": "a", "updated_at": "2026-08-09T00:00:00Z", "updated_rel": "Today",
        "created_at": "2026-08-09T00:00:00Z", "created_fmt": "Aug 9",
        "head_sha": f"sha{number}", "repo_name": repo_name, "labels": [],
    }
    _prs_cache[f"{repo_name}#{number}"] = pr
    return pr


def test_review_comment_requires_an_existing_review(client):
    _cache_pr(7001)
    res = client.post("/api/writeback/review-comment",
                      json={"pr_number": 7001, "repo_name": "acme/alpha"})
    assert res.status_code == 400
    assert "analysis" in res.json()["detail"].lower()


# ---- L7: dependency graph ----------------------------------------------

def _pr(number, head, base):
    return {"number": number, "headRefName": head, "baseRefName": base,
            "repo_name": "acme/alpha", "title": f"PR {number}"}


def test_detects_explicit_stack():
    prs = [
        _pr(1, "feature/a", "main"),
        _pr(2, "feature/b", "feature/a"),   # stacked on #1
        _pr(3, "feature/c", "main"),
    ]
    graph = DependencyService.build_graph(prs)

    assert {(e["child"], e["parent"]) for e in graph["edges"]} == {(2, 1)}
    assert graph["stacks"] == [[1, 2]]
    assert sorted(graph["roots"]) == [1, 3]


def test_merge_order_is_topological():
    """Unlike the build simulation's degree sort, a stack edge is directed."""
    prs = [
        _pr(3, "feature/c", "feature/b"),
        _pr(2, "feature/b", "feature/a"),
        _pr(1, "feature/a", "main"),
    ]
    graph = DependencyService.build_graph(prs)
    order = DependencyService.merge_order(graph["nodes"], graph["edges"])
    assert order.index(1) < order.index(2) < order.index(3)


def test_no_stack_when_all_target_main():
    prs = [_pr(1, "feature/a", "main"), _pr(2, "feature/b", "main")]
    graph = DependencyService.build_graph(prs)
    assert graph["edges"] == []
    assert graph["stacks"] == []


def test_stack_collisions_are_filtered_out():
    """
    A stacked PR necessarily touches its parent's files. Reporting that as a
    collision was the biggest source of noise in the Collision Matrix.
    """
    edges = [{"child": 2, "parent": 1, "kind": "explicit", "reason": ""}]
    collisions = [
        {"filepath": "a.py", "prs": [{"pr_number": 1}, {"pr_number": 2}]},   # stack
        {"filepath": "b.py", "prs": [{"pr_number": 1}, {"pr_number": 9}]},   # real
    ]
    kept = DependencyService.filter_stack_false_positives(collisions, edges)
    assert [c["filepath"] for c in kept] == ["b.py"]


# ---- L8: auth -----------------------------------------------------------

def test_api_is_open_when_no_key_configured(client, monkeypatch):
    monkeypatch.setattr(settings, "API_KEY", "")
    assert client.get("/api/repos").status_code == 200


def test_api_key_is_enforced_when_configured(client, monkeypatch):
    monkeypatch.setattr(settings, "API_KEY", "topsecret")

    assert client.get("/api/repos").status_code == 401
    assert client.get("/api/repos", headers={"X-API-Key": "wrong"}).status_code == 401
    assert client.get("/api/repos", headers={"X-API-Key": "topsecret"}).status_code == 200
    assert client.get("/api/repos", headers={"Authorization": "Bearer topsecret"}).status_code == 200


def test_health_and_webhooks_stay_reachable_with_auth_on(client, monkeypatch):
    """Probes must not need the key, and GitHub cannot send a custom header."""
    monkeypatch.setattr(settings, "API_KEY", "topsecret")
    monkeypatch.setattr(settings, "GITHUB_WEBHOOK_SECRET", "")

    assert client.get("/health").status_code == 200
    assert client.get("/api/version").status_code == 200
    res = client.post(
        "/api/webhooks/github",
        content=json.dumps({"repository": {"full_name": "acme/alpha"}}),
        headers={"X-GitHub-Event": "star"},
    )
    assert res.status_code == 200
