import React from 'react';

export default function MetricsBar({ prs }) {
  const total = prs.length;
  const mergeable = prs.filter(p => p.mergeable === 'MERGEABLE').length;
  const conflicts = prs.filter(p => p.mergeable === 'CONFLICTING').length;
  const highRisk = prs.filter(p => p.risk === 'High').length;
  const aiAnalyzed = prs.filter(p => p.ai_review).length;

  return (
    <div className="metrics-grid">
      <div className="metric-card">
        <div className="label">Total Visible PRs</div>
        <div className="value">{total}</div>
      </div>
      <div className="metric-card">
        <div className="label">Mergeable</div>
        <div className="value green">{mergeable}</div>
      </div>
      <div className="metric-card">
        <div className="label">Merge Conflicts</div>
        <div className="value red">{conflicts}</div>
      </div>
      <div className="metric-card">
        <div className="label">High Risk</div>
        <div className="value amber">{highRisk}</div>
      </div>
      <div className="metric-card">
        <div className="label">AI Analyzed</div>
        <div className="value purple">{aiAnalyzed} / {total}</div>
      </div>
    </div>
  );
}
