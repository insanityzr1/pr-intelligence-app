import React, { useState, useEffect, useMemo } from 'react';
import { fetchGroups, createGroup, updateGroup, deleteGroup, fetchGroupItems, addPrsToGroup, removePrFromGroup, analyzePRs, generateChangelog } from '../api/client';
import FormattedMarkdown from './FormattedMarkdown';
import WorkspaceModal from './WorkspaceModal';
import { itemRefKey, prRefKey, isConflicting } from '../utils/prStats';
import { useToast } from './ToastProvider';

export default function StagingWorkspacesTab({ prs, onSelectPr }) {
  const toast = useToast();
  const [groups, setGroups] = useState([]);
  const [activeGroupId, setActiveGroupId] = useState(null);
  const [activeItems, setActiveItems] = useState([]);

  // Workspaces Directory Search & Sort
  const [workspaceSearch, setWorkspaceSearch] = useState('');
  const [workspaceSort, setWorkspaceSort] = useState('updated'); // 'updated', 'name', 'count'

  // Workspace PR Table Filter & Sort
  const [prTableSearch, setPrTableSearch] = useState('');
  const [prSortField, setPrSortField] = useState('number'); // 'number', 'title', 'status', 'risk'
  const [prSortAsc, setPrSortAsc] = useState(true);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalGroupTarget, setModalGroupTarget] = useState(null); // null = create mode, group object = edit mode

  // Batch Action States
  const [batchAnalyzing, setBatchAnalyzing] = useState(false);
  const [batchChangelog, setBatchChangelog] = useState(null);

  useEffect(() => {
    loadGroups();
  }, []);

  useEffect(() => {
    if (activeGroupId) {
      loadGroupItems(activeGroupId);
    } else {
      setActiveItems([]);
    }
  }, [activeGroupId]);

  async function loadGroups() {
    try {
      const data = await fetchGroups();
      const loaded = data.groups || [];
      setGroups(loaded);
      if (loaded.length > 0 && !activeGroupId) {
        setActiveGroupId(loaded[0].group_id);
      }
    } catch (err) {
      console.error(err);
    }
  }

  async function loadGroupItems(gId) {
    try {
      const data = await fetchGroupItems(gId);
      setActiveItems(data.items || []);
    } catch (err) {
      console.error(err);
    }
  }

  function handleOpenCreateModal() {
    setModalGroupTarget(null);
    setIsModalOpen(true);
  }

  function handleOpenEditModal(g, e) {
    if (e) e.stopPropagation();
    setModalGroupTarget(g);
    setIsModalOpen(true);
  }

  async function handleDeleteGroup(gId, e) {
    if (e) e.stopPropagation();

    // Deleting a workspace previously fired instantly with no confirmation and
    // no undo.
    const group = groups.find(g => g.group_id === gId);
    const confirmed = await toast.confirm({
      title: 'Delete workspace?',
      message: `"${group?.name || 'This workspace'}" and its staged PR list will be permanently removed. The pull requests themselves are not affected.`,
      confirmLabel: 'Delete Workspace',
    });
    if (!confirmed) return;

    try {
      await deleteGroup(gId);
      await loadGroups();
      if (activeGroupId === gId) {
        setActiveGroupId(null);
        setActiveItems([]);
      }
      toast.success(`Deleted "${group?.name || 'workspace'}".`);
    } catch (err) {
      console.error(err);
      toast.error(`Could not delete workspace: ${err.message}`);
    }
  }

  async function handleRemovePr(prNum, repoName) {
    if (!activeGroupId) return;
    try {
      await removePrFromGroup(activeGroupId, prNum, repoName);
      await loadGroupItems(activeGroupId);
      await loadGroups();
    } catch (err) {
      console.error(err);
    }
  }

  // Group fully-qualified {repo_name, pr_number} refs into one add-call per repo.
  function groupRefsByRepo(refs) {
    const byRepo = {};
    for (const ref of refs) {
      if (!ref?.repo_name) continue;
      if (!byRepo[ref.repo_name]) byRepo[ref.repo_name] = [];
      byRepo[ref.repo_name].push(ref.pr_number);
    }
    return byRepo;
  }

  async function handleSaveWorkspace({ group_id, name, description, selectedRefs = [] }) {
    try {
      let targetGId = group_id;
      if (group_id) {
        // Edit existing group
        await updateGroup(group_id, name, description);

        // Compute delta of PRs, keyed by (repo, number) so PR #42 in two different
        // repositories is treated as two distinct items.
        const existing = await fetchGroupItems(group_id);
        const currentItems = existing.items || [];
        const currentKeys = new Set(currentItems.map(itemRefKey));
        const selectedKeys = new Set(selectedRefs.map(itemRefKey));

        const addedRefs = selectedRefs.filter(r => !currentKeys.has(itemRefKey(r)));
        const removedItems = currentItems.filter(i => !selectedKeys.has(itemRefKey(i)));

        for (const [repo, nums] of Object.entries(groupRefsByRepo(addedRefs))) {
          await addPrsToGroup(group_id, nums, repo);
        }

        for (const item of removedItems) {
          await removePrFromGroup(group_id, item.pr_number, item.repo_name);
        }
      } else {
        // Create new group
        const res = await createGroup(name, description);
        targetGId = res.group?.group_id;

        if (targetGId && selectedRefs.length > 0) {
          for (const [repo, nums] of Object.entries(groupRefsByRepo(selectedRefs))) {
            await addPrsToGroup(targetGId, nums, repo);
          }
        }
      }

      await loadGroups();
      if (targetGId) {
        setActiveGroupId(targetGId);
        await loadGroupItems(targetGId);
      }
    } catch (err) {
      console.error(err);
      throw err;
    }
  }

  async function handleBatchAnalyze() {
    if (activeItems.length === 0) return;
    setBatchAnalyzing(true);
    try {
      // Analyze per repository so each batch carries the repo it belongs to.
      const byRepo = {};
      for (const item of activeItems) {
        if (!byRepo[item.repo_name]) byRepo[item.repo_name] = [];
        byRepo[item.repo_name].push(item.pr_number);
      }
      for (const [repo, nums] of Object.entries(byRepo)) {
        await analyzePRs(nums, true, repo);
      }
      toast.success(`Batch AI review complete for ${activeItems.length} PRs.`);
    } catch (err) {
      console.error(err);
      toast.error(`Batch AI review failed: ${err.message}`);
    } finally {
      setBatchAnalyzing(false);
    }
  }

  async function handleBatchChangelog() {
    if (activeItems.length === 0) return;
    const prNums = activeItems.map(i => i.pr_number);
    try {
      const res = await generateChangelog(prNums, activeGroup?.name);
      setBatchChangelog(res.markdown);
    } catch (err) {
      console.error(err);
    }
  }

  // Filter & Sort Workspaces Directory
  const filteredGroups = useMemo(() => {
    let list = [...groups];
    if (workspaceSearch.trim()) {
      const q = workspaceSearch.toLowerCase().trim();
      list = list.filter(g => g.name.toLowerCase().includes(q) || (g.description && g.description.toLowerCase().includes(q)));
    }

    list.sort((a, b) => {
      if (workspaceSort === 'name') {
        return a.name.localeCompare(b.name);
      } else if (workspaceSort === 'count') {
        return (b.item_count || 0) - (a.item_count || 0);
      } else {
        // 'updated'
        const dateA = new Date(a.updated_at || a.created_at || 0);
        const dateB = new Date(b.updated_at || b.created_at || 0);
        return dateB - dateA;
      }
    });

    return list;
  }, [groups, workspaceSearch, workspaceSort]);

  const activeGroup = groups.find(g => g.group_id === activeGroupId);
  // Match on (repo, number), not number alone — otherwise PR #42 from another
  // repository is pulled into this workspace.
  const activeItemKeys = useMemo(() => new Set(activeItems.map(itemRefKey)), [activeItems]);
  const activePrObjects = prs ? prs.filter(p => activeItemKeys.has(prRefKey(p))) : [];
  const activeConflictCount = activePrObjects.filter(isConflicting).length;

  // Filter & Sort Active Workspace PRs
  const filteredActivePrs = useMemo(() => {
    let list = [...activePrObjects];
    if (prTableSearch.trim()) {
      const q = prTableSearch.toLowerCase().trim();
      list = list.filter(p => (
        p.title?.toLowerCase().includes(q) ||
        p.author?.toLowerCase().includes(q) ||
        p.number.toString().includes(q) ||
        p.type?.toLowerCase().includes(q) ||
        p.status?.toLowerCase().includes(q)
      ));
    }

    list.sort((a, b) => {
      let valA = a[prSortField] || '';
      let valB = b[prSortField] || '';
      if (typeof valA === 'string') valA = valA.toLowerCase();
      if (typeof valB === 'string') valB = valB.toLowerCase();

      if (valA < valB) return prSortAsc ? -1 : 1;
      if (valA > valB) return prSortAsc ? 1 : -1;
      return 0;
    });

    return list;
  }, [activePrObjects, prTableSearch, prSortField, prSortAsc]);

  function handlePrSort(field) {
    if (prSortField === field) {
      setPrSortAsc(!prSortAsc);
    } else {
      setPrSortField(field);
      setPrSortAsc(true);
    }
  }

  function formatUpdated(dateStr) {
    if (!dateStr) return 'Recently';
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch (e) {
      return dateStr;
    }
  }

  return (
    <div className="staging-workspaces-container">
      {/* Top Header Bar */}
      <div className="staging-header">
        <div>
          <h2>📦 PR Workspaces & Release Buckets</h2>
          <p>Organize PRs into custom release buckets, track group progress, and execute batch AI operations.</p>
        </div>
        <button onClick={handleOpenCreateModal} className="btn btn-primary btn-add-workspace">
          + Add Workspace
        </button>
      </div>

      <div className="staging-grid">
        {/* Left Sidebar: Workspaces Directory List */}
        <div className="staging-sidebar">
          <div className="directory-header">
            <h3>Workspaces ({filteredGroups.length})</h3>
            <div className="directory-controls">
              <input
                type="text"
                placeholder="Filter workspaces..."
                value={workspaceSearch}
                onChange={e => setWorkspaceSearch(e.target.value)}
                className="directory-search-input"
              />
              <select
                value={workspaceSort}
                onChange={e => setWorkspaceSort(e.target.value)}
                className="directory-sort-select"
                title="Sort Workspaces"
              >
                <option value="updated">Sort: Date Updated</option>
                <option value="name">Sort: Name (A-Z)</option>
                <option value="count">Sort: PR Count</option>
              </select>
            </div>
          </div>

          {filteredGroups.length === 0 ? (
            <div className="empty-box card-empty">
              No workspaces found. Click <strong>+ Add Workspace</strong> above to create one!
            </div>
          ) : (
            <div className="groups-list">
              {filteredGroups.map(g => (
                <div
                  key={g.group_id}
                  className={`group-chip-item ${activeGroupId === g.group_id ? 'active' : ''}`}
                  onClick={() => { setActiveGroupId(g.group_id); setBatchChangelog(null); }}
                >
                  <div className="group-info">
                    <strong>{g.name}</strong>
                    {g.description && <span className="group-desc">{g.description}</span>}
                    <div className="group-meta-row">
                      <span>📦 {g.item_count || 0} PRs</span>
                      <span>🕒 {formatUpdated(g.updated_at || g.created_at)}</span>
                    </div>
                  </div>

                  <div className="group-card-actions">
                    <button
                      onClick={e => handleOpenEditModal(g, e)}
                      className="btn-icon-secondary"
                      title="Edit Workspace PRs"
                    >
                      ✏️
                    </button>
                    <button
                      onClick={e => handleDeleteGroup(g.group_id, e)}
                      className="btn-icon-danger"
                      title="Delete Workspace"
                    >
                      &times;
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right Area: Selected Workspace Detail View */}
        <div className="staging-content">
          {activeGroup ? (
            <div className="workspace-card">
              {/* Header with Title and Prominent Actions */}
              <div className="workspace-card-header">
                <div>
                  <h3>Workspace: {activeGroup.name}</h3>
                  <p className="subtitle">{activeGroup.description || 'No description provided.'}</p>
                </div>

                <div className="prominent-actions-bar">
                  <button
                    onClick={handleBatchAnalyze}
                    disabled={batchAnalyzing || activeItems.length === 0}
                    className="btn btn-primary btn-action-ai"
                  >
                    {batchAnalyzing ? 'Analyzing Bucket...' : `⚡ Batch AI Review (${activeItems.length})`}
                  </button>
                  <button
                    onClick={handleBatchChangelog}
                    disabled={activeItems.length === 0}
                    className="btn btn-secondary btn-action-changelog"
                  >
                    📝 Create Changelog
                  </button>
                  <button
                    onClick={e => handleOpenEditModal(activeGroup, e)}
                    className="btn btn-secondary btn-action-edit"
                  >
                    ✏️ Edit PRs
                  </button>
                </div>
              </div>

              {/* Conflict warning for the staged set. A workspace is a candidate
                  build, so conflicting PRs are a ship blocker, not a detail. */}
              {activeConflictCount > 0 && (
                <div className="workspace-conflict-banner" role="status">
                  ⚠️ <strong>{activeConflictCount}</strong> of {activePrObjects.length} staged
                  {activeConflictCount === 1 ? ' PR conflicts' : ' PRs conflict'} with their base
                  branch. Resolve before building this release.
                </div>
              )}

              {/* Workspace PRs Table & Controls */}
              <div className="group-prs-table-container">
                <div className="table-filter-bar">
                  <h4>PRs in this Workspace ({filteredActivePrs.length})</h4>
                  <input
                    type="text"
                    placeholder="Search workspace PRs..."
                    value={prTableSearch}
                    onChange={e => setPrTableSearch(e.target.value)}
                    className="table-search-input"
                  />
                </div>

                {filteredActivePrs.length === 0 ? (
                  <div className="empty-box">
                    {activePrObjects.length === 0
                      ? "No PRs in this workspace yet. Click 'Edit PRs' above to add pull requests!"
                      : `No PRs match your search filter '${prTableSearch}'.`}
                  </div>
                ) : (
                  <table className="staging-prs-table">
                    <thead>
                      <tr>
                        <th className="sortable" onClick={() => handlePrSort('number')}>
                          PR {prSortField === 'number' && (prSortAsc ? '▲' : '▼')}
                        </th>
                        <th className="sortable" onClick={() => handlePrSort('title')}>
                          Title & Author {prSortField === 'title' && (prSortAsc ? '▲' : '▼')}
                        </th>
                        <th className="sortable" onClick={() => handlePrSort('status')}>
                          Status {prSortField === 'status' && (prSortAsc ? '▲' : '▼')}
                        </th>
                        <th className="sortable" onClick={() => handlePrSort('risk')}>
                          Risk {prSortField === 'risk' && (prSortAsc ? '▲' : '▼')}
                        </th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredActivePrs.map(pr => (
                        <tr key={prRefKey(pr)} className={isConflicting(pr) ? 'row-conflicting' : ''}>
                          <td>
                            <button onClick={() => onSelectPr(pr.number, pr.repo_name)} className="btn-link">
                              #{pr.number}
                            </button>
                          </td>
                          <td>
                            <strong>{pr.title}</strong>
                            <div className="submeta">@{pr.author} | {pr.type}</div>
                          </td>
                          <td>
                            <span className={`badge badge-${pr.status.toLowerCase()}`}>{pr.status}</span>
                            {isConflicting(pr) && (
                              <span className="conflict-badge" title="Conflicts with base branch">⚠️ Conflict</span>
                            )}
                          </td>
                          <td>
                            <span className={`risk-${pr.risk.toLowerCase()}`}>{pr.risk}</span>
                          </td>
                          <td>
                            <button
                              onClick={() => handleRemovePr(pr.number, pr.repo_name)}
                              className="btn-icon-danger"
                              title="Remove from Workspace"
                            >
                              &times; Remove
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Batch Changelog Draft Drawer */}
              {batchChangelog && (
                <div className="batch-changelog-output">
                  <h4>Generated Group Release Draft</h4>
                  <div className="markdown-box">
                    <FormattedMarkdown content={batchChangelog} />
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="empty-box card-empty">
              No Workspace selected. Click <strong>+ Add Workspace</strong> above to create a workspace!
            </div>
          )}
        </div>
      </div>

      {/* Modal Component */}
      <WorkspaceModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSaveWorkspace}
        group={modalGroupTarget}
        existingItems={modalGroupTarget ? activeItems : []}
        allPrs={prs}
      />
    </div>
  );
}
