import React from 'react';
import { computePrStats } from '../utils/prStats';

export default function TopHeader({
  activeTab,
  selectedRepo,
  prs = [],
  onMobileMenuToggle,
  searchQuery,
  setSearchQuery
}) {
  const getTabDetails = (tab) => {
    switch (tab) {
      case 'matrix':
        return { title: 'PR Matrix', category: 'PR Intelligence', icon: '📊', desc: 'AI Risk Triage & Review Matrix' };
      case 'conflicts':
        return { title: 'Collision Matrix', category: 'PR Intelligence', icon: '⚡', desc: 'Cross-PR File & Code Conflict Detector' };
      case 'workspaces':
        return { title: 'PR Workspaces', category: 'Release Management', icon: '📦', desc: 'Isolated Staging Workspaces & Merge Dry-Runs' };
      case 'release':
        return { title: 'Release Builder', category: 'Release Management', icon: '🚀', desc: 'Automated Changelog & Release Tag Generator' };
      default:
        return { title: 'Dashboard', category: 'Overview', icon: '⚡', desc: 'Multi-Repo PR Triage & Automation' };
    }
  };

  const details = getTabDetails(activeTab);

  // Compute inline KPI stats from the canonical selectors so these chips can never
  // drift from the ones rendered by PRCommandBar.
  const {
    total: totalCount,
    conflicts: conflictCount,
    highRisk: highRiskCount,
    clean: readyCount,
  } = computePrStats(prs);

  return (
    <header className="top-header">
      <div className="top-header-left">
        <button 
          className="mobile-hamburger-btn"
          onClick={onMobileMenuToggle}
          title="Open Navigation Menu"
        >
          ☰
        </button>

        <div className="top-header-breadcrumbs">
          <span className="breadcrumb-category">{details.category}</span>
          <span className="breadcrumb-separator">/</span>
          <span className="breadcrumb-current">
            <span className="breadcrumb-icon">{details.icon}</span>
            {details.title}
          </span>
        </div>

        {selectedRepo && (
          <div className="top-repo-pill" title={`Filtered by repository: ${selectedRepo}`}>
            <span className="repo-pill-icon">📦</span>
            <span className="repo-pill-name">{selectedRepo}</span>
          </div>
        )}
      </div>

      <div className="top-header-center">
        <div className="top-search-bar">
          <span className="search-icon">🔍</span>
          <input
            type="text"
            placeholder="Search PRs, authors, tags, branches..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="top-search-input"
          />
          {searchQuery && (
            <button 
              className="search-clear-btn" 
              onClick={() => setSearchQuery('')}
              title="Clear search"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      <div className="top-header-right">
        <div className="top-kpi-group">
          <div className="kpi-chip kpi-total" title="Total Pull Requests">
            <span className="kpi-label">PRs</span>
            <span className="kpi-val">{totalCount}</span>
          </div>

          <div className={`kpi-chip kpi-conflicts ${conflictCount > 0 ? 'alert' : ''}`} title="PRs with Conflicts">
            <span className="kpi-label">Conflicts</span>
            <span className="kpi-val">{conflictCount}</span>
          </div>

          <div className={`kpi-chip kpi-risk ${highRiskCount > 0 ? 'warning' : ''}`} title="High Risk PRs">
            <span className="kpi-label">High Risk</span>
            <span className="kpi-val">{highRiskCount}</span>
          </div>

          <div className="kpi-chip kpi-ready" title="Ready to Merge">
            <span className="kpi-label">Clean</span>
            <span className="kpi-val">{readyCount}</span>
          </div>
        </div>
      </div>
    </header>
  );
}
