import React, { useState, useEffect } from 'react';
import { fetchConflictResolution } from '../api/client';

export default function ConflictResolverModal({ prNumber, repoName, onClose }) {
  const [resolution, setResolution] = useState(null);
  const [loading, setLoading] = useState(true);
  const [copiedIndex, setCopiedIndex] = useState(null);

  useEffect(() => {
    if (prNumber) loadResolution();
  }, [prNumber]);

  async function loadResolution() {
    setLoading(true);
    try {
      const data = await fetchConflictResolution(prNumber, repoName);
      setResolution(data.conflict_info || null);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  function copyCommand(cmd, index) {
    navigator.clipboard.writeText(cmd);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  }

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <div className="drawer-content modal-wide" onClick={e => e.stopPropagation()}>
        <div className="drawer-header">
          <div>
            <h2>⚠️ AI Conflict Resolver — PR #{prNumber}</h2>
            <p className="subtitle">Repository: {repoName || 'Default Repo'}</p>
          </div>
          <button className="close-btn" onClick={onClose}>&times;</button>
        </div>

        {loading ? (
          <div className="loading">AI analyzing branch divergence and generating rebase wizard...</div>
        ) : !resolution ? (
          <div className="empty-box">Failed to generate conflict resolution.</div>
        ) : (
          <div className="drawer-body">
            <div className="conflict-box">
              <h3>Root Cause Analysis</h3>
              <p>{resolution.conflict_cause}</p>

              <h3>Recommended Merging Strategy</h3>
              <p>{resolution.recommended_strategy}</p>

              <div className="terminal-wizard">
                <div className="wizard-header">
                  <span>Step-by-Step Terminal Rebase Wizard</span>
                  <a href={`/api/prs/${prNumber}/conflict-patch?repo_name=${encodeURIComponent(repoName || '')}`} className="btn btn-secondary btn-sm" download>
                    📥 Download .patch File
                  </a>
                </div>

                <div className="commands-list">
                  {resolution.terminal_commands?.map((cmd, idx) => (
                    <div key={idx} className="command-row">
                      <code>{cmd}</code>
                      <button onClick={() => copyCommand(cmd, idx)} className="btn-copy">
                        {copiedIndex === idx ? 'Copied!' : 'Copy'}
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {resolution.resolved_code_preview && (
                <div className="code-preview-box">
                  <h3>3-Way Merged Code Preview</h3>
                  <pre>{resolution.resolved_code_preview}</pre>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
