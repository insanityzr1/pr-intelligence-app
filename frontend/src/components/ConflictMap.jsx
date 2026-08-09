import React, { useState, useEffect } from 'react';
import { fetchConflicts } from '../api/client';

export default function ConflictMap() {
  const [collisions, setCollisions] = useState([]);
  const [skipped, setSkipped] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadConflicts();
  }, []);

  async function loadConflicts() {
    setLoading(true);
    try {
      const data = await fetchConflicts();
      setCollisions(data.collisions || []);
      setSkipped(data.skipped || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="conflict-map-container">
      <div className="panel-header">
        <h2>Cross-PR File Collision Matrix</h2>
        <p>Identifies files modified across multiple open PRs to prevent rebase collisions early.</p>
      </div>

      {/* A PR the scan could not read is not the same as a PR with no collisions. */}
      {skipped.length > 0 && (
        <div className="workspace-conflict-banner" role="status">
          ⚠️ {skipped.length} PR{skipped.length === 1 ? '' : 's'} could not be scanned
          (#{skipped.map(s => s.pr_number).join(', #')}). Results below are incomplete.
        </div>
      )}

      {loading ? (
        <div className="loading">Scanning open PR diffs for file collisions...</div>
      ) : collisions.length === 0 ? (
        <div className="empty-box">🎉 No overlapping file modifications detected across open PRs!</div>
      ) : (
        <div className="collisions-grid">
          {collisions.map(c => (
            <div key={c.filepath} className="collision-card">
              <div className="collision-header">
                <code>{c.filepath}</code>
                <span className="badge badge-conflict">{c.overlapping_prs_count} PR Collisions</span>
              </div>
              <div className="collision-prs">
                {c.prs.map(p => (
                  <div key={`${p.repo_name}#${p.pr_number}`} className="pr-chip">
                    <a href={p.url} target="_blank" rel="noreferrer">#{p.pr_number}</a>
                    <span className="title">{p.title}</span>
                    <span className="author">@{p.author}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
