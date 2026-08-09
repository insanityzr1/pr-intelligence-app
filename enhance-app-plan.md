# PR & Build Intelligence App — Enhancement Plan

> Working branch: `plan/enhance-app` (branched from `main`).

## Context

> **Status: Phases 1–4 complete**, apart from the deliberately-deferred part of L8
> (per-user auth + migrations). The finding below describes the app as it was *before*
> Phase 3; the merge engine now exists.

The app's purpose is to help high-velocity teams assemble **builds** ("PR Workspaces") by
selecting PRs and seeing merge conflicts. An audit of the backend and frontend found that
the core promise was not actually implemented, and that several visible counters and
renderers were reading field names the API never returns.

**The central finding: nothing in the codebase ever executed git.** Two disconnected
conflict subsystems existed, and neither merged anything:

1. `backend/services/conflict_service.py` — a file-path overlap heuristic ("N PRs touch
   this file"). No hunk overlap, no mergeability.
2. `backend/services/conflict_resolution_service.py` — LLM prose over a truncated diff.
   Its `.patch` output was a comment header plus the model's prose, so `git apply` rejected it.

Everything else was GitHub's `mergeable` flag, which answers *"does this PR merge into
base?"* — never *"do these 6 PRs merge into each other?"*, which is the only question a
build actually asks. **Phase 3 (`services/git_service.py`) answers it by running a real
merge.**

---

## Large features (deep work)

| # | Feature | Summary |
|---|---------|---------|
| **L1** | **Real git merge engine** ✅ | Bare mirror clone + `git merge-tree --write-tree` (no working tree). True PR↔PR conflicts with real file paths, a genuinely appliable `.patch`, and real conflict markers fed to the LLM. |
| **L2** | **Workspace as candidate build** ✅ | Pairwise conflict matrix, cumulative merge simulation ("PRs 1–4 clean; adding #1874 breaks against #1902"), suggested merge order. |
| **L3** | **Release-readiness gate** ✅ | Ingests `statusCheckRollup` / `reviewDecision` (never requested before). Ship blockers per workspace: failing CI, unapproved, conflicting, draft. |
| **L4** | **Event-driven freshness** ✅ | HMAC-verified GitHub webhooks + background sync loop + SSE push, replacing manual-only "Sync PRs Now". |
| **L5** | **Async job queue for AI ops** ✅ | Queued batch review with live progress, per-PR errors, and cooperative cancellation. |
| **L6** | **Write-back to GitHub** ✅ | AI reviews as PR comments, tags → labels, ordered workspace merges (dry-run by default). |
| **L7** | **PR dependency / stacked-PR graph** ✅ | Explicit-base *and* ancestry detection; topological merge order; filters stack false positives out of the Collision Matrix. |
| **L8** | **Auth & data model** ◐ | Optional shared-secret API key (done). Per-user OAuth, workspace ownership, and Alembic migrations deliberately deferred — see Phase 4 notes. |

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

### ✅ Phase 3 — The product (COMPLETE)

Goal: make the app actually do what it claims — merge PRs and report what breaks.

#### L1 — Real git merge engine

`backend/services/git_service.py`. Maintains a bare mirror clone per repo
(`git clone --bare --filter=blob:none`, incremental fetch behind a TTL) and merges with
**`git merge-tree --write-tree`**, which performs a full merge in the object database —
no working tree, no checkout, no index.

- PR heads are fetched from `refs/pull/*/head`, so PRs from forks work without adding remotes.
- `GITHUB_TOKEN` is now a real setting; when unset it falls back to `gh auth token`, so
  existing `gh auth login` installs keep working.
- Conflict markers are extracted from the merged tree and handed to the AI resolver, which
  previously reasoned over a truncated slice of the PR diff that **never contained the
  conflict at all** — it was inferring one.

Two non-obvious things this required, both found by testing rather than assumption:

1. **`merge-tree` rejects a bare tree** ("expected commit type"). Sequential simulation
   therefore commits each intermediate result with `git commit-tree`, which also gives the
   accumulated build correct ancestry — exactly what a real merge queue does.
2. **A bad ref and a real conflict both exit 1**, so the exit code alone cannot tell a
   typo'd branch from a genuine collision. Both refs are now validated up front.

#### L2 — Workspace as candidate build

`backend/services/build_service.py` + `POST /api/build/simulate`, rendered by
`BuildPanel.jsx` on the Workspaces tab.

- **Cumulative simulation** — merges the set one PR at a time onto the base and reports
  which PR breaks the accumulated build.
- **Pairwise conflict matrix** — every unordered pair merged against each other, so the
  report names *which two PRs* collide and on which files. Capped by
  `GIT_MAX_PAIRWISE_PRS` (O(n²) merges), and the UI says when it was skipped.
- **Suggested merge order** — sorted by conflict degree, least-entangled first, so most of
  the set can land before the tangled remainder is resolved. Deliberately *not* a
  topological sort: conflict pairs are undirected, so there is no true dependency order.
- Simulation is per-repository; merging PRs from different repos into one tree is meaningless.

#### L3 — Release-readiness gate

`gh pr list --json` now requests `statusCheckRollup`, `reviewDecision`, `reviewRequests`,
and `assignees` — none of which were previously fetched, so the app was blind to CI and
approvals, the two things that actually gate a release.

`POST /api/build/readiness` returns ship blockers in one verdict: failing CI (naming the
checks), changes requested, awaiting approval, still-draft, and PRs that fail the merge
simulation. Pending CI is a *warning*, not a blocker — it may still go green. A
`shippable_with_review` flag distinguishes "only approvals outstanding" from "the build is
broken." `CIBadge` surfaces per-PR state in both the matrix and the workspace table.

#### Acceptance test — passed

The stated proof was that a generated `.patch` must pass `git apply --check`; the old
implementation emitted LLM prose that `git apply` rejected outright. Verified end-to-end
against a scratch repo:

```
each-into-main mergeable: [True, True, True]   <-- what the old app showed
SET clean: False  merged: ['#1', '#3']  blocked: ['#2']
colliding pair: [('#1', '#2', ['shared.txt'])]
suggested order: ['#3', '#1', '#2']
GIT_APPLY_CHECK = OK
```

That first line is the whole point: three PRs that are each individually mergeable into
`main`, which the app previously reported as three green rows, do **not** merge as a set.

**Verification:** backend `46 passed`, frontend `45 passed` across 12 files,
`run_tests.py` clean, build clean. `test_git_service.py` builds real repositories on disk
and runs real merges — deliberately unmocked, since the whole defect being fixed was that
conflict detection never executed git.

### ✅ Phase 4 — Scale & adoption (COMPLETE)

Goal: stop being a read-only, manually-refreshed single-user tool.

#### L4 — Event-driven freshness

`services/event_bus.py`, `services/sync_service.py`, `routers/events.py`.

- **HMAC-verified webhooks** at `POST /api/webhooks/github`. Irrelevant events return
  **200, not 4xx** — GitHub retries failures, and we are not interested in `star`.
  Signature comparison is constant-time; `==` on a secret leaks it byte by byte.
- **SSE** at `GET /api/events`. Chosen over websockets because every message is
  server→client. A full subscriber queue **drops** rather than blocks — a stalled browser
  tab must never stall a webhook delivery.
- **Background reconciliation loop** (`SYNC_INTERVAL_SECONDS`, 0 = off) owned by a FastAPI
  `lifespan`, which the app previously had no equivalent of, so there was nowhere to cancel
  background work on reload.
- The header now shows a **live/offline dot**, so "nothing changed" is distinguishable from
  "the stream is down".

#### L5 — Async job queue for AI ops

`services/job_service.py` + `routers/jobs.py`. Batch review is queued and returns
immediately, with live progress, per-PR errors, and **cooperative** cancellation (checked
between PRs, so an in-flight LLM call is not abandoned half-written). Blocking calls run via
`asyncio.to_thread` so SSE and the API stay responsive.

The old blocking version also **never refreshed after finishing**, so results stayed
invisible until a manual sync; the SSE handler now reloads on completion.

#### L6 — Write-back to GitHub

`services/writeback_service.py` + `routers/writeback.py`. Post AI reviews as comments, sync
tags to labels, and merge a workspace in the computed order. `merge_sequence` is **dry-run
by default** and **aborts at the first failure** — once one merge fails, every later merge
targets a base the simulation never modelled.

#### L7 — Stacked-PR dependency graph

`services/dependency_service.py` + `routers/dependencies.py`. Two independent signals:
explicit base-branch targeting, and **commit ancestry** (which survives a retarget onto
`main`, where the explicit signal is lost).

Produces a genuinely **topological** merge order — unlike L2's degree-based ordering, a
stack edge is directed, so merging a child before its parent is simply wrong. Also filters
stack false positives out of the Collision Matrix: a stacked PR necessarily touches its
parent's files, which was the largest source of noise there.

#### L8 — Auth (partial)

`services/auth_service.py`. Optional shared-secret API key, **disabled by default** so
existing installs are unaffected. `/health`, `/api/version`, and the webhook route stay
open — probes must work, and GitHub cannot send a custom header (it authenticates with its
own HMAC instead).

**Deliberately not done:** per-user GitHub OAuth, workspace ownership, and Alembic
migrations. A shared secret closes the "anyone on the LAN can drive this" hole; real
multi-tenancy needs a user model, and inventing half a login flow would be worse than
either option. See *Remaining work* below.

#### Two bugs caught by testing, not by reading

1. **`POST /api/jobs/analyze` was a sync `def`**, so FastAPI ran it in a threadpool where
   there is no running event loop and `asyncio.create_task` raises. This would have failed
   in production exactly as it failed in the test.
2. **Test pollution surfaced only in the full-suite run.** A partial PR fixture in
   `test_phase4.py` entered the shared `_prs_cache`, and `GET /api/prs` validates every
   entry against `PRSummaryItem` — so an unrelated test failed later in the run while
   `pytest backend/tests/test_phase4.py` alone stayed green.

**Verification:** backend `66 passed`, frontend `56 passed` across 14 files,
`run_tests.py` clean, build clean.

---

## Verification

```bash
python -m pytest backend/tests -v      # backend
cd frontend && npm test -- --run       # frontend
python run_tests.py                    # unified runner
cd frontend && npm run build           # production build
```

Current totals: backend **66 passed**, frontend **56 passed** across 14 files.

## Remaining work

Everything in the original roadmap is done except these, all deliberately deferred:

- **L8 (rest)** — per-user GitHub OAuth, workspace ownership/sharing, Alembic migrations,
  Postgres path. Needs a real user model; a shared secret already closes the open-network hole.
- **Multi-worker deployment** — `_prs_cache`, the event bus, and the job queue are all
  per-process. Correct for the current single-worker setup; a second worker needs Redis
  pub/sub and a durable queue behind the same interfaces.
- **Cost/token accounting** for AI calls (listed under L5 originally, not built).
- **Shared-symbol coupling** in the dependency graph (L7 detects branch and ancestry
  relationships, not "these PRs both change this exported function").

Frontend suites still missing: `App`, `WorkspaceModal`, `ConflictMap`,
`ConflictResolverModal`, `RepoManagerModal`, `TopHeader`, `Modal`. `TopHeader` and `App`
search are the highest-value additions given the bugs Phase 1 found in both; `Modal`'s
focus trap and the URL-state hook are the highest-value additions from Phase 2.

### ✅ Manual verification — Phase 2 (2026-08-09)

All five behaviors that tests did not cover were verified against the **built production
frontend** served same-origin by FastAPI, driven through a real browser with 15 real open
PRs from `cli/cli`:

| Behavior | Result |
|---|---|
| Back closes the drawer (does not exit the app) | ✅ `history.length` 4→5 on open; Back reverted the URL and kept the app mounted |
| `?tab=workspaces&repo=cli/cli` restores state | ✅ tab active, repo selector set |
| Shift-click selects a contiguous range | ✅ 4 rows selected, bulk bar showed "4 selected" |
| `?` opens the shortcuts overlay, Esc closes it | ✅ `role="dialog"`, `aria-modal`, focus trapped and restored |
| Deep link against the built frontend | ✅ deep path → 200 (`index.html`); `/api/nonexistent` → 404 |

No console errors. Noted as intended behavior, not a bug: `?` does nothing while focus is
in a text field, because the shortcut handler deliberately ignores `input`/`textarea`/
`select`.

### Manual checks for Phase 4 (not covered by tests)

Needs a live GitHub repo and a public tunnel:

- Point a real GitHub webhook at `/api/webhooks/github` with `GITHUB_WEBHOOK_SECRET` set;
  push to a PR and confirm the matrix updates **without a manual sync**.
- Watch the header dot go offline when the backend restarts, and back to live on reconnect.
- Queue a batch AI review over 10+ PRs and confirm progress streams, then cancel mid-run.
- Post an AI review to a real PR and confirm the markdown renders correctly on GitHub.
- Run `merge-sequence` with `dry_run: true`, confirm nothing merges, then verify the abort
  behavior on a set where the second PR cannot merge.
- Set `API_KEY` and confirm the SPA still loads while `/api/*` returns 401 without the key.

### Manual checks for Phase 3 (not covered by tests)

The merge engine is covered by real on-disk git tests, but these need a live repo:

- Run a build simulation on a workspace whose PRs genuinely conflict — the panel should
  name the colliding pair and the file.
- Download the patch from a clean simulation and confirm `git apply --check` accepts it
  against the real base branch.
- Confirm the first simulation on a large repo clones the mirror (slow) and the second is
  fast (fetch inside `GIT_FETCH_TTL`).
- Point at a PR from a **fork** — it should still merge, via `refs/pull/*/head`.
- Set `GIT_MERGE_ENABLED=false` and confirm the panel explains itself rather than silently
  reporting "no conflicts".
