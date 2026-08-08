import React, { useState, useRef, useEffect } from 'react';

export default function PRCommandBar({
  prs = [],
  search,
  setSearch,
  activeKpis = {},
  toggleKpi,
  resetKpis,
  tagFilter, setTagFilter,
  statusFilter, setStatusFilter,
  typeFilter, setTypeFilter,
  subtypeFilter, setSubtypeFilter,
  currStatusFilter, setCurrStatusFilter,
  riskFilter, setRiskFilter,
  actionFilter, setActionFilter,
  availableTags = [],
  statuses = [],
  types = [],
  subtypes = [],
  currStatuses = [],
  risks = [],
  actions = [],
  clearAllFilters
}) {
  const [showPopover, setShowPopover] = useState(false);
  const popoverRef = useRef(null);

  // Close popover when clicking outside
  useEffect(() => {
    function handleClickOutside(e) {
      if (popoverRef.current && !popoverRef.current.contains(e.target)) {
        setShowPopover(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Compute stat counts
  const total = prs.length;
  const mergeableCount = prs.filter(p => p.mergeable === 'MERGEABLE').length;
  const conflictsCount = prs.filter(p => p.mergeable === 'CONFLICTING').length;
  const highRiskCount = prs.filter(p => p.risk === 'High').length;
  const aiAnalyzedCount = prs.filter(p => p.ai_review).length;

  // Calculate active dropdown filters count
  const dropdownFilters = [tagFilter, statusFilter, typeFilter, subtypeFilter, currStatusFilter, riskFilter, actionFilter];
  const activeDropdownCount = dropdownFilters.filter(Boolean).length;
  const hasActiveKpi = Object.values(activeKpis).some(Boolean);
  const hasAnyFilter = Boolean(search) || hasActiveKpi || activeDropdownCount > 0;

  return (
    <div className="pr-command-bar">
      {/* KPI Stat Chips (Interactive Multi-Select Filters) */}
      <div className="command-kpis-group">
        <button
          className={`kpi-chip-btn kpi-all ${!hasActiveKpi ? 'active' : ''}`}
          onClick={resetKpis}
          title="Show All PRs"
        >
          <span className="chip-label">Total</span>
          <span className="chip-val">{total}</span>
        </button>

        <button
          className={`kpi-chip-btn kpi-mergeable ${activeKpis.mergeable ? 'active' : ''}`}
          onClick={() => toggleKpi('mergeable')}
          title="Click to toggle Mergeable filter"
        >
          <span className="chip-label">Mergeable</span>
          <span className="chip-val green">{mergeableCount}</span>
        </button>

        <button
          className={`kpi-chip-btn kpi-conflicts ${activeKpis.conflicts ? 'active' : ''}`}
          onClick={() => toggleKpi('conflicts')}
          title="Click to toggle Conflicts filter"
        >
          <span className="chip-label">Conflicts</span>
          <span className="chip-val red">{conflictsCount}</span>
        </button>

        <button
          className={`kpi-chip-btn kpi-risk ${activeKpis.highRisk ? 'active' : ''}`}
          onClick={() => toggleKpi('highRisk')}
          title="Click to toggle High Risk filter"
        >
          <span className="chip-label">High Risk</span>
          <span className="chip-val amber">{highRiskCount}</span>
        </button>

        <button
          className={`kpi-chip-btn kpi-ai ${activeKpis.aiAnalyzed ? 'active' : ''}`}
          onClick={() => toggleKpi('aiAnalyzed')}
          title="Click to toggle AI Analyzed filter"
        >
          <span className="chip-label">AI Analyzed</span>
          <span className="chip-val purple">{aiAnalyzedCount}/{total}</span>
        </button>
      </div>

      {/* Center Search Input */}
      <div className="command-search-group">
        <span className="search-icon">🔍</span>
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Filter PR ID, title, summary, author..."
          className="command-search-input"
        />
        {search && (
          <button className="search-clear" onClick={() => setSearch('')} title="Clear search">
            ✕
          </button>
        )}
      </div>

      {/* Right Controls: More Filters Popover & Clear All */}
      <div className="command-actions-group" ref={popoverRef}>
        <button
          className={`btn-popover-toggle ${showPopover || activeDropdownCount > 0 ? 'active' : ''}`}
          onClick={() => setShowPopover(!showPopover)}
          title="Toggle Detailed Filters"
        >
          <span>⚙️ Filters</span>
          {activeDropdownCount > 0 && (
            <span className="popover-count-badge">{activeDropdownCount}</span>
          )}
        </button>

        {hasAnyFilter && (
          <button
            className="btn-clear-all"
            onClick={clearAllFilters}
            title="Reset all filters"
          >
            Clear All ✕
          </button>
        )}

        {/* Floating Glassmorphic Popover Menu */}
        {showPopover && (
          <div className="filters-popover-menu">
            <div className="popover-header">
              <h3>Detailed PR Filters</h3>
              <button className="popover-close-btn" onClick={() => setShowPopover(false)}>✕</button>
            </div>

            <div className="popover-grid">
              <div className="popover-field">
                <label>Tag / Flag</label>
                <select value={tagFilter} onChange={e => setTagFilter(e.target.value)}>
                  <option value="">All Tags & Flags ({availableTags.length})</option>
                  {availableTags.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>

              <div className="popover-field">
                <label>Risk Level</label>
                <select value={riskFilter} onChange={e => setRiskFilter(e.target.value)}>
                  <option value="">All Risk Levels</option>
                  {risks.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>

              <div className="popover-field">
                <label>Status</label>
                <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                  <option value="">All Statuses</option>
                  {statuses.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>

              <div className="popover-field">
                <label>Type</label>
                <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
                  <option value="">All Types</option>
                  {types.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>

              <div className="popover-field">
                <label>Subtype</label>
                <select value={subtypeFilter} onChange={e => setSubtypeFilter(e.target.value)}>
                  <option value="">All Subtypes</option>
                  {subtypes.map(st => <option key={st} value={st}>{st}</option>)}
                </select>
              </div>

              <div className="popover-field">
                <label>Current Status</label>
                <select value={currStatusFilter} onChange={e => setCurrStatusFilter(e.target.value)}>
                  <option value="">All Current Statuses</option>
                  {currStatuses.map(cs => <option key={cs} value={cs}>{cs}</option>)}
                </select>
              </div>

              <div className="popover-field full-width">
                <label>Recommended Action</label>
                <select value={actionFilter} onChange={e => setActionFilter(e.target.value)}>
                  <option value="">All Recommended Actions</option>
                  {actions.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
              </div>
            </div>

            <div className="popover-footer">
              <button 
                className="btn-popover-done" 
                onClick={() => setShowPopover(false)}
              >
                Apply & Close
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
