import React, { useState, useEffect } from 'react';
import { fetchGroups, createGroup, deleteGroup, fetchGroupItems, addPrsToGroup, removePrFromGroup, analyzePRs, generateChangelog } from '../api/client';
import FormattedMarkdown from './FormattedMarkdown';

export default function StagingWorkspacesTab({ prs, onSelectPr }) {
  const [groups, setGroups] = useState([]);
  const [activeGroupId, setActiveGroupId] = useState(null);
  const [activeItems, setActiveItems] = useState([]);
  
  // New Group Form
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupDesc, setNewGroupDesc] = useState('');
  const [creatingGroup, setCreatingGroup] = useState(false);
  
  // Add PR to Group Modal / Selector
  const [selectedPrToAdd, setSelectedPrToAdd] = useState('');
  
  // Batch Action States
  const [batchAnalyzing, setBatchAnalyzing] = useState(false);
  const [batchChangelog, setBatchChangelog] = useState(null);

  useEffect(() => {
    loadGroups();
  }, []);

  useEffect(() => {
    if (activeGroupId) {
      loadGroupItems(activeGroupId);
    }
  }, [activeGroupId]);

  async function loadGroups() {
    try {
      const data = await fetchGroups();
      setGroups(data.groups || []);
      if (data.groups?.length > 0 && !activeGroupId) {
        setActiveGroupId(data.groups[0].group_id);
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

  async function handleCreateGroup(e) {
    e.preventDefault();
    if (!newGroupName.trim()) return;
    setCreatingGroup(true);
    try {
      const res = await createGroup(newGroupName.trim(), newGroupDesc.trim());
      setNewGroupName('');
      setNewGroupDesc('');
      await loadGroups();
      setActiveGroupId(res.group.group_id);
    } catch (err) {
      console.error(err);
    } finally {
      setCreatingGroup(false);
    }
  }

  async function handleDeleteGroup(gId) {
    try {
      await deleteGroup(gId);
      await loadGroups();
      if (activeGroupId === gId) {
        setActiveGroupId(null);
        setActiveItems([]);
      }
    } catch (err) {
      console.error(err);
    }
  }

  async function handleAddPrToGroup(e) {
    e.preventDefault();
    if (!selectedPrToAdd || !activeGroupId) return;
    const num = parseInt(selectedPrToAdd);
    const prItem = prs.find(p => p.number === num);
    const repo = prItem?.repo_name || 'rpnunez/wp-ai-scheduler';
    
    try {
      await addPrsToGroup(activeGroupId, [num], repo);
      setSelectedPrToAdd('');
      await loadGroupItems(activeGroupId);
      await loadGroups();
    } catch (err) {
      console.error(err);
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

  async function handleBatchAnalyze() {
    if (activeItems.length === 0) return;
    setBatchAnalyzing(true);
    const prNums = activeItems.map(i => i.pr_number);
    try {
      await analyzePRs(prNums, true);
      alert(`Batch AI Analysis complete for ${prNums.length} PRs in this workspace!`);
    } catch (err) {
      console.error(err);
    } finally {
      setBatchAnalyzing(false);
    }
  }

  async function handleBatchChangelog() {
    if (activeItems.length === 0) return;
    const prNums = activeItems.map(i => i.pr_number);
    try {
      const res = await generateChangelog(prNums);
      setBatchChangelog(res.markdown);
    } catch (err) {
      console.error(err);
    }
  }

  const activeGroup = groups.find(g => g.group_id === activeGroupId);
  const activePrObjects = prs.filter(p => activeItems.some(i => i.pr_number === p.number));

  return (
    <div className="staging-workspaces-container">
      <div className="staging-header">
        <div>
          <h2>📦 PR Staging Groups & Workspaces</h2>
          <p>Organize PRs into custom release buckets, track group progress, and execute batch AI operations.</p>
        </div>
      </div>

      <div className="staging-grid">
        {/* Left Sidebar: Bucket List & Create Form */}
        <div className="staging-sidebar">
          <h3>Create Staging Bucket</h3>
          <form onSubmit={handleCreateGroup} className="create-group-form">
            <input
              type="text"
              placeholder="e.g. Feature Release v2.9"
              value={newGroupName}
              onChange={e => setNewGroupName(e.target.value)}
              disabled={creatingGroup}
            />
            <input
              type="text"
              placeholder="Optional description..."
              value={newGroupDesc}
              onChange={e => setNewGroupDesc(e.target.value)}
              disabled={creatingGroup}
            />
            <button type="submit" className="btn btn-primary btn-sm" disabled={creatingGroup || !newGroupName.trim()}>
              {creatingGroup ? 'Creating...' : '+ Create Workspace Bucket'}
            </button>
          </form>

          <h3 className="sidebar-section-title">Your Workspaces ({groups.length})</h3>
          {groups.length === 0 ? (
            <div className="empty-box">No staging buckets created yet. Create one above!</div>
          ) : (
            <div className="groups-list">
              {groups.map(g => (
                <div
                  key={g.group_id}
                  className={`group-chip-item ${activeGroupId === g.group_id ? 'active' : ''}`}
                  onClick={() => { setActiveGroupId(g.group_id); setBatchChangelog(null); }}
                >
                  <div className="group-info">
                    <strong>{g.name}</strong>
                    <span>{g.item_count || 0} PRs</span>
                  </div>
                  <button
                    onClick={e => { e.stopPropagation(); handleDeleteGroup(g.group_id); }}
                    className="btn-icon-danger"
                  >
                    &times;
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right Area: Selected Bucket Workspace */}
        <div className="staging-content">
          {activeGroup ? (
            <div className="workspace-card">
              <div className="workspace-card-header">
                <div>
                  <h3>Workspace: {activeGroup.name}</h3>
                  <p className="subtitle">{activeGroup.description || 'No description provided.'}</p>
                </div>

                <div className="batch-actions-bar">
                  <button
                    onClick={handleBatchAnalyze}
                    disabled={batchAnalyzing || activeItems.length === 0}
                    className="btn btn-primary btn-sm"
                  >
                    {batchAnalyzing ? 'Analyzing Bucket...' : `⚡ Batch AI Review (${activeItems.length})`}
                  </button>
                  <button
                    onClick={handleBatchChangelog}
                    disabled={activeItems.length === 0}
                    className="btn btn-secondary btn-sm"
                  >
                    📝 Draft Group Changelog
                  </button>
                </div>
              </div>

              {/* Add PR to Group Control */}
              <form onSubmit={handleAddPrToGroup} className="add-pr-to-group-form">
                <label>Add PR to Bucket:</label>
                <select
                  value={selectedPrToAdd}
                  onChange={e => setSelectedPrToAdd(e.target.value)}
                  className="add-pr-select"
                >
                  <option value="">-- Select PR to add --</option>
                  {prs.map(p => (
                    <option key={p.number} value={p.number}>
                      #{p.number}: {p.title} (@{p.author})
                    </option>
                  ))}
                </select>
                <button type="submit" className="btn btn-secondary btn-sm" disabled={!selectedPrToAdd}>
                  + Add to Bucket
                </button>
              </form>

              {/* Group Items Table */}
              <div className="group-prs-table-container">
                <h4>PRs in this Workspace ({activePrObjects.length})</h4>
                {activePrObjects.length === 0 ? (
                  <div className="empty-box">No PRs added to this workspace yet. Select a PR above to add!</div>
                ) : (
                  <table className="staging-prs-table">
                    <thead>
                      <tr>
                        <th>PR</th>
                        <th>Title & Author</th>
                        <th>Status</th>
                        <th>Risk</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activePrObjects.map(pr => (
                        <tr key={pr.number}>
                          <td>
                            <button onClick={() => onSelectPr(pr.number)} className="btn-link">
                              #{pr.number}
                            </button>
                          </td>
                          <td>
                            <strong>{pr.title}</strong>
                            <div className="submeta">@{pr.author} | {pr.type}</div>
                          </td>
                          <td>
                            <span className={`badge badge-${pr.status.toLowerCase()}`}>{pr.status}</span>
                          </td>
                          <td>
                            <span className={`risk-${pr.risk.toLowerCase()}`}>{pr.risk}</span>
                          </td>
                          <td>
                            <button
                              onClick={() => handleRemovePr(pr.number, pr.repo_name)}
                              className="btn-icon-danger"
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

              {/* Batch Changelog Result */}
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
              Select or create a Staging Bucket on the left to manage workspace PRs.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
