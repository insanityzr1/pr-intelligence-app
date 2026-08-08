import React, { useState } from 'react';
import { generateChangelog } from '../api/client';

export default function ReleaseBuilder({ prs }) {
  const [selectedPrs, setSelectedPrs] = useState([]);
  const [changelog, setChangelog] = useState(null);
  const [loading, setLoading] = useState(false);

  function togglePr(num) {
    if (selectedPrs.includes(num)) {
      setSelectedPrs(selectedPrs.filter(n => n !== num));
    } else {
      setSelectedPrs([...selectedPrs, num]);
    }
  }

  function selectAll() {
    setSelectedPrs(prs.map(p => p.number));
  }

  function clearAll() {
    setSelectedPrs([]);
  }

  async function handleBuild() {
    if (selectedPrs.length === 0) return;
    setLoading(true);
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
        <h2>AI Release Builder & Changelog Generator</h2>
        <p>Select PRs to feature in the release draft and auto-group them into release categories.</p>
        <div className="button-bar">
          <button onClick={selectAll} className="btn btn-secondary">Select All ({prs.length})</button>
          <button onClick={clearAll} className="btn btn-secondary">Clear Selection</button>
          <button onClick={handleBuild} disabled={selectedPrs.length === 0 || loading} className="btn btn-primary">
            {loading ? 'Building Release Notes...' : `Generate Changelog (${selectedPrs.length} Selected)`}
          </button>
        </div>
      </div>

      <div className="builder-layout">
        <div className="pr-selector-list">
          <h3>Select PRs for Release</h3>
          {prs.map(pr => (
            <label key={pr.number} className={`pr-checkbox-item ${selectedPrs.includes(pr.number) ? 'selected' : ''}`}>
              <input type="checkbox" checked={selectedPrs.includes(pr.number)} onChange={() => togglePr(pr.number)} />
              <div className="info">
                <strong>#{pr.number}: {pr.title}</strong>
                <span>{pr.type} / {pr.subtype}</span>
              </div>
            </label>
          ))}
        </div>

        <div className="changelog-output">
          <h3>Generated Release Output</h3>
          {changelog ? (
            <div className="markdown-box">
              <pre>{changelog.markdown}</pre>
            </div>
          ) : (
            <div className="empty-box">Select PRs on the left and click "Generate Changelog" to view release output.</div>
          )}
        </div>
      </div>
    </div>
  );
}
