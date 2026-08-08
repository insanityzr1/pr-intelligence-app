import React, { useState, useEffect, useRef } from 'react';
import { fetchPRDetail, analyzePRs, fetchPRChatHistory, postPRChatMessage } from '../api/client';
import FormattedMarkdown from './FormattedMarkdown';

function PRPanelContent({ prNumber, repoName, onResolveConflict, isCompact }) {
  const [activeSubTab, setActiveSubTab] = useState('overview');
  const [pr, setPr] = useState(null);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);

  // Chat State
  const [chatHistory, setChatHistory] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [sendingChat, setSendingChat] = useState(false);

  useEffect(() => {
    if (prNumber) {
      loadDetail();
      loadChat();
    }
  }, [prNumber, repoName]);

  async function loadDetail() {
    setLoading(true);
    try {
      const data = await fetchPRDetail(prNumber, repoName);
      setPr(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
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

  if (loading) {
    return <div className="panel-loading">Loading PR #{prNumber} details...</div>;
  }

  if (!pr) {
    return <div className="panel-error">PR #{prNumber} failed to load.</div>;
  }

  return (
    <div className={`pr-panel-inner ${isCompact ? 'compact' : ''}`}>
      {/* Panel Header */}
      <div className="panel-subhead">
        <div className="panel-title-area">
          <h3>PR #{prNumber}: {pr.title}</h3>
          <p className="subtitle">Author: @{pr.author} | Updated: {pr.updated_rel}</p>
        </div>

        <div className="panel-actions">
          <a href={pr.url} target="_blank" rel="noreferrer" className="btn btn-secondary btn-sm">
            GitHub ↗
          </a>
          {pr.mergeable === 'CONFLICTING' && (
            <button onClick={() => onResolveConflict(prNumber, pr.repo_name)} className="btn btn-warning btn-sm">
              ⚠️ Conflict Resolver
            </button>
          )}
          <button onClick={handleReAnalyze} disabled={analyzing} className="btn btn-primary btn-sm">
            {analyzing ? 'Analyzing...' : 'Re-Run AI Analysis'}
          </button>
        </div>
      </div>

      {/* Subtabs: Overview vs Chat */}
      <div className="panel-subtabs">
        <button
          className={`subtab-btn ${activeSubTab === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('overview')}
        >
          Overview & AI Review
        </button>
        <button
          className={`subtab-btn ${activeSubTab === 'chat' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('chat')}
        >
          💬 Chat with AI ({chatHistory.length})
        </button>
      </div>

      {activeSubTab === 'overview' ? (
        <div className="panel-body">
          {/* AI Review Card */}
          {pr.ai_review ? (
            <div className="ai-review-card">
              <div className="score-inline">
                <span className="score-label">Code Quality Score:</span>
                <strong className="score-badge-val">{pr.ai_review.code_quality_score} / 100</strong>
              </div>

              {/* Compact Callouts for Risks / Breaking Changes */}
              <div className="compact-callouts-row">
                {pr.ai_review.breaking_changes?.length > 0 && (
                  <div className="compact-callout warning">
                    <span className="callout-icon">⚠️</span>
                    <span className="callout-text">
                      <strong>Breaking Changes:</strong> {pr.ai_review.breaking_changes.join('; ')}
                    </span>
                  </div>
                )}

                {pr.ai_review.security_risks?.length > 0 && (
                  <div className="compact-callout danger">
                    <span className="callout-icon">🛡️</span>
                    <span className="callout-text">
                      <strong>Security Vector:</strong> {pr.ai_review.security_risks.join('; ')}
                    </span>
                  </div>
                )}
              </div>

              {/* AI Synthesis Section */}
              <div className="section-block">
                <h4 className="section-title">⚡ AI Executive Synthesis & Summary</h4>
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

          {/* PR Summary Card */}
          <div className="pr-summary-card">
            <h4 className="section-title">📝 PR Summary (Extracted Highlight)</h4>
            <p className="summary-text">{pr.summary}</p>
          </div>

          {/* Formatted Raw PR Body */}
          <div className="pr-description-card">
            <h4 className="section-title">📄 PR Description Excerpt (Author Body)</h4>
            <div className="description-container">
              <FormattedMarkdown content={pr.body} />
            </div>
          </div>
        </div>
      ) : (
        /* Chat Tab */
        <div className="panel-body chat-tab-body">
          <div className="chat-stream">
            {chatHistory.length === 0 ? (
              <div className="empty-box">No chat history yet. Ask the AI assistant anything about PR #{prNumber}!</div>
            ) : (
              chatHistory.map((msg, i) => (
                <div key={i} className={`chat-bubble ${msg.role}`}>
                  <div className="bubble-author">{msg.role === 'user' ? 'You' : 'AI Assistant'}</div>
                  <div className="bubble-text">{msg.message}</div>
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
      )}
    </div>
  );
}

export default function MultiPRWorkspace({ openPrs, activePrNumber, onSelectActivePr, onClosePr, onCloseAll, onResolveConflict }) {
  const [splitMode, setSplitMode] = useState(openPrs.length > 1);
  const [leftWidth, setLeftWidth] = useState(50); // percentage width for left panel in 2-split mode
  const isDragging = useRef(false);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, []);

  useEffect(() => {
    if (openPrs.length > 1) {
      setSplitMode(true);
    } else {
      setSplitMode(false);
    }
  }, [openPrs.length]);

  // Handle Resizable Split Handle
  function handleMouseDown(e) {
    isDragging.current = true;
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }

  function handleMouseMove(e) {
    if (!isDragging.current) return;
    const container = document.getElementById('split-workspace-container');
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const offsetX = e.clientX - rect.left;
    let pct = (offsetX / rect.width) * 100;
    if (pct < 20) pct = 20;
    if (pct > 80) pct = 80;
    setLeftWidth(pct);
  }

  function handleMouseUp() {
    isDragging.current = false;
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
  }

  if (openPrs.length === 0) return null;

  return (
    <div className="drawer-backdrop modal-backdrop-center" onClick={onCloseAll}>
      <div className={`multi-pr-modal-container ${openPrs.length === 1 ? 'single-pr-view' : 'multi-pr-view'}`} onClick={e => e.stopPropagation()}>
        {/* Workspace Top Tab Bar */}
        <div className="workspace-tab-bar">
          <div className="tabs-list">
            {openPrs.map(pr => (
              <div
                key={pr.prNumber}
                className={`workspace-tab ${activePrNumber === pr.prNumber ? 'active' : ''}`}
                onClick={() => onSelectActivePr(pr.prNumber)}
              >
                <span>PR #{pr.prNumber}</span>
                <button
                  className="close-tab-btn"
                  onClick={e => { e.stopPropagation(); onClosePr(pr.prNumber); }}
                >
                  &times;
                </button>
              </div>
            ))}
          </div>

          <div className="workspace-controls">
            {openPrs.length >= 2 && (
              <button
                className={`btn btn-secondary btn-sm ${splitMode ? 'active' : ''}`}
                onClick={() => setSplitMode(!splitMode)}
              >
                {splitMode ? '🔳 Single Tab View' : '🔲 Split Screen View'}
              </button>
            )}
            <button className="btn btn-secondary btn-sm" onClick={onCloseAll}>Close Workspace &times;</button>
          </div>
        </div>

        {/* Workspace Body */}
        {splitMode && openPrs.length >= 2 ? (
          <div id="split-workspace-container" className="split-workspace-body">
            {/* Left Panel (First PR) */}
            <div className="split-panel" style={{ width: `${leftWidth}%` }}>
              <PRPanelContent
                prNumber={openPrs[0].prNumber}
                repoName={openPrs[0].repoName}
                onResolveConflict={onResolveConflict}
                isCompact={true}
              />
            </div>

            {/* Draggable Resizable Handle */}
            <div
              className="split-resize-handle"
              onMouseDown={handleMouseDown}
              title="Drag to resize panels"
            >
              <div className="handle-bar" />
            </div>

            {/* Right Panel (Second PR or Active PR) */}
            <div className="split-panel" style={{ width: `${100 - leftWidth}%` }}>
              <PRPanelContent
                prNumber={openPrs[1]?.prNumber || activePrNumber}
                repoName={openPrs[1]?.repoName || openPrs[0].repoName}
                onResolveConflict={onResolveConflict}
                isCompact={true}
              />
            </div>
          </div>
        ) : (
          /* Single Tab Focused Panel (Centered & Wide) */
          <div className="single-workspace-body">
            {openPrs
              .filter(pr => pr.prNumber === (activePrNumber || openPrs[0].prNumber))
              .map(pr => (
                <PRPanelContent
                  key={pr.prNumber}
                  prNumber={pr.prNumber}
                  repoName={pr.repoName}
                  onResolveConflict={onResolveConflict}
                  isCompact={false}
                />
              ))}
          </div>
        )}
      </div>
    </div>
  );
}
