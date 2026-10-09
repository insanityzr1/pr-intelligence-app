import React, { useState, useEffect } from 'react';
import {
  fetchPRDetail,
  analyzePRs,
  fetchPRChatHistory,
  postPRChatMessage,
  fetchTagsMap,
  postReviewComment,
  syncLabels,
  triageCi,
  applyCiFix,
  downloadCiPatchUrl,
} from '../api/client';
import { useToast } from './ToastProvider';
import FormattedMarkdown from './FormattedMarkdown';
import PRTagBar from './PRTagBar';
import { refKey } from '../utils/prStats';

export default function PRDetailDrawer({ prNumber, repoName, onClose, onResolveConflict, initialTab = 'overview' }) {
  const toast = useToast();
  const [activeTab, setActiveTab] = useState(initialTab || 'overview');
  const [pr, setPr] = useState(null);
  const [activeTags, setActiveTags] = useState([]);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [posting, setPosting] = useState(false);

  // CI Triage State
  const [ciTriage, setCiTriage] = useState(null);
  const [loadingCi, setLoadingCi] = useState(false);
  const [applyingFix, setApplyingFix] = useState(false);
  const [applyCommand, setApplyCommand] = useState('');
  const [showRawLog, setShowRawLog] = useState(false);

  async function handlePostReview() {
    setPosting(true);
    try {
      await postReviewComment(prNumber, repoName || pr?.repo_name);
      toast.success(`Posted the AI review to PR #${prNumber}.`);
    } catch (err) {
      console.error(err);
      toast.error(`Could not post review: ${err.message}`);
    } finally {
      setPosting(false);
    }
  }

  async function handleSyncLabels() {
    setPosting(true);
    try {
      const res = await syncLabels(prNumber, repoName || pr?.repo_name);
      const applied = res.applied?.length || 0;
      if (res.failed?.length) {
        // Usually the label does not exist in the repo — worth naming rather
        // than reporting a blanket success.
        toast.error(`Applied ${applied}; ${res.failed.length} failed (label may not exist in the repo).`);
      } else {
        toast.success(`Synced ${applied} label${applied === 1 ? '' : 's'} to GitHub.`);
      }
    } catch (err) {
      console.error(err);
      toast.error(`Could not sync labels: ${err.message}`);
    } finally {
      setPosting(false);
    }
  }

  async function handleRunCiTriage(force = false) {
    setLoadingCi(true);
    try {
      const res = await triageCi(prNumber, repoName || pr?.repo_name, { force });
      setCiTriage(res.triage);
      setApplyCommand(res.apply_command || '');
      toast.success(`CI Failure diagnosed: ${res.triage?.failure_category?.toUpperCase() || 'Identified'}`);
    } catch (err) {
      console.error(err);
      toast.error(`CI Triage failed: ${err.message}`);
    } finally {
      setLoadingCi(false);
    }
  }

  async function handleApplyFix(action) {
    if (!ciTriage?.suggested_patch) return;
    setApplyingFix(true);
    try {
      const res = await applyCiFix(prNumber, {
        patch: ciTriage.suggested_patch,
        action,
        commitMessage: ciTriage.commit_message,
        repoName: repoName || pr?.repo_name
      });
      toast.success(res.result?.message || `Applied remediation to ${res.result?.target_branch}`);
    } catch (err) {
      console.error(err);
      toast.error(`Failed to apply fix: ${err.message}`);
    } finally {
      setApplyingFix(false);
    }
  }

  function handleCopyCommand() {
    if (!applyCommand) return;
    navigator.clipboard.writeText(applyCommand);
    toast.success('Copied git apply command to clipboard!');
  }

  // Chat State
  const [chatHistory, setChatHistory] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [sendingChat, setSendingChat] = useState(false);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    if (prNumber) {
      loadDetail();
      loadChat();
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [prNumber, repoName]);

  async function loadDetail() {
    setLoading(true);
    try {
      const data = await fetchPRDetail(prNumber, repoName);
      setPr(data);
      // Tags are keyed by repo, so load them only once the PR's own repo is known.
      await loadPRTags(repoName || data?.repo_name);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function loadPRTags(targetRepo) {
    // Never guess a repository name — without one the tag key is meaningless.
    if (!targetRepo) {
      setActiveTags([]);
      return;
    }
    try {
      const res = await fetchTagsMap();
      setActiveTags(res.tags_map?.[refKey(prNumber, targetRepo)] || []);
    } catch (err) {
      console.error(err);
    }
  }

  async function loadChat() {
    try {
      const data = await fetchPRChatHistory(prNumber, repoName);
      setChatHistory(data.history || []);
    } catch (err) {
      console.error(err);
    }
  }

  async function handleReAnalyze() {
    setAnalyzing(true);
    try {
      await analyzePRs([prNumber], true, repoName);
      await loadDetail();
    } catch (err) {
      console.error(err);
    } finally {
      setAnalyzing(false);
    }
  }

  async function handleSendChat(e) {
    e.preventDefault();
    if (!chatInput.trim() || sendingChat) return;
    const msg = chatInput.trim();
    setChatInput('');
    setSendingChat(true);

    setChatHistory(prev => [...prev, { role: 'user', message: msg, created_at: 'Just now' }]);

    try {
      const res = await postPRChatMessage(prNumber, msg, repoName);
      setChatHistory(res.history || []);
    } catch (err) {
      console.error(err);
    } finally {
      setSendingChat(false);
    }
  }

  if (!prNumber) return null;

  return (
    <div className="drawer-backdrop modal-backdrop-center" onClick={onClose}>
      <div className="drawer-content modal-extra-wide" onClick={e => e.stopPropagation()}>
        {/* Drawer Header */}
        <div className="drawer-header">
          <div>
            <h2>PR #{prNumber}: {pr?.title || 'Loading...'}</h2>
            <p className="subtitle">Author: @{pr?.author} | Updated: {pr?.updated_rel}</p>
          </div>
          
          <div className="drawer-header-right">
            <a href={pr?.url} target="_blank" rel="noreferrer" className="btn btn-secondary btn-sm">GitHub ↗</a>
            {pr?.mergeable === 'CONFLICTING' && (
              <button onClick={() => onResolveConflict(prNumber, pr.repo_name)} className="btn btn-warning btn-sm">
                ⚠️ Conflict Resolver
              </button>
            )}
            <button onClick={handleReAnalyze} disabled={analyzing} className="btn btn-primary btn-sm">
              {analyzing ? 'Analyzing...' : 'Re-Run AI Analysis'}
            </button>
            {/* Write-back: analysis that cannot leave the tool is analysis the
                rest of the team never sees. */}
            {pr?.ai_review && (
              <button onClick={handlePostReview} disabled={posting} className="btn btn-secondary btn-sm">
                {posting ? 'Posting…' : '💬 Post Review to GitHub'}
              </button>
            )}
            {activeTags.length > 0 && (
              <button onClick={handleSyncLabels} disabled={posting} className="btn btn-secondary btn-sm">
                🏷️ Sync Labels
              </button>
            )}
            <button className="close-btn" onClick={onClose}>&times;</button>
          </div>
        </div>

        {/* PR Tagging & Flagging Bar */}
        <PRTagBar
          prNumber={prNumber}
          repoName={repoName || pr?.repo_name}
          activeTags={activeTags}
          onTagsUpdated={loadPRTags}
        />

        {/* Subtabs */}
        <div className="drawer-subtabs">
          <button
            className={`subtab-btn ${activeTab === 'overview' ? 'active' : ''}`}
            onClick={() => setActiveTab('overview')}
          >
            Overview & AI Review
          </button>
          <button
            className={`subtab-btn ${activeTab === 'chat' ? 'active' : ''}`}
            onClick={() => setActiveTab('chat')}
          >
            💬 Chat with AI ({chatHistory.length})
          </button>
          <button
            className={`subtab-btn ${activeTab === 'ci-triage' ? 'active' : ''}`}
            onClick={() => {
              setActiveTab('ci-triage');
              if (!ciTriage && !loadingCi) handleRunCiTriage(false);
            }}
          >
            🛠️ CI Diagnostics & Fix {pr?.checks_state === 'FAILING' && <span className="tab-pill-danger">FAILING</span>}
          </button>
        </div>

        {loading ? (
          <div className="drawer-body loading">Loading PR #{prNumber} details...</div>
        ) : activeTab === 'overview' ? (
          <div className="drawer-body">
            {/* Tight 2-Column Overview Grid */}
            <div className="overview-grid">
              {/* Left Column: AI Synthesis & Review */}
              <div className="overview-col-left">
                {pr.ai_review ? (
                  <div className="ai-review-card">
                    <div className="score-inline">
                      <span className="score-label">Code Quality Score:</span>
                      <strong className="score-badge-val">{pr.ai_review.code_quality_score} / 100</strong>
                    </div>

                    {/* Compact Callouts */}
                    <div className="compact-callouts-row">
                      {pr.ai_review.breaking_changes?.length > 0 && (
                        <div className="compact-callout warning">
                          <span className="callout-icon">⚠️</span>
                          <span><strong>Breaking Changes:</strong> {pr.ai_review.breaking_changes.join('; ')}</span>
                        </div>
                      )}

                      {pr.ai_review.security_risks?.length > 0 && (
                        <div className="compact-callout danger">
                          <span className="callout-icon">🛡️</span>
                          <span><strong>Security Vectors:</strong> {pr.ai_review.security_risks.join('; ')}</span>
                        </div>
                      )}
                    </div>

                    <div className="section-block">
                      <h4 className="section-title">⚡ AI Executive Synthesis</h4>
                      <p className="section-text">{pr.ai_review.ai_summary}</p>
                    </div>

                    <div className="section-block">
                      <h4 className="section-title">🏗️ Architectural Impact</h4>
                      <p className="section-text">{pr.ai_review.architectural_impact}</p>
                    </div>

                    <div className="section-block">
                      <h4 className="section-title">🧪 Generated QA Scenarios</h4>
                      <ul className="qa-compact-list">
                        {pr.ai_review.qa_test_scenarios?.map((t, i) => <li key={i}>{t}</li>)}
                      </ul>
                    </div>
                  </div>
                ) : (
                  <div className="ai-review-card empty">
                    <p>No AI analysis generated yet.</p>
                    <button onClick={handleReAnalyze} className="btn btn-primary btn-sm">Generate AI Review</button>
                  </div>
                )}
              </div>

              {/* Right Column: PR Summary & Formatted Description */}
              <div className="overview-col-right">
                <div className="pr-summary-card">
                  <h4 className="section-title">📝 PR Summary Highlight</h4>
                  <p className="summary-text">{pr.summary}</p>
                </div>

                <div className="pr-description-card">
                  <h4 className="section-title">📄 PR Description Excerpt (Author Body)</h4>
                  <div className="description-container">
                    <FormattedMarkdown content={pr.body} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : activeTab === 'chat' ? (
          /* Interactive Chat Tab */
          <div className="drawer-body chat-tab-body">
            <div className="chat-stream">
              {chatHistory.length === 0 ? (
                <div className="empty-box">No chat history yet. Ask the AI assistant anything about PR #{prNumber}!</div>
              ) : (
                chatHistory.map((msg, i) => (
                  <div key={i} className={`chat-bubble ${msg.role}`}>
                    <div className="bubble-author">{msg.role === 'user' ? 'You' : 'AI Assistant'}</div>
                    <div className="bubble-text">
                      {msg.role === 'assistant' ? (
                        <FormattedMarkdown content={msg.message} />
                      ) : (
                        msg.message
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>

            <form onSubmit={handleSendChat} className="chat-input-form">
              <input
                type="text"
                placeholder="Ask AI about tests, refactors, edge cases, or code diff..."
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                disabled={sendingChat}
              />
              <button type="submit" className="btn btn-primary" disabled={sendingChat || !chatInput.trim()}>
                {sendingChat ? 'Thinking...' : 'Send'}
              </button>
            </form>
          </div>
        ) : (
          /* CI Diagnostics & Remediation Tab */
          <div className="drawer-body ci-triage-body">
            <div className="ci-header-status-card">
              <div className="ci-status-info">
                <h3>CI Pipeline Status: <span className={`ci-badge ${(pr?.checks_state || 'none').toLowerCase()}`}>{pr?.checks_state || 'UNKNOWN'}</span></h3>
                <p className="subtitle">
                  {pr?.checks_failed > 0
                    ? `${pr.checks_failed} failing check(s): ${pr.failed_checks?.join(', ') || 'Workflow error'}`
                    : pr?.checks_state === 'PASSING'
                    ? 'All workflow checks passing.'
                    : 'Check run summary unavailable or pending.'}
                </p>
              </div>
              <div className="ci-header-actions">
                <button
                  onClick={() => handleRunCiTriage(true)}
                  disabled={loadingCi}
                  className="btn btn-primary btn-sm"
                >
                  {loadingCi ? 'Diagnosing...' : '🔍 Re-Run Diagnostics'}
                </button>
              </div>
            </div>

            {loadingCi ? (
              <div className="empty-box">
                <div className="loading-spinner">⚙️</div>
                <p>Analyzing GitHub Actions failure logs & generating fix diff...</p>
              </div>
            ) : ciTriage ? (
              <div className="ci-triage-content">
                {/* Executive Diagnosis */}
                <div className="ai-review-card">
                  <div className="score-inline">
                    <span className="score-label">Category:</span>
                    <strong className="badge badge-purple">{ciTriage.failure_category?.toUpperCase()}</strong>
                    <span className="score-label" style={{ marginLeft: '1.5rem' }}>Confidence:</span>
                    <strong className={`badge ${ciTriage.confidence === 'High' ? 'badge-green' : 'badge-amber'}`}>{ciTriage.confidence}</strong>
                  </div>

                  <div className="section-block">
                    <h4 className="section-title">⚡ Root Cause Executive Summary</h4>
                    <p className="section-text">{ciTriage.summary}</p>
                  </div>

                  <div className="section-block">
                    <h4 className="section-title">🔍 In-Depth Root Cause Analysis</h4>
                    <FormattedMarkdown content={ciTriage.root_cause_analysis} />
                  </div>

                  {ciTriage.affected_files?.length > 0 && (
                    <div className="section-block">
                      <h4 className="section-title">📁 Identified Files</h4>
                      <div className="ci-files-list">
                        {ciTriage.affected_files.map((f, i) => (
                          <span key={i} className="ci-file-tag">{f}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Remediation Diff & Actions */}
                {ciTriage.suggested_patch ? (
                  <div className="ci-remediation-card">
                    <div className="ci-remediation-header">
                      <div>
                        <h4>✨ AI-Synthesized Remediation Diff</h4>
                        <p className="subtitle">Commit message: <code>{ciTriage.commit_message}</code></p>
                      </div>
                      <div className="ci-remediation-actions">
                        <button
                          onClick={() => handleApplyFix('push_to_pr')}
                          disabled={applyingFix}
                          className="btn btn-success btn-sm"
                          title="Directly push remediation commit to PR branch"
                        >
                          {applyingFix ? 'Applying...' : '🚀 Push Fix to PR Branch'}
                        </button>
                        <button
                          onClick={() => handleApplyFix('create_branch')}
                          disabled={applyingFix}
                          className="btn btn-secondary btn-sm"
                          title="Create patch/pr-{num}-ci-fix branch on GitHub"
                        >
                          🌿 Create Patch Branch
                        </button>
                        <a
                          href={downloadCiPatchUrl(prNumber, repoName || pr?.repo_name)}
                          className="btn btn-secondary btn-sm"
                          download={`pr-${prNumber}-ci-fix.patch`}
                        >
                          💾 Download .patch
                        </a>
                        <button
                          onClick={handleCopyCommand}
                          className="btn btn-secondary btn-sm"
                          title="Copy git apply terminal command"
                        >
                          📋 Copy git Command
                        </button>
                      </div>
                    </div>

                    <div className="patch-diff-container">
                      <pre className="patch-diff-code"><code>{ciTriage.suggested_patch}</code></pre>
                    </div>
                  </div>
                ) : (
                  <div className="empty-box">
                    <p>No automated diff could be synthesized. Review the diagnosis recommendations and CI log below.</p>
                  </div>
                )}

                {/* Raw CI Log Collapsible */}
                {ciTriage.raw_log_snippet && (
                  <div className="ci-raw-log-section">
                    <button
                      className="btn btn-link-sm toggle-log-btn"
                      onClick={() => setShowRawLog(!showRawLog)}
                    >
                      {showRawLog ? '▼ Hide Failing CI Log Snippet' : '▶ View Failing CI Log Snippet'}
                    </button>
                    {showRawLog && (
                      <pre className="raw-ci-log-box">
                        <code>{ciTriage.raw_log_snippet}</code>
                      </pre>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="empty-box">
                <p>No CI diagnostics run for PR #{prNumber} yet.</p>
                <button onClick={() => handleRunCiTriage(true)} className="btn btn-primary btn-sm">
                  Run CI Failure Diagnostics
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
