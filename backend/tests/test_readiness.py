"""CI/review ingestion and the release-readiness gate (L3)."""

from services.github_service import summarize_checks
from services.build_service import BuildService


def test_summarize_checks_handles_check_runs():
    rollup = [
        {"name": "build", "status": "COMPLETED", "conclusion": "SUCCESS"},
        {"name": "lint", "status": "COMPLETED", "conclusion": "FAILURE"},
        {"name": "e2e", "status": "IN_PROGRESS", "conclusion": None},
    ]
    out = summarize_checks(rollup)
    assert out["state"] == "FAILING"
    assert out["passed"] == 1 and out["failed"] == 1 and out["pending"] == 1
    assert out["failed_names"] == ["lint"]


def test_summarize_checks_handles_legacy_status_contexts():
    """The rollup mixes CheckRun and StatusContext shapes; both must count."""
    rollup = [
        {"context": "ci/circleci", "state": "SUCCESS"},
        {"context": "ci/legacy", "state": "ERROR"},
    ]
    out = summarize_checks(rollup)
    assert out["state"] == "FAILING"
    assert out["passed"] == 1 and out["failed"] == 1
    assert out["failed_names"] == ["ci/legacy"]


def test_summarize_checks_skipped_counts_as_passing():
    out = summarize_checks([{"name": "optional", "status": "COMPLETED", "conclusion": "SKIPPED"}])
    assert out["state"] == "PASSING"


def test_summarize_checks_empty():
    assert summarize_checks(None)["state"] == "NONE"
    assert summarize_checks([])["state"] == "NONE"


def _pr(number, **kw):
    base = {
        "number": number, "repo_name": "acme/alpha", "title": f"PR {number}",
        "checks_state": "PASSING", "review_decision": "APPROVED", "status": "Open",
    }
    base.update(kw)
    return base


def test_readiness_all_green():
    result = BuildService.readiness([_pr(1), _pr(2)])
    assert result["ready"] is True
    assert result["blocker_count"] == 0


def test_readiness_reports_each_blocker_class():
    prs = [
        _pr(1, checks_state="FAILING", failed_checks=["lint"]),
        _pr(2, review_decision="CHANGES_REQUESTED"),
        _pr(3, review_decision="REVIEW_REQUIRED"),
        _pr(4, status="Draft"),
        _pr(5, checks_state="PENDING"),
    ]
    result = BuildService.readiness(prs)

    assert result["ready"] is False
    blockers = result["blockers"]
    assert [b["pr_number"] for b in blockers["failing_ci"]] == [1]
    assert blockers["failing_ci"][0]["failed_checks"] == ["lint"]
    assert [b["pr_number"] for b in blockers["changes_requested"]] == [2]
    assert [b["pr_number"] for b in blockers["unapproved"]] == [3]
    assert [b["pr_number"] for b in blockers["drafts"]] == [4]
    # Pending CI is a warning, not a hard blocker — it may still go green.
    assert [w["pr_number"] for w in result["warnings"]["pending_ci"]] == [5]


def test_readiness_folds_in_merge_conflicts():
    """A PR that fails the merge simulation is a ship blocker."""
    simulation = {"repos": [{"blocked": ["#2"], "merged": ["#1"]}]}
    result = BuildService.readiness([_pr(1), _pr(2)], simulation)

    assert result["ready"] is False
    assert [b["pr_number"] for b in result["blockers"]["conflicting"]] == [2]


def test_shippable_with_review_ignores_only_approvals():
    """Everything green except approvals: distinguishable from a broken build."""
    result = BuildService.readiness([_pr(1, review_decision="REVIEW_REQUIRED")])
    assert result["ready"] is False
    assert result["shippable_with_review"] is True

    broken = BuildService.readiness([_pr(1, checks_state="FAILING")])
    assert broken["shippable_with_review"] is False
