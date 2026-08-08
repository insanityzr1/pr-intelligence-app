import React, { useState, useEffect } from 'react';
import { generateChangelog, fetchPastChangelogs, deletePastChangelog } from '../api/client';
import FormattedMarkdown from './FormattedMarkdown';

export default function ReleaseBuilder({ prs }) {
  const [selectedPrs, setSelectedPrs] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [changelog, setChangelog] = useState(null);
  const [pastChangelogs, setPastChangelogs] = useState([]);
  const [activePastId, setActivePastId] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadPastChangelogs();
  }, []);

  async function loadPastChangelogs() {
    try {
      const res = await fetchPastChangelogs();
      setPastChangelogs(res.changelogs || []);
    } catch (err) {
      console.error(err);
    }
  }

  // Typeahead search filtering
  const filteredPrs = prs.filter(pr => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.trim().toLowerCase();
    
    if (q.startsWith('#')) {
      const numStr = q.replace('#', '');
      return pr.number.toString().includes(numStr);
    }
    
    return (
      pr.title.toLowerCase().includes(q) ||
      (pr.headRefName && pr.headRefName.toLowerCase().includes(q)) ||
      (pr.baseRefName && pr.baseRefName.toLowerCase().includes(q)) ||
      pr.author.toLowerCase().includes(q) ||
      pr.number.toString().includes(q)
    );
  });

  function togglePr(num) {
    if (selectedPrs.includes(num)) {
      setSelectedPrs(selectedPrs.filter(n => n !== num));
    } else {
      setSelectedPrs([...selectedPrs, num]);
    }
  }

  function selectFiltered() {
    const filteredNums = filteredPrs.map(p => p.number);
    const combined = Array.from(new Set([...selectedPrs, ...filteredNums]));
    setSelectedPrs(combined);
  }

  function clearAll() {
    setSelectedPrs([]);
  }

  async function handleBuild() {
    if (selectedPrs.length === 0) return;
    setLoading(true);
    setChangelog(null);
    try {
      const data = await generateChangelog(selectedPrs);
      setChangelog(data);
      setActivePastId(data.id || null);
      await loadPastChangelogs();
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  function handleSelectPast(item) {
    setActivePastId(item.id);
    setChangelog(item);
  }

  async function handleDeletePast(e, id) {
    e.stopPropagation();
    try {
      await deletePastChangelog(id);
      await loadPastChangelogs();
      if (activePastId === id) {
        setActivePastId(null);
        setChangelog(null);
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
          <p>Filter PRs using typeahead search, select feature candidates, and generate automated release notes.</p>
        </div>

        <div className="button-bar">
          <button onClick={selectFiltered} className="btn btn-secondary btn-sm">
            Select Filtered ({filteredPrs.length})
          </button>
          <button onClick={clearAll} className="btn btn-secondary btn-sm">Clear Selection</button>
          <button onClick={handleBuild} disabled={selectedPrs.length === 0 || loading} className="btn btn-primary">
            {loading ? 'Building Release Notes...' : `Generate Changelog (${selectedPrs.length} Selected)`}
          </button>
        </div>
      </div>

      <div className="builder-layout-three-col">
        {/* Col 1: PR Selection List with Typeahead */}
        <div className="pr-selector-list">
          <div className="typeahead-container">
            <label className="typeahead-label">Search & Filter PRs for Release</label>
            <div className="typeahead-input-wrapper">
              <input
                type="text"
                placeholder="Type PR title, branch name, author, or '#1874'..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="typeahead-input"
              />
              {searchQuery && (
                <button className="clear-search-btn" onClick={() => setSearchQuery('')}>&times;</button>
              )}
            </div>
            <span className="results-count">Showing {filteredPrs.length} of {prs.length} PRs</span>
          </div>

          <div className="pr-checkbox-scroll">
            {filteredPrs.length === 0 ? (
              <div className="empty-box">No PRs match your search query '{searchQuery}'.</div>
            ) : (
              filteredPrs.map(pr => (
                <label key={pr.number} className={`pr-checkbox-item ${selectedPrs.includes(pr.number) ? 'selected' : ''}`}>
                  <input
                    type="checkbox"
                    checked={selectedPrs.includes(pr.number)}
                    onChange={() => togglePr(pr.number)}
                  />
                  <div className="info">
                    <div className="pr-checkbox-head">
                      <strong>#{pr.number}: {pr.title}</strong>
                      <span className="branch-badge">{pr.headRefName || 'feature'} ➜ {pr.baseRefName || 'main'}</span>
                    </div>
                    <span className="pr-type-meta">Author: @{pr.author} | {pr.type} / {pr.subtype}</span>
                  </div>
                </label>
              ))
            )}
          </div>
        </div>

        {/* Col 2: Condensed Past Generated Changelogs Sidebar */}
        <div className="past-changelogs-sidebar">
          <h3>📜 Saved Release Notes ({pastChangelogs.length})</h3>
          <p className="sidebar-subtitle">Click any generated release to view draft markdown.</p>
          
          {pastChangelogs.length === 0 ? (
            <div className="empty-box">No saved release notes yet.</div>
          ) : (
            <div className="past-changelogs-scroll">
              {pastChangelogs.map(item => (
                <div
                  key={item.id}
                  className={`past-changelog-card ${activePastId === item.id ? 'active' : ''}`}
                  onClick={() => handleSelectPast(item)}
                >
                  <div className="past-head">
                    <strong className="past-title">{item.title}</strong>
                    <button
                      onClick={e => handleDeletePast(e, item.id)}
                      className="btn-icon-danger"
                      title="Delete draft"
                    >
                      &times;
                    </button>
                  </div>

                  <div className="past-meta">
                    <span className="past-date">🕒 {item.created_at}</span>
                    {item.branches?.length > 0 && (
                      <span className="past-branches">🌿 {item.branches.join(', ')}</span>
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
          ) : changelog ? (
            <div className="markdown-box">
              <FormattedMarkdown content={changelog.markdown || changelog.changelog || ''} />
            </div>
          ) : (
            <div className="empty-box">
              Select PRs on the left and click "Generate Changelog" or pick a saved release draft from the list.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
