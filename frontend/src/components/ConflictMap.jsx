import React, { useState, useEffect } from 'react';
import { fetchConflicts } from '../api/client';

export default function ConflictMap({ onResolveConflict, addToast }) {
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
      if (addToast) addToast('Failed to load collision matrix', 'error');
    } finally {
      setLoading(false);
    }
  }

  // Compute stats
  const totalFiles = collisions.length;
  const totalPrsAffected = new Set(collisions.flatMap(c => c.prs?.map(p => p.pr_number))).size;

  return (
    <div className="conflict-map-container">
      <div className="panel-header">
        <div>
          <h2>⚡ Cross-PR File Collision Matrix</h2>
          <p>Identifies files modified across multiple open PRs to prevent rebase collisions early.</p>
        </div>

        <button onClick={loadConflicts} className="btn btn-secondary btn-sm" disabled={loading}>
          🔄 Refresh Matrix
        </button>
      </div>

      {/* Summary KPI Strip */}
      <div className="conflict-kpi-strip">
        <div className="conflict-kpi-item">
          <span className="kpi-num">{totalFiles}</span>
          <span className="kpi-desc">Overlapping Files</span>
        </div>
        <div className="conflict-kpi-item">
          <span className="kpi-num amber">{totalPrsAffected}</span>
          <span className="kpi-desc">PRs Intersected</span>
        </div>
        <div className="conflict-kpi-item">
          <span className="kpi-num green">{totalFiles === 0 ? 'Clean' : 'Divergent'}</span>
          <span className="kpi-desc">Cluster Status</span>
        </div>
      </div>

      {loading ? (
        <div className="loading">Scanning open PR diffs for file collisions...</div>
      ) : collisions.length === 0 ? (
        <div className="empty-box card-empty">
          🎉 No overlapping file modifications detected across open PRs! All branches are cleanly isolated.
        </div>
      ) : (
        <div className="collisions-grid">
          {collisions.map((c, i) => (
            <div key={i} className="collision-card">
              <div className="collision-header">
                <code className="collision-file-path">{c.file_path}</code>
                <span className="badge badge-conflict">{c.conflicting_count || c.prs?.length || 2} PR Collisions</span>
              </div>
              <div className="collision-prs">
                {c.prs.map((p, j) => (
                  <div key={j} className="pr-chip">
                    <div className="pr-chip-meta">
                      <a href={p.url} target="_blank" rel="noreferrer" className="pr-chip-num">#{p.pr_number}</a>
                      <span className="pr-chip-title">{p.title}</span>
                      <span className="pr-chip-author">@{p.author}</span>
                    </div>

                    {onResolveConflict && (
                      <button
                        onClick={() => onResolveConflict(p.pr_number, p.repo_name)}
                        className="btn btn-warning btn-xs btn-chip-resolve"
                        title="Open AI Conflict Resolver"
                      >
                        ⚠️ Resolve
                      </button>
                    )}
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
