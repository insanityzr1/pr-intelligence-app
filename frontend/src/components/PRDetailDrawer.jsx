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

  if (!prNumber) return null;

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <div className="drawer-content" onClick={e => e.stopPropagation()}>
        <div className="drawer-header">
          <div>
            <h2>PR #{prNumber}: {pr?.title || 'Loading...'}</h2>
            <p className="subtitle">Author: @{pr?.author} | Updated: {pr?.updated_rel}</p>
          </div>
          <button className="close-btn" onClick={onClose}>&times;</button>
        </div>

        <div className="drawer-subtabs">
          <button className={`subtab-btn ${activeTab === 'overview' ? 'active' : ''}`} onClick={() => setActiveTab('overview')}>
            Overview & AI Review
          </button>
          <button className={`subtab-btn ${activeTab === 'chat' ? 'active' : ''}`} onClick={() => setActiveTab('chat')}>
            💬 Chat with AI ({chatHistory.length})
          </button>
        </div>

        {loading ? (
          <div className="drawer-body loading">Loading PR details...</div>
        ) : activeTab === 'overview' ? (
          <div className="drawer-body">
            <div className="drawer-actions">
              <a href={pr.url} target="_blank" rel="noreferrer" className="btn btn-secondary">Open on GitHub ↗</a>
              {pr.mergeable === 'CONFLICTING' && (
                <button onClick={() => onResolveConflict(prNumber, pr.repo_name)} className="btn btn-warning">
                  ⚠️ Conflict Resolver
                </button>
              )}
              <button onClick={handleReAnalyze} disabled={analyzing} className="btn btn-primary">
                {analyzing ? 'Running AI Analysis...' : 'Re-Run AI Analysis'}
              </button>
            </div>

            {/* AI Review Section */}
            {pr.ai_review ? (
              <div className="ai-review-box">
                <div className="score-badge">
                  <span>Quality Score</span>
                  <strong>{pr.ai_review.code_quality_score} / 100</strong>
                </div>

                <div className="section-block">
                  <h3 className="section-title">AI Executive Summary</h3>
                  <p className="section-text">{pr.ai_review.ai_summary}</p>
                </div>

                <div className="section-block">
                  <h3 className="section-title">Architectural Impact</h3>
                  <p className="section-text">{pr.ai_review.architectural_impact}</p>
                </div>

                {pr.ai_review.breaking_changes?.length > 0 && (
                  <div className="alert alert-warning">
                    <h4>⚠️ Potential Breaking Changes</h4>
                    <ul>
                      {pr.ai_review.breaking_changes.map((b, i) => <li key={i}>{b}</li>)}
                    </ul>
                  </div>
                )}

                {pr.ai_review.security_risks?.length > 0 && (
                  <div className="alert alert-danger">
                    <h4>🛡️ Security Vectors & Code Hygiene</h4>
                    <ul>
                      {pr.ai_review.security_risks.map((s, i) => <li key={i}>{s}</li>)}
                    </ul>
                  </div>
                )}

                <div className="section-block">
                  <h3 className="section-title">🧪 Generated QA Test Scenarios</h3>
                  <ol className="qa-list">
                    {pr.ai_review.qa_test_scenarios?.map((t, i) => <li key={i}>{t}</li>)}
                  </ol>
                </div>
              </div>
            ) : (
              <div className="ai-review-box empty">
                <p>No AI analysis generated yet for this commit.</p>
                <button onClick={handleReAnalyze} className="btn btn-primary">Generate AI Analysis Now</button>
              </div>
            )}

            {/* Formatted PR Description Excerpt */}
            <div className="pr-description-box">
              <h3 className="section-title">PR Description Excerpt</h3>
              <div className="description-container">
                <FormattedMarkdown content={pr.body} />
              </div>
            </div>
          </div>
        ) : (
          /* Interactive Chat Tab */
          <div className="drawer-body chat-tab-body">
            <div className="chat-stream">
              {chatHistory.length === 0 ? (
                <div className="empty-box">No chat messages yet. Ask the AI assistant anything about PR #{prNumber}!</div>
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
    </div>
  );
}
