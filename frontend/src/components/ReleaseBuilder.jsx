import React, { useState } from 'react';
import { generateChangelog } from '../api/client';
import FormattedMarkdown from './FormattedMarkdown';

export default function ReleaseBuilder({ prs }) {
  const [selectedPrs, setSelectedPrs] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [changelog, setChangelog] = useState(null);
  const [loading, setLoading] = useState(false);

  // Typeahead search filtering
  const filteredPrs = prs.filter(pr => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.trim().toLowerCase();
    
    // Filter by PR number if query starts with '#' or is a number
    if (q.startsWith('#')) {
      const numStr = q.replace('#', '');
      return pr.number.toString().includes(numStr);
    }
    
    // Filter by Title, Head Branch, Base Branch, Author, or PR Number
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
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
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

      <div className="builder-layout">
        <div className="pr-selector-list">
          <div className="typeahead-container">
            <label className="typeahead-label">Search & Filter PRs for Release</label>
            <div className="typeahead-input-wrapper">
              <input
                type="text"
                placeholder="Type PR title, branch name, author, or '#1874' to filter..."
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

        <div className="changelog-output">
          <h3>Generated Release Draft Output</h3>
          {loading ? (
            <div className="loading">AI grouping PRs into release categories and writing release notes...</div>
          ) : changelog ? (
            <div className="markdown-box">
              <FormattedMarkdown content={changelog.markdown || changelog.changelog || str(changelog)} />
            </div>
          ) : (
            <div className="empty-box">
              Select PRs on the left and click "Generate Changelog" to construct AI release notes.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
