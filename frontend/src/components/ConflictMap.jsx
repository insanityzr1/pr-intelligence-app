import React, { useState, useEffect } from 'react';
import { fetchConflicts } from '../api/client';

export default function ConflictMap() {
  const [collisions, setCollisions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadConflicts();
  }, []);

  async function loadConflicts() {
    setLoading(true);
    try {
      const data = await fetchConflicts();
      setCollisions(data.collisions || []);
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

      {loading ? (
        <div className="loading">Scanning open PR diffs for file collisions...</div>
      ) : collisions.length === 0 ? (
        <div className="empty-box">🎉 No overlapping file modifications detected across open PRs!</div>
      ) : (
        <div className="collisions-grid">
          {collisions.map((c, i) => (
            <div key={i} className="collision-card">
              <div className="collision-header">
                <code>{c.file_path}</code>
                <span className="badge badge-conflict">{c.conflicting_count} PR Collisions</span>
              </div>
              <div className="collision-prs">
                {c.prs.map((p, j) => (
                  <div key={j} className="pr-chip">
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
