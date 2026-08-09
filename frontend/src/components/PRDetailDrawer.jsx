import React, { useState, useEffect } from 'react';
import { fetchPRDetail, analyzePRs, fetchPRChatHistory, postPRChatMessage, fetchTagsMap } from '../api/client';
import FormattedMarkdown from './FormattedMarkdown';
import PRTagBar from './PRTagBar';

export default function PRDetailDrawer({ prNumber, repoName, onClose, onResolveConflict, addToast }) {
  const [activeTab, setActiveTab] = useState('overview');
  const [pr, setPr] = useState(null);
  const [activeTags, setActiveTags] = useState([]);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);

  // Chat State
  const [chatHistory, setChatHistory] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [sendingChat, setSendingChat] = useState(false);

  const quickPrompts = [
    "Explain breaking changes",
    "Summarize security risks",
    "Draft a release changelog note",
    "Suggest regression test scenarios"
  ];

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    if (prNumber) {
      loadDetail();
      loadChat();
      loadPRTags();
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
    } catch (err) {
      console.error(err);
      if (addToast) addToast('Failed to load PR details', 'error');
    } finally {
      setLoading(false);
    }
  }

  async function loadPRTags() {
    try {
      const res = await fetchTagsMap();
      const targetRepo = repoName || 'rpnunez/wp-ai-scheduler';
      const key = `${targetRepo}#${prNumber}`;
      setActiveTags(res.tags_map?.[key] || []);
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
      if (addToast) addToast('AI Review regenerated successfully!', 'success');
    } catch (err) {
      console.error(err);
      if (addToast) addToast('AI Analysis failed', 'error');
    } finally {
      setAnalyzing(false);
    }
  }

  async function handleSendChat(e, promptText) {
    if (e) e.preventDefault();
    const query = promptText || chatInput.trim();
    if (!query || sendingChat) return;
    setChatInput('');
    setSendingChat(true);

    setChatHistory(prev => [...prev, { role: 'user', message: query, created_at: 'Just now' }]);

    try {
      const res = await postPRChatMessage(prNumber, query, repoName);
      setChatHistory(res.history || []);
    } catch (err) {
      console.error(err);
      if (addToast) addToast('Failed to send AI chat message', 'error');
    } finally {
      setSendingChat(false);
    }
  }

  function copyToClipboard(text, label) {
    if (!text) return;
    navigator.clipboard.writeText(text);
    if (addToast) addToast(`Copied ${label} to clipboard!`, 'success');
  }

  if (!prNumber) return null;

  const score = pr?.ai_review?.code_quality_score ?? 0;
  const scoreClass = score >= 80 ? 'score-high' : score >= 60 ? 'score-med' : 'score-low';

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
                    {/* Visual Code Quality Score Ring/Meter */}
                    <div className="score-meter-container">
                      <div className="score-meter-header">
                        <span className="score-label">Code Quality Rating</span>
                        <button
                          onClick={() => copyToClipboard(pr.ai_review.ai_summary, 'AI Synthesis')}
                          className="btn-copy-sm"
                          title="Copy AI Summary"
                        >
                          📋 Copy Summary
                        </button>
                      </div>
                      <div className="score-gauge-bar">
                        <div
                          className={`score-gauge-fill ${scoreClass}`}
                          style={{ width: `${Math.min(100, Math.max(0, score))}%` }}
                        />
                      </div>
                      <div className="score-meter-footer">
                        <span className="score-val-large">{score} / 100</span>
                        <span className="score-health-tag">
                          {score >= 80 ? '🟢 Excellent' : score >= 60 ? '🟡 Moderate Risk' : '🔴 High Alert'}
                        </span>
                      </div>
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
                      <div className="section-title-row">
                        <h4 className="section-title">🧪 Generated QA Scenarios</h4>
                        <button
                          onClick={() => copyToClipboard(pr.ai_review.qa_test_scenarios?.join('\n'), 'QA Scenarios')}
                          className="btn-copy-xs"
                          title="Copy QA Scenarios"
                        >
                          📋 Copy Tests
                        </button>
                      </div>
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
        ) : (
          /* Interactive Chat Tab */
          <div className="drawer-body chat-tab-body">
            {/* Quick Prompt Suggestion Pills */}
            <div className="quick-prompts-bar">
              <span className="quick-prompt-label">Quick Prompts:</span>
              {quickPrompts.map((qp, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSendChat(null, qp)}
                  className="quick-prompt-pill"
                  disabled={sendingChat}
                >
                  💡 {qp}
                </button>
              ))}
            </div>

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
        )}
      </div>
    </div>
  );
}
