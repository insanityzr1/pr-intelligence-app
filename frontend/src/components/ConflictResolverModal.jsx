import React, { useState, useEffect } from 'react';
import { fetchConflictResolution } from '../api/client';

export default function ConflictResolverModal({ prNumber, repoName, onClose }) {
  const [resolution, setResolution] = useState(null);
  const [loading, setLoading] = useState(true);
  const [copiedKey, setCopiedKey] = useState(null);

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

  function copyText(text, key) {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  }

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <div className="drawer-content modal-wide" onClick={e => e.stopPropagation()}>
        <div className="drawer-header">
          <div>
            <h2>⚠️ Conflict Resolver — PR #{prNumber}</h2>
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
            <div className="conflict-actions-bar">
              <a
                href={`/api/prs/${prNumber}/conflict-bash-script?repo_name=${encodeURIComponent(repoName || '')}`}
                className="btn btn-primary"
                download
              >
                ⚡ Create Bash File with Commands (.sh)
              </a>
              <a
                href={`/api/prs/${prNumber}/conflict-patch?repo_name=${encodeURIComponent(repoName || '')}`}
                className="btn btn-secondary"
                download
              >
                📥 Download .patch File
              </a>
            </div>

            <div className="conflict-analysis-card">
              <div className="section-block">
                <h3 className="section-title">🔍 Root Cause Analysis</h3>
                <p className="section-text">{resolution.conflict_cause}</p>
              </div>

              <div className="section-block">
                <h3 className="section-title">🎯 Recommended Merging Strategy</h3>
                <p className="section-text">{resolution.recommended_strategy}</p>
              </div>
            </div>

            {/* Actionable Step-by-Step Resolution Groups */}
            <div className="resolution-steps-container">
              <h3 className="section-title">📋 Actionable Resolution Steps & Commands</h3>
              
              {resolution.resolution_steps?.length > 0 ? (
                resolution.resolution_steps.map((step, idx) => (
                  <div key={idx} className="step-group-card">
                    <div className="step-group-header">
                      <h4>{step.title || `Step ${step.step_number || idx + 1}`}</h4>
                      {step.commands?.length > 0 && (
                        <button
                          onClick={() => copyText(step.commands.join('\n'), `step-${idx}`)}
                          className="btn-copy-sm"
                        >
                          {copiedKey === `step-${idx}` ? 'Copied All Step Commands!' : 'Copy Step Commands'}
                        </button>
                      )}
                    </div>

                    <p className="step-explanation">{step.explanation}</p>

                    <div className="step-commands-list">
                      {step.commands?.map((cmd, cIdx) => (
                        <div key={cIdx} className="command-row">
                          <code>{cmd}</code>
                          <button
                            onClick={() => copyText(cmd, `cmd-${idx}-${cIdx}`)}
                            className="btn-copy"
                          >
                            {copiedKey === `cmd-${idx}-${cIdx}` ? 'Copied!' : 'Copy'}
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              ) : (
                /* Fallback Flattened Commands */
                <div className="terminal-wizard">
                  <div className="commands-list">
                    {resolution.terminal_commands?.map((cmd, idx) => (
                      <div key={idx} className="command-row">
                        <code>{cmd}</code>
                        <button onClick={() => copyText(cmd, `legacy-${idx}`)} className="btn-copy">
                          {copiedKey === `legacy-${idx}` ? 'Copied!' : 'Copy'}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {resolution.resolved_code_preview && (
              <div className="code-preview-box">
                <h3 className="section-title">✨ 3-Way Merged Code Preview</h3>
                <pre>{resolution.resolved_code_preview}</pre>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
