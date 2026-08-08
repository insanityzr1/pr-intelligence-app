import React, { useState, useEffect } from 'react';
import { fetchPRDetail, analyzePRs, fetchPRChatHistory, postPRChatMessage } from '../api/client';
import FormattedMarkdown from './FormattedMarkdown';

export default function PRDetailDrawer({ prNumber, repoName, onClose, onResolveConflict }) {
  const [activeTab, setActiveTab] = useState('overview');
  const [pr, setPr] = useState(null);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);

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
            <button className="close-btn" onClick={onClose}>&times;</button>
          </div>
        </div>

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
        ) : (
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
        )}
      </div>
    </div>
  );
}
