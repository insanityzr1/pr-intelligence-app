import React, { useEffect, useState } from 'react';
import { analyzePRs, addPRTag, fetchGroups, addPrsToGroup } from '../api/client';
import { useToast } from './ToastProvider';
import { prNumberOf } from '../utils/prStats';

const PRESET_TAGS = ['⭐ Starred', '🚀 Must Review', '🧪 Needs QA', '⏳ Waiting on Author', '🚫 Blocked'];

/**
 * Floating action bar for multi-select in the PR matrix.
 *
 * Actions are grouped by repository before dispatch, because the tag, analyze,
 * and group endpoints are all repo-scoped.
 */
export default function BulkActionBar({ selectedPrs, onClear, onTagsChanged }) {
  const toast = useToast();
  const [groups, setGroups] = useState([]);
  const [busy, setBusy] = useState(false);
  const [menu, setMenu] = useState(null); // 'tag' | 'workspace' | null

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetchGroups();
        if (!cancelled) setGroups(res?.groups || []);
      } catch (err) {
        console.error(err);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (selectedPrs.length === 0) return null;

  function byRepo() {
    const map = {};
    for (const pr of selectedPrs) {
      const repo = pr.repo_name;
      if (!map[repo]) map[repo] = [];
      map[repo].push(prNumberOf(pr));
    }
    return map;
  }

  async function runBulk(label, fn) {
    setBusy(true);
    setMenu(null);
    try {
      await fn();
      toast.success(`${label} for ${selectedPrs.length} PR${selectedPrs.length === 1 ? '' : 's'}.`);
    } catch (err) {
      console.error(err);
      toast.error(`${label} failed: ${err.message}`);
    } finally {
      setBusy(false);
    }
  }

  const handleAnalyze = () => runBulk('AI review queued', async () => {
    for (const [repo, nums] of Object.entries(byRepo())) {
      await analyzePRs(nums, true, repo);
    }
  });

  const handleTag = (tag) => runBulk(`Tagged "${tag}"`, async () => {
    for (const pr of selectedPrs) {
      await addPRTag(prNumberOf(pr), tag, pr.repo_name);
    }
    onTagsChanged?.();
  });

  const handleAddToWorkspace = (groupId, groupName) => runBulk(`Added to "${groupName}"`, async () => {
    for (const [repo, nums] of Object.entries(byRepo())) {
      await addPrsToGroup(Number(groupId), nums, repo);
    }
  });

  return (
    <div className="bulk-action-bar" role="region" aria-label="Bulk actions">
      <span className="bulk-count">
        <strong>{selectedPrs.length}</strong> selected
      </span>

      <div className="bulk-actions">
        <button className="btn btn-primary" onClick={handleAnalyze} disabled={busy}>
          ⚡ Batch AI Review
        </button>

        <div className="bulk-menu-wrapper">
          <button
            className="btn btn-secondary"
            onClick={() => setMenu(menu === 'tag' ? null : 'tag')}
            disabled={busy}
            aria-expanded={menu === 'tag'}
          >
            🏷️ Tag
          </button>
          {menu === 'tag' && (
            <div className="bulk-menu">
              {PRESET_TAGS.map(tag => (
                <button key={tag} className="bulk-menu-item" onClick={() => handleTag(tag)}>
                  {tag}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="bulk-menu-wrapper">
          <button
            className="btn btn-secondary"
            onClick={() => setMenu(menu === 'workspace' ? null : 'workspace')}
            disabled={busy}
            aria-expanded={menu === 'workspace'}
          >
            📦 Add to Workspace
          </button>
          {menu === 'workspace' && (
            <div className="bulk-menu">
              {groups.length === 0 ? (
                <div className="bulk-menu-empty">No workspaces yet.</div>
              ) : (
                groups.map(g => (
                  <button
                    key={g.group_id}
                    className="bulk-menu-item"
                    onClick={() => handleAddToWorkspace(g.group_id, g.name)}
                  >
                    {g.name}
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        <button className="btn btn-link-sm" onClick={onClear} disabled={busy}>
          Clear
        </button>
      </div>
    </div>
  );
}
