# PR & Build Intelligence App — Enhancement Plan

> Working branch: `plan/enhance-app` (branched from `main`).

## Context

The app's purpose is to help high-velocity teams assemble **builds** ("PR Workspaces") by
selecting PRs and seeing merge conflicts. An audit of the backend and frontend found that
the core promise is not actually implemented, and that several visible counters and
renderers were reading field names the API never returns.

**The central finding: nothing in the codebase ever executes git.** Two disconnected
conflict subsystems exist, and neither merges anything:

1. `backend/services/conflict_service.py` — a file-path overlap heuristic ("N PRs touch
   this file"). No hunk overlap, no mergeability.
2. `backend/services/conflict_resolution_service.py` — LLM prose over a truncated diff.
   Its `.patch` output is a comment header plus the model's prose, so `git apply` rejects it.

Everything else is GitHub's `mergeable` flag, which answers *"does this PR merge into
base?"* — never *"do these 6 PRs merge into each other?"*, which is the only question a
build actually asks.

---

## Large features (deep work)

| # | Feature | Summary |
|---|---------|---------|
| **L1** | **Real git merge engine** | Bare mirror clone + `git merge-tree --write-tree` (no working tree). Gives true PR↔PR conflicts with file *and hunk* ranges, a genuinely appliable `.patch`, and real conflict markers to feed the LLM. Prerequisite for everything below. |
| **L2** | **Workspace as candidate build** | Pairwise conflict matrix for a workspace, cumulative merge simulation ("PRs 1–4 clean; adding #1874 breaks against #1902"), suggested merge order, live re-simulation as PRs are added. |
| **L3** | **Release-readiness gate** | Ingest `statusCheckRollup`, `reviewDecision`, `reviews` (currently not requested at all). Surface ship blockers per workspace: failing CI, unapproved, conflicting, stale. |
| **L4** | **Event-driven freshness** | GitHub webhooks + background sync worker + SSE push. Replaces manual "Sync PRs Now" and the per-process `_prs_cache` dict. |
| **L5** | **Async job queue for AI ops** | Per-PR job state, streamed progress, cancellation, cost/token accounting, cross-provider failover (today a single provider failure drops straight to heuristics). |
| **L6** | **Write-back to GitHub** | Post AI reviews as PR comments, sync tags ↔ labels, trigger merges in computed order, open a release-branch PR carrying the changelog. |
| **L7** | **PR dependency / stacked-PR graph** | Detect stacked branches and shared-symbol coupling; topological merge order. Today a stack is *misreported* as a conflict. |
| **L8** | **Multi-tenancy & data model** | Auth (none today; CORS is `*` with credentials, `HOST=0.0.0.0`), Alembic migrations, repo-scoped keys, Postgres path. |

## Quick wins

| # | Item | Status |
|---|------|--------|
| Q1 | Correctness bugs (wrong field names, cross-repo collisions) | ✅ done |
| Q2 | Surface conflicts in the matrix, workspaces, and PR picker | ✅ done |
| Q6 | Wire the finished-but-dead `DiffParser` into the AI call sites | ✅ done |
| Q7 | Use `gh pr view --json files` instead of re-parsing full diffs | ✅ done |
| Q8 | Remove fabricated-diff fallbacks; real errors + logging | ✅ done |
| Q3 | Bulk selection + bulk action bar in the PR matrix | ✅ done |
| Q4 | URL state / deep-linking (tab, repo, filters, open PR) | ✅ done |
| Q5 | Toast system, error surfacing, destructive-action confirms | ✅ done |
| Q9 | Cache conflict resolutions & chat by `head_sha`; add indexes | ✅ done |
| Q10 | Modal a11y: Esc, focus trap, `Cmd+K`, `j`/`k`, `?` overlay | ✅ done |
| Q11 | `useMemo` in `PRMatrix`; race protection on stale responses | ✅ done |
| Q12 | Honor export filters; `orderby` and `group_id` are silently dropped | ✅ done |
| Q13 | Refresh model IDs; implement-or-remove DeepSeek/Ollama; drop unused deps | ✅ done |
| Q14 | `/health`, SPA catch-all, CORS fix, CLI overrides under `uvicorn` | ✅ done |

---

## Phase status

### ✅ Phase 1 — Correctness & truthfulness (COMPLETE)

Goal: stop showing wrong numbers and stop feeding the LLM fabricated data, before
building anything on top.

- [x] **Shared PR selectors** — new [frontend/src/utils/prStats.js](frontend/src/utils/prStats.js)
      defines canonical `isConflicting` / `isHighRisk` / `prRefKey` / `tagKeyOf` helpers.
      `TopHeader` and `PRCommandBar` now compute KPIs from one source so they cannot drift.
- [x] **`FormattedMarkdown` bold bug** — `bPart.startswith` (lowercase `w`) was always
      `undefined`, so `**bold**` never rendered anywhere in the app. Fixed + regression test.
- [x] **`TopHeader` KPI mismatch** — read `conflicts_count` / `risk_level`, which the payload
      never carries; its Conflicts and High Risk chips were pinned at 0 while `PRCommandBar`
      showed real numbers.
- [x] **`ConflictMap` field mismatch** — read `file_path` / `conflicting_count` while the
      backend emits `filepath` / `overlapping_prs_count`; every collision card rendered an
      empty path and "undefined PR Collisions".
- [x] **`PRMatrix` field mismatches** — `updated_at_human`, `created_at_human`, and
      `risk_desc` do not exist in the payload (`updated_rel`, `created_fmt`, `risk_detail` do);
      those cells were blank.
- [x] **Global search** — filtered on `p.pr_number` and `p.tags`; the payload uses `number`
      and carries no tags. Now searches number (with `#1874` form), branches, and real tags
      loaded from `/api/tags`.
- [x] **Cross-repo collisions** — workspace/release items matched PRs on number alone.
      Selection and matching are now keyed `{repo}#{number}` end to end;
      `WorkspaceModal` emits fully-qualified `{repo_name, pr_number}` refs.
- [x] **`ai_reviews` primary key** — was `pr_number` alone, so PR #5 in one repo overwrote
      PR #5 in another. Now `(repo_name, pr_number)`, with an in-place migration
      (`_migrate_ai_reviews_key`) that attributes existing rows to `DEFAULT_REPO`.
- [x] **`PRAGMA foreign_keys = ON`** — the declared `pr_group_items → pr_groups` cascade was
      inert, so deleting a workspace orphaned its rows.
- [x] **Hardcoded `rpnunez/wp-ai-scheduler` fallbacks removed** from all source paths
      (4 frontend, 2 backend); only the config default and DB seed remain.
- [x] **`WorkspaceModal` reset bug** — the reset effect depended on an array the parent
      rebuilt every render, wiping the user's in-progress selection. Now keyed on a stable
      signature.
- [x] **Conflict surfacing (Q2)** — conflict badge + left rule on matrix rows, a workspace
      banner ("N of M staged PRs conflict"), and a badge in the PR picker. Previously you
      could stage six mutually-conflicting PRs with no warning anywhere.
- [x] **`DiffParser` wired in (Q6)** — production used `diff_text[:4000]` / `[:3500]`, cutting
      mid-hunk and dropping every file after the first; the finished chunking parser was dead
      code referenced only by tests. Now used by `AIService` (review + chat) and the conflict
      resolver.
- [x] **File lists via `gh pr view --json files` (Q7)** — was downloading the full diff per PR
      just to read `--- a/` lines, which dominated collision-matrix runtime.
- [x] **Fabricated-diff fallbacks removed (Q8)** — `fetch_pr_diff` returned a fake
      `-old code / +new code` diff on *any* error and `fetch_pr_files` invented `file_N.py`;
      both fed the LLM silently. Now raise `GitHubServiceError`, with `logging` replacing bare
      `print()`. `ConflictService` degrades per-PR and reports what it skipped, and the UI
      shows an "incomplete results" banner.
- [x] **`PRSummaryItem` fields** — `headRefName` / `baseRefName` / `body` were absent from the
      response model, so FastAPI stripped them from `GET /api/prs`; branch search and the
      picker's branch badge could never have worked.

**Verification:** backend `24 passed`, frontend `31 passed`, `npm run build` clean.
New tests cover repo-scoped AI-review caching, `gh --json files` parsing, the raise-don't-
fabricate contract, and the bold-rendering regression. Two existing tests were updated
where they asserted the old (incorrect) behavior.

### ✅ Phase 2 — Workflow & polish (COMPLETE)

Goal: make the app usable at volume and stop failures from being invisible.

- [x] **Bulk selection (Q3)** — checkbox column with shift-click ranges and
      select-all-filtered, plus a floating `BulkActionBar` (Batch AI Review, Tag,
      Add to Workspace). The matrix previously had no multi-select at all, so the
      primary tab could act on only one PR at a time. Actions are grouped by
      repository before dispatch, since the tag/analyze/group endpoints are all
      repo-scoped.
- [x] **URL state (Q4)** — new [frontend/src/hooks/useUrlState.js](frontend/src/hooks/useUrlState.js).
      Tab, repo, search, and the open PR live in the query string. Opening a PR
      pushes a history entry so **Back closes the drawer instead of exiting the
      app**; tab/repo/search use `replaceState` so Back does not step through
      every keystroke. No router dependency added.
- [x] **Toasts, errors, confirms (Q5)** — new
      [ToastProvider](frontend/src/components/ToastProvider.jsx) and
      [ErrorBoundary](frontend/src/components/ErrorBoundary.jsx). `api/client.js`
      gained an `apiError()` helper so FastAPI's `detail` reaches the user;
      previously 24 of 24 wrappers threw a hardcoded string and discarded the
      response body. Destructive actions (delete workspace / changelog / repo)
      now confirm, and the native `alert()` is gone. A failed PR load renders a
      distinct error state with Retry rather than the "no results" empty state.
- [x] **Conflict-resolution caching + indexes (Q9)** — all three conflict routes
      ran the *same* uncached LLM call, so viewing the resolver and downloading
      the script and patch cost three model round-trips for identical output.
      Now one cached `_conflict_info_for()` keyed on `head_sha` (`force=true` to
      bypass). Added six indexes; only implicit PK indexes existed before.
- [x] **A11y & keyboard (Q10)** — new [Modal](frontend/src/components/Modal.jsx)
      with `role="dialog"`, focus trap, focus restore, and Esc. Matrix rows are
      now `tabIndex=0` with Enter/Space handlers and `aria-sort` on sortable
      headers. Added `Cmd/Ctrl+K` and `/` to focus search, `j`/`k` row
      navigation, `x` to toggle selection, `Esc` to close the topmost overlay,
      and `?` for a shortcuts overlay.
- [x] **Performance & races (Q11)** — `PRMatrix` rebuilt six `Set`s, filtered,
      and full-array-sorted **on every render**, including every keystroke; all
      now memoized. `loadPrs` carries a request-id guard so a slow response for a
      previous repo cannot land over a newer one.
- [x] **Export & dropped params (Q12)** — `/api/export/csv` ignored every filter
      and dumped all repositories while serving `filtered_prs.csv`; it now takes
      seven filters, and JSON + Markdown exports were added. `orderby` was
      accepted, passed down, and never used (`gh pr list` has no such flag) — now
      honored by sorting the processed rows. `group_id` was declared on
      `ChangelogRequest` and never read — now sources the PR set from the workspace.
- [x] **Providers & config (Q13)** — model IDs were hardcoded in six places and
      are now configurable per provider; `DEEPSEEK_API_KEY` was read but never
      used and Ollama was advertised in `--help` but unimplemented — both are now
      real code paths. Ollama is excluded from `auto` (it needs no key, so
      "configured" cannot gate it) to keep the no-key path going straight to
      heuristics. Dropped `jinja2` and `sqlite3-to-mysql` (never imported).
- [x] **Ops hygiene (Q14)** — added `/health` and `/api/version`; added a SPA
      catch-all so deep links stop 404-ing in the production build; fixed CORS
      (`allow_origins=["*"]` with `allow_credentials=True` is rejected by
      browsers, so the old config granted neither) and made origins configurable;
      replaced `print()` with `logging`.

**One behavioral fix worth calling out:** CLI overrides were applied inside
`if __name__ == "__main__"`, so `uvicorn main:app --port 9000` silently ignored
every flag. They now apply at import time, using `parse_known_args` so foreign
argv (uvicorn's, pytest's) cannot abort startup. Verified directly:

```
$ python -c "import sys; sys.argv=['uvicorn','--port','9123']; import main; ..."
[CONFIG OVERRIDE] PORT = 9123 (via CLI flag)
```

**Verification:** backend `28 passed`, frontend `40 passed` across 11 files,
`python run_tests.py` clean, `npm run build` clean. New suites:
`BulkSelection.test.jsx` (5) and `ToastProvider.test.jsx` (4); new backend tests
cover the ops endpoints, the SPA catch-all not shadowing `/api`, export
filtering across all three formats, and `group_id`-sourced changelogs.

### ⬜ Phase 3 — The product (PENDING)

- [ ] L1 — Real git merge engine (`git merge-tree`)
- [ ] L2 — Workspace as candidate build
- [ ] L3 — Release-readiness gate

Nothing else in the large list should precede these. **Acceptance test for L1:** seed a
scratch repo with two genuinely conflicting branches and verify the generated `.patch`
passes `git apply --check` — the current implementation fails this, which is the cleanest
single proof the engine landed.

### ⬜ Phase 4 — Scale & adoption (PENDING)

- [ ] L4 — Webhooks, background sync, SSE
- [ ] L5 — Async job queue for AI ops
- [ ] L6 — Write-back to GitHub
- [ ] L7 — PR dependency / stacked-PR graph
- [ ] L8 — Multi-tenancy, auth, migrations

---

## Verification

```bash
python -m pytest backend/tests -v      # backend
cd frontend && npm test -- --run       # frontend
python run_tests.py                    # unified runner
cd frontend && npm run build           # production build
```

Frontend suites still missing: `App`, `WorkspaceModal`, `ConflictMap`,
`ConflictResolverModal`, `RepoManagerModal`, `TopHeader`, `Modal`. `TopHeader` and `App`
search are the highest-value additions given the bugs Phase 1 found in both; `Modal`'s
focus trap and the URL-state hook are the highest-value additions from Phase 2.

Manual checks worth doing before Phase 3, since they are not covered by tests:
- Open a PR, press **Back** — the drawer should close rather than leaving the app.
- Reload with `?tab=workspaces&repo=<owner/repo>` — state should be restored.
- Shift-click two rows in the matrix — the whole range should select.
- Press **?** — the shortcuts overlay should open, and **Esc** should close it.
- Deep-link to any non-`/api` path against the built frontend — it should serve the app,
  not a 404.
