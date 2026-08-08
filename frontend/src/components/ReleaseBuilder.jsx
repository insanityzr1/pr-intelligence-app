import React, { useState, useEffect } from 'react';
import { generateChangelog, fetchChangelogs, deleteChangelog, fetchGroups, fetchGroupItems, createGroup } from '../api/client';
import FormattedMarkdown from './FormattedMarkdown';
import { itemRefKey, prRefKey } from '../utils/prStats';

export default function ReleaseBuilder({ prs }) {
  const [groups, setGroups] = useState([]);
  const [activeGroupId, setActiveGroupId] = useState(null);
  const [activeItems, setActiveItems] = useState([]);
  
  // Inline workspace creation state
  const [newGroupName, setNewGroupName] = useState('');
  const [creatingGroup, setCreatingGroup] = useState(false);

  // Changelog states
  const [currentChangelog, setCurrentChangelog] = useState(null);
  const [changelogs, setChangelogs] = useState([]);
  const [activeChangelogId, setActiveChangelogId] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadGroups();
    loadChangelogs();
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
      const loadedGroups = data.groups || [];
      setGroups(loadedGroups);
      if (loadedGroups.length > 0 && !activeGroupId) {
        setActiveGroupId(loadedGroups[0].group_id);
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

  async function loadChangelogs() {
    try {
      const res = await fetchChangelogs();
      setChangelogs(res.changelogs || []);
    } catch (err) {
      console.error(err);
    }
  }

  async function handleCreateGroup(e) {
    e.preventDefault();
    if (!newGroupName.trim()) return;
    setCreatingGroup(true);
    try {
      const res = await createGroup(newGroupName.trim());
      setNewGroupName('');
      await loadGroups();
      if (res.group?.group_id) {
        setActiveGroupId(res.group.group_id);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setCreatingGroup(false);
    }
  }

  const activeGroup = groups.find(g => g.group_id === activeGroupId);
  // Match on (repo, number) — see StagingWorkspacesTab for the same fix.
  const activeItemKeys = new Set(activeItems.map(itemRefKey));
  const activePrObjects = prs ? prs.filter(p => activeItemKeys.has(prRefKey(p))) : [];

  async function handleBuild() {
    if (activeItems.length === 0) return;
    setLoading(true);
    setCurrentChangelog(null);
    const prNums = activeItems.map(i => i.pr_number);
    try {
      const data = await generateChangelog(prNums, activeGroup?.name || null);
      setCurrentChangelog(data);
      setActiveChangelogId(data.id || null);
      await loadChangelogs();
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  function handleSelectChangelog(item) {
    setActiveChangelogId(item.id);
    setCurrentChangelog(item);
  }

  async function handleDeleteChangelog(e, id) {
    e.stopPropagation();
    try {
      await deleteChangelog(id);
      await loadChangelogs();
      if (activeChangelogId === id) {
        setActiveChangelogId(null);
        setCurrentChangelog(null);
      }
    } catch (err) {
      console.error(err);
    }
  }

  return (
    <div className="release-builder-container">
      <div className="panel-header">
        <div>
          <h2>AI Release Builder & Changelog Generator</h2>
          <p>Generate automated AI release notes for your PR Workspaces in one click.</p>
        </div>

        <div className="button-bar">
          <button
            onClick={handleBuild}
            disabled={!activeGroup || activeItems.length === 0 || loading}
            className="btn btn-primary"
          >
            {loading ? 'Building Release Notes...' : `Generate Changelog (${activeItems.length} PRs)`}
          </button>
        </div>
      </div>

      <div className="builder-layout-three-col">
        {/* Col 1: PR Workspace Picker & PR Items */}
        <div className="pr-selector-list">
          <div className="workspace-selector-box">
            <label className="typeahead-label">Select PR Workspace</label>
            {groups.length === 0 ? (
              <div className="empty-box">No PR Workspaces found. Create one below!</div>
            ) : (
              <select
                value={activeGroupId || ''}
                onChange={e => setActiveGroupId(Number(e.target.value))}
                className="add-pr-select"
                style={{ width: '100%', marginBottom: '12px' }}
              >
                {groups.map(g => (
                  <option key={g.group_id} value={g.group_id}>
                    📦 {g.name} ({g.item_count || 0} PRs)
                  </option>
                ))}
              </select>
            )}

            {/* Inline Quick Workspace Creator */}
            <form onSubmit={handleCreateGroup} className="create-group-form" style={{ marginTop: '8px' }}>
              <input
                type="text"
                placeholder="New Workspace Name..."
                value={newGroupName}
                onChange={e => setNewGroupName(e.target.value)}
                disabled={creatingGroup}
              />
              <button
                type="submit"
                className="btn btn-secondary btn-sm"
                disabled={creatingGroup || !newGroupName.trim()}
              >
                {creatingGroup ? 'Creating...' : '+ New Workspace'}
              </button>
            </form>
          </div>

          <div className="workspace-items-container" style={{ marginTop: '16px' }}>
            <h4 style={{ margin: '8px 0', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
              PRs in {activeGroup ? `'${activeGroup.name}'` : 'Selected Workspace'} ({activePrObjects.length})
            </h4>

            <div className="pr-checkbox-scroll">
              {!activeGroup ? (
                <div className="empty-box">Select or create a PR Workspace to view items.</div>
              ) : activePrObjects.length === 0 ? (
                <div className="empty-box">
                  No PRs added to '{activeGroup.name}' yet. Head over to the PR Workspaces tab to add PRs!
                </div>
              ) : (
                activePrObjects.map(pr => (
                  <div key={pr.number} className="pr-checkbox-item selected" style={{ cursor: 'default' }}>
                    <div className="info">
                      <div className="pr-checkbox-head">
                        <strong>#{pr.number}: {pr.title}</strong>
                        <span className="branch-badge">{pr.headRefName || pr.head_branch || 'feature'} ➜ {pr.baseRefName || pr.base_branch || 'main'}</span>
                      </div>
                      <span className="pr-type-meta">Author: @{pr.author} | Status: {pr.status} | Risk: {pr.risk}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Col 2: Saved Changelogs Sidebar */}
        <div className="changelogs-sidebar">
          <h3>📜 Saved Changelogs ({changelogs.length})</h3>
          <p className="sidebar-subtitle">Click any generated changelog to view release draft.</p>
          
          {changelogs.length === 0 ? (
            <div className="empty-box">No saved changelogs yet.</div>
          ) : (
            <div className="changelogs-scroll">
              {changelogs.map(item => (
                <div
                  key={item.id}
                  className={`changelog-card ${activeChangelogId === item.id ? 'active' : ''}`}
                  onClick={() => handleSelectChangelog(item)}
                >
                  <div className="changelog-head">
                    <strong className="changelog-title">{item.title}</strong>
                    <button
                      onClick={e => handleDeleteChangelog(e, item.id)}
                      className="btn-icon-danger"
                      title="Delete changelog"
                    >
                      &times;
                    </button>
                  </div>

                  <div className="changelog-meta">
                    <span className="changelog-date">🕒 {item.created_at}</span>
                    {item.branches?.length > 0 && (
                      <span className="changelog-branches">🌿 {item.branches.join(', ')}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Col 3: Generated Release Output Viewer */}
        <div className="changelog-output">
          <h3>Generated Release Draft Output</h3>
          {loading ? (
            <div className="loading">AI grouping PRs into release categories and writing release notes...</div>
          ) : currentChangelog ? (
            <div className="markdown-box">
              <FormattedMarkdown content={currentChangelog.markdown || currentChangelog.changelog || ''} />
            </div>
          ) : (
            <div className="empty-box">
              Select a PR Workspace on the left and click "Generate Changelog" or pick a saved changelog from the list.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
