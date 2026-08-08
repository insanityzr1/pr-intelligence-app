import database

def test_repositories_crud():
    initial_repos = database.get_repositories()
    assert len(initial_repos) >= 1

    # Add repository
    new_repos = database.add_repository("test/sample-repo")
    repo_names = [r["repo_name"] for r in new_repos]
    assert "test/sample-repo" in repo_names

    # Delete repository
    remaining_repos = database.delete_repository("test/sample-repo")
    remaining_names = [r["repo_name"] for r in remaining_repos]
    assert "test/sample-repo" not in remaining_names

def test_prs_caching():
    prs_sample = [
        {
            "number": 101,
            "title": "Fix auth error",
            "author": "dev1",
            "head_sha": "abc1234",
            "status": "Open",
            "summary": "Fix authentication header token parsing",
            "type": "Bug Fix",
            "subtype": "Authentication",
            "current_status": "Review Required",
            "risk": "Low",
            "risk_detail": "Low risk",
            "risk_score": 10,
            "rec_action": "Merge",
            "changed_files": 2,
            "additions": 15,
            "deletions": 5,
            "mergeable": "CLEAN",
            "url": "https://github.com/org/repo/pull/101",
            "updated_at": "2026-08-08T00:00:00Z",
            "updated_rel": "Today",
            "created_at": "2026-08-08T00:00:00Z",
            "created_fmt": "Aug 8",
            "labels": []
        }
    ]
    database.save_prs(prs_sample, "rpnunez/wp-ai-scheduler")
    cached = database.get_cached_prs("rpnunez/wp-ai-scheduler")
    assert len(cached) == 1
    assert cached[0]["number"] == 101
    assert cached[0]["title"] == "Fix auth error"

def test_ai_review_caching():
    pr_num = 202
    sha = "def5678"
    review_data = {"code_quality_score": 90, "ai_summary": "Great refactoring"}

    database.save_ai_review(pr_num, sha, review_data)
    fetched = database.get_cached_ai_review(pr_num, sha)
    assert fetched is not None
    assert fetched["code_quality_score"] == 90
    assert fetched["ai_summary"] == "Great refactoring"

    # Mismatched SHA should return None
    mismatched = database.get_cached_ai_review(pr_num, "wrong_sha")
    assert mismatched is None

def test_pr_chats_crud():
    pr_num = 303
    repo = "rpnunez/wp-ai-scheduler"

    database.add_pr_chat_message(pr_num, repo, "user", "What changed?")
    database.add_pr_chat_message(pr_num, repo, "assistant", "Refactored options handling.")

    history = database.get_pr_chat_history(pr_num, repo)
    assert len(history) == 2
    assert history[0]["role"] == "user"
    assert history[0]["message"] == "What changed?"
    assert history[1]["role"] == "assistant"

def test_pr_tags_crud():
    pr_num = 404
    repo = "rpnunez/wp-ai-scheduler"

    tags1 = database.add_pr_tag(pr_num, repo, "⭐ Starred")
    assert "⭐ Starred" in tags1

    tags2 = database.add_pr_tag(pr_num, repo, "🚀 Must Review")
    assert "🚀 Must Review" in tags2

    all_map = database.get_all_pr_tags_map()
    assert f"{repo}#{pr_num}" in all_map
    assert len(all_map[f"{repo}#{pr_num}"]) == 2

    tags_after_del = database.remove_pr_tag(pr_num, repo, "⭐ Starred")
    assert "⭐ Starred" not in tags_after_del
    assert "🚀 Must Review" in tags_after_del

def test_pr_groups_crud():
    # Create group
    group = database.create_group("Release v3.0", "Sprint release bucket")
    g_id = group["group_id"]
    assert g_id > 0

    groups = database.get_groups()
    assert any(g["name"] == "Release v3.0" for g in groups)

    # Add items to group
    database.add_prs_to_group(g_id, [101, 102], "rpnunez/wp-ai-scheduler")
    items = database.get_group_items(g_id)
    assert len(items) == 2
    item_nums = [i["pr_number"] for i in items]
    assert 101 in item_nums
    assert 102 in item_nums

    # Remove one item
    items_after_remove = database.remove_pr_from_group(g_id, 101, "rpnunez/wp-ai-scheduler")
    assert len(items_after_remove) == 1
    assert items_after_remove[0]["pr_number"] == 102

    # Delete group
    database.delete_group(g_id)
    groups_after_del = database.get_groups()
    assert not any(g["group_id"] == g_id for g in groups_after_del)

def test_changelogs_crud():
    log = database.save_changelog(
        title="Release Notes (PR #101)",
        pr_numbers=[101],
        branches=["feature/auth", "main"],
        markdown="# Release v1.0\n- Fix auth error"
    )
    c_id = log["id"]
    assert c_id > 0

    all_logs = database.get_changelogs()
    assert len(all_logs) >= 1
    assert all_logs[0]["id"] == c_id
    assert all_logs[0]["pr_numbers"] == [101]

    database.delete_changelog(c_id)
    remaining = database.get_changelogs()
    assert not any(l["id"] == c_id for l in remaining)
