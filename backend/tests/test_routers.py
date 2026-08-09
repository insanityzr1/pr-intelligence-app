import database
from routers.prs import _prs_cache

def test_get_prs_endpoint(client):
    pr_sample = {
        "number": 505,
        "id_str": "PR #505",
        "url": "https://github.com/org/repo/pull/505",
        "title": "Update dependencies",
        "status": "Open",
        "summary": "Update internal package specs",
        "type": "Enhancement",
        "subtype": "Dependencies",
        "current_status": "Review Required",
        "risk": "Low",
        "risk_detail": "Low risk",
        "risk_score": 5,
        "rec_action": "Merge",
        "changed_files": 1,
        "additions": 2,
        "deletions": 1,
        "mergeable": "CLEAN",
        "author": "dependabot",
        "updated_at": "2026-08-08T00:00:00Z",
        "updated_rel": "Today",
        "created_at": "2026-08-08T00:00:00Z",
        "created_fmt": "Aug 8",
        "head_sha": "sha505",
        "repo_name": "rpnunez/wp-ai-scheduler",
        "labels": []
    }
    database.save_prs([pr_sample], "rpnunez/wp-ai-scheduler")
    _prs_cache["rpnunez/wp-ai-scheduler#505"] = pr_sample

    res = client.get("/api/prs")
    assert res.status_code == 200
    prs = res.json()
    assert len(prs) >= 1
    assert any(p["number"] == 505 for p in prs)

def test_get_pr_detail_endpoint(client):
    pr_sample = {
        "number": 606,
        "id_str": "PR #606",
        "url": "https://github.com/org/repo/pull/606",
        "title": "Refactor database queries",
        "status": "Open",
        "summary": "Optimize SQLite query indexes",
        "type": "Refactor",
        "subtype": "Database",
        "current_status": "Review Required",
        "risk": "Low",
        "risk_detail": "Low risk",
        "risk_score": 8,
        "rec_action": "Merge",
        "changed_files": 2,
        "additions": 20,
        "deletions": 10,
        "mergeable": "CLEAN",
        "author": "rpnunez",
        "updated_at": "2026-08-08T00:00:00Z",
        "updated_rel": "Today",
        "created_at": "2026-08-08T00:00:00Z",
        "created_fmt": "Aug 8",
        "head_sha": "sha606",
        "repo_name": "rpnunez/wp-ai-scheduler",
        "labels": []
    }
    database.save_prs([pr_sample], "rpnunez/wp-ai-scheduler")
    _prs_cache["rpnunez/wp-ai-scheduler#606"] = pr_sample

    res = client.get("/api/prs/606")
    assert res.status_code == 200
    detail = res.json()
    assert detail["number"] == 606
    assert detail["title"] == "Refactor database queries"

def test_pr_chat_endpoints(client):
    pr_sample = {
        "number": 707,
        "title": "Fix memory leak",
        "author": "dev",
        "head_sha": "sha707",
        "repo_name": "rpnunez/wp-ai-scheduler"
    }
    database.save_prs([pr_sample], "rpnunez/wp-ai-scheduler")
    _prs_cache["rpnunez/wp-ai-scheduler#707"] = pr_sample

    post_res = client.post("/api/prs/707/chat", json={"message": "What is the memory fix?"})
    assert post_res.status_code == 200
    data = post_res.json()
    assert "history" in data
    assert len(data["history"]) >= 2

    get_res = client.get("/api/prs/707/chat")
    assert get_res.status_code == 200
    h_data = get_res.json()
    assert len(h_data["history"]) >= 2

def test_pr_conflict_endpoints(client):
    pr_sample = {
        "number": 808,
        "title": "Conflicting feature",
        "author": "dev",
        "head_sha": "sha808",
        "repo_name": "rpnunez/wp-ai-scheduler"
    }
    database.save_prs([pr_sample], "rpnunez/wp-ai-scheduler")
    _prs_cache["rpnunez/wp-ai-scheduler#808"] = pr_sample

    res = client.get("/api/prs/808/resolve-conflicts")
    assert res.status_code == 200
    info = res.json()["conflict_info"]
    assert "resolution_steps" in info

    bash_res = client.get("/api/prs/808/conflict-bash-script")
    assert bash_res.status_code == 200
    assert "#!/usr/bin/env bash" in bash_res.text

def test_tags_endpoints(client):
    add_res = client.post("/api/prs/909/tags", json={"tag": "⭐ Starred", "repo_name": "rpnunez/wp-ai-scheduler"})
    assert add_res.status_code == 200
    assert "⭐ Starred" in add_res.json()["tags"]

    all_res = client.get("/api/tags")
    assert all_res.status_code == 200
    tags_map = all_res.json()["tags_map"]
    assert "rpnunez/wp-ai-scheduler#909" in tags_map

    del_res = client.delete("/api/prs/909/tags/%E2%AD%90%20Starred?repo_name=rpnunez/wp-ai-scheduler")
    assert del_res.status_code == 200
    assert "⭐ Starred" not in del_res.json()["tags"]

def test_groups_endpoints(client):
    create_res = client.post("/api/groups", json={"name": "Sprint 4", "description": "Sprint 4 tasks"})
    assert create_res.status_code == 200
    g_id = create_res.json()["group"]["group_id"]

    item_res = client.post(f"/api/groups/{g_id}/items", json={"pr_numbers": [101, 102]})
    assert item_res.status_code == 200
    assert len(item_res.json()["items"]) == 2

    list_res = client.get("/api/groups")
    assert list_res.status_code == 200
    assert any(g["group_id"] == g_id for g in list_res.json()["groups"])

    del_res = client.delete(f"/api/groups/{g_id}")
    assert del_res.status_code == 200

def test_changelog_endpoints(client):
    pr_sample = {
        "number": 1001,
        "title": "Implement caching",
        "type": "Enhancement",
        "subtype": "Performance",
        "author": "rpnunez",
        "head_sha": "sha1001",
        "headRefName": "feature/caching",
        "baseRefName": "main",
        "summary": "Add Redis caching"
    }
    database.save_prs([pr_sample], "rpnunez/wp-ai-scheduler")
    _prs_cache["rpnunez/wp-ai-scheduler#1001"] = pr_sample

    gen_res = client.post("/api/changelog", json={"pr_numbers": [1001]})
    assert gen_res.status_code == 200
    c_data = gen_res.json()
    c_id = c_data["id"]
    assert c_id > 0
    assert "#1001" in c_data["title"]

    list_res = client.get("/api/changelog")
    assert list_res.status_code == 200
    assert any(l["id"] == c_id for l in list_res.json()["changelogs"])

    del_res = client.delete(f"/api/changelog/{c_id}")
    assert del_res.status_code == 200

def test_auxiliary_endpoints(client):
    conf_res = client.get("/api/conflicts")
    assert conf_res.status_code == 200
    assert "collisions" in conf_res.json()

    repos_res = client.get("/api/repos")
    assert repos_res.status_code == 200
    assert "repositories" in repos_res.json()

    export_res = client.get("/api/export/csv")
    assert export_res.status_code == 200
    assert "text/csv" in export_res.headers["content-type"]


def test_ops_endpoints(client):
    health = client.get("/health")
    assert health.status_code == 200
    assert health.json()["status"] == "ok"

    version = client.get("/api/version")
    assert version.status_code == 200
    assert "version" in version.json()


def test_spa_catch_all_does_not_shadow_api(client):
    """Unknown /api paths must still 404, not silently return index.html."""
    assert client.get("/api/definitely-not-a-route").status_code == 404


def test_export_honors_filters(client):
    """The CSV export used to ignore every filter and dump all repositories."""
    low = {
        "number": 3001, "id_str": "PR #3001", "url": "u", "title": "Low risk change",
        "status": "Open", "summary": "s", "type": "Enhancement", "subtype": "Core Logic",
        "current_status": "Review Required", "risk": "Low", "risk_detail": "Small Change",
        "risk_score": 1, "rec_action": "Review Code", "changed_files": 1, "additions": 1,
        "deletions": 0, "mergeable": "MERGEABLE", "author": "a",
        "updated_at": "2026-08-08T00:00:00Z", "updated_rel": "Today",
        "created_at": "2026-08-08T00:00:00Z", "created_fmt": "Aug 8",
        "head_sha": "sha3001", "repo_name": "acme/alpha", "labels": [],
    }
    high = {**low, "number": 3002, "id_str": "PR #3002", "title": "High risk change",
            "risk": "High", "head_sha": "sha3002", "repo_name": "acme/beta"}

    _prs_cache["acme/alpha#3001"] = low
    _prs_cache["acme/beta#3002"] = high

    body = client.get("/api/export/csv?risk=High").text
    assert "High risk change" in body
    assert "Low risk change" not in body

    body = client.get("/api/export/csv?repo_name=acme/alpha").text
    assert "Low risk change" in body
    assert "High risk change" not in body

    payload = client.get("/api/export/json?repo_name=acme/beta").json()
    assert payload["count"] == 1
    assert payload["prs"][0]["number"] == 3002

    md = client.get("/api/export/markdown?risk=High").text
    assert "#3002" in md


def test_changelog_accepts_group_id(client):
    """`group_id` was declared on the request model but never read."""
    pr = {
        "number": 4001, "title": "Grouped change", "type": "Enhancement",
        "subtype": "Core Logic", "author": "a", "head_sha": "sha4001",
        "headRefName": "feature/x", "baseRefName": "main", "summary": "s",
        "repo_name": "acme/alpha",
    }
    _prs_cache["acme/alpha#4001"] = pr

    group = client.post("/api/groups", json={"name": "Grouped Release", "description": ""}).json()
    gid = group["group"]["group_id"]
    client.post(f"/api/groups/{gid}/items", json={"pr_numbers": [4001], "repo_name": "acme/alpha"})

    res = client.post("/api/changelog", json={"pr_numbers": [], "group_id": gid})
    assert res.status_code == 200
    assert res.json()["pr_numbers"] == [4001]
