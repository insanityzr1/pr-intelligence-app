import React, { useState, useEffect } from 'react';
import { fetchPRDetail, analyzePRs } from '../api/client';

export default function PRDetailDrawer({ prNumber, onClose }) {
  const [pr, setPr] = useState(null);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);

  useEffect(() => {
    if (prNumber) {
      loadDetail();
    }
  }, [prNumber]);

  async function loadDetail() {
    setLoading(true);
    try {
      const data = await fetchPRDetail(prNumber);
      setPr(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleReAnalyze() {
    setAnalyzing(true);
    try {
      await analyzePRs([prNumber], true);
      await loadDetail();
    } catch (err) {
      console.error(err);
    } finally {
      setAnalyzing(false);
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

        {loading ? (
          <div className="drawer-body loading">Loading PR details...</div>
        ) : (
          <div className="drawer-body">
            <div className="drawer-actions">
              <a href={pr.url} target="_blank" rel="noreferrer" className="btn btn-secondary">Open on GitHub ↗</a>
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

                <h3>AI Executive Summary</h3>
                <p>{pr.ai_review.ai_summary}</p>

                <h3>Architectural Impact</h3>
                <p>{pr.ai_review.architectural_impact}</p>

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

                <h3>🧪 Generated QA Test Scenarios</h3>
                <ol className="qa-list">
                  {pr.ai_review.qa_test_scenarios?.map((t, i) => <li key={i}>{t}</li>)}
                </ol>
              </div>
            ) : (
              <div className="ai-review-box empty">
                <p>No AI analysis generated yet for this commit.</p>
                <button onClick={handleReAnalyze} className="btn btn-primary">Generate AI Analysis Now</button>
              </div>
            )}

            {/* Description Excerpt */}
            <div className="pr-description-box">
              <h3>PR Description Excerpt</h3>
              <div className="description-content">{pr.body || 'No description provided.'}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
