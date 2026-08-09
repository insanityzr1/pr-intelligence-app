import React, { useState, useEffect } from 'react';
import { fetchTagsMap } from '../api/client';
import PRCommandBar from './PRCommandBar';

export default function PRMatrix({ prs, onSelectPr, addToast }) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [subtypeFilter, setSubtypeFilter] = useState('');
  const [currStatusFilter, setCurrStatusFilter] = useState('');
  const [riskFilter, setRiskFilter] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [tagFilter, setTagFilter] = useState('');

  // Layout Display View Mode: 'table' or 'cards'
  const [viewMode, setViewMode] = useState('table');

  // Interactive KPI Multi-Select Filters
  const [activeKpis, setActiveKpis] = useState({
    mergeable: false,
    conflicts: false,
    highRisk: false,
    aiAnalyzed: false
  });

  const [tagsMap, setTagsMap] = useState({});
  const [sortKey, setSortKey] = useState('updated_at');
  const [sortDir, setSortDir] = useState('desc');

  useEffect(() => {
    loadTags();
  }, []);

  async function loadTags() {
    try {
      const res = await fetchTagsMap();
      setTagsMap(res.tags_map || {});
    } catch (err) {
      console.error(err);
    }
  }

  function toggleKpi(key) {
    setActiveKpis(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  }

  function resetKpis() {
    setActiveKpis({
      mergeable: false,
      conflicts: false,
      highRisk: false,
      aiAnalyzed: false
    });
  }

  function clearAllFilters() {
    setSearch('');
    setStatusFilter('');
    setTypeFilter('');
    setSubtypeFilter('');
    setCurrStatusFilter('');
    setRiskFilter('');
    setActionFilter('');
    setTagFilter('');
    resetKpis();
    if (addToast) addToast('All filters reset', 'info');
  }

  const statuses = Array.from(new Set(prs.map(p => p.status))).sort();
  const types = Array.from(new Set(prs.map(p => p.type))).sort();
  const subtypes = Array.from(new Set(prs.map(p => p.subtype))).sort();
  const currStatuses = Array.from(new Set(prs.map(p => p.current_status))).sort();
  const risks = ['Low', 'Medium', 'High'];
  const actions = Array.from(new Set(prs.map(p => p.rec_action))).sort();

  // Extract all unique tags present across PRs
  const allTagsSet = new Set();
  Object.values(tagsMap).forEach(list => list.forEach(t => allTagsSet.add(t)));
  const availableTags = Array.from(allTagsSet).sort();

  const filtered = prs.filter(pr => {
    const key = `${pr.repo_name}#${pr.number}`;
    const prTags = tagsMap[key] || [];

    const mSearch = !search || 
      pr.id_str.toLowerCase().includes(search.toLowerCase()) || 
      pr.title.toLowerCase().includes(search.toLowerCase()) || 
      pr.summary.toLowerCase().includes(search.toLowerCase()) || 
      pr.author.toLowerCase().includes(search.toLowerCase());

    const mStatus = !statusFilter || pr.status === statusFilter;
    const mType = !typeFilter || pr.type === typeFilter;
    const mSubtype = !subtypeFilter || pr.subtype === subtypeFilter;
    const mCurrStatus = !currStatusFilter || pr.current_status === currStatusFilter;
    const mRisk = !riskFilter || pr.risk === riskFilter;
    const mAction = !actionFilter || pr.rec_action === actionFilter;
    const mTag = !tagFilter || prTags.includes(tagFilter);

    // KPI Multi-select Filters
    let mKpi = true;
    if (activeKpis.mergeable && pr.mergeable !== 'MERGEABLE') mKpi = false;
    if (activeKpis.conflicts && pr.mergeable !== 'CONFLICTING') mKpi = false;
    if (activeKpis.highRisk && pr.risk !== 'High') mKpi = false;
    if (activeKpis.aiAnalyzed && !pr.ai_review) mKpi = false;

    return mSearch && mStatus && mType && mSubtype && mCurrStatus && mRisk && mAction && mTag && mKpi;
  });

  const sorted = [...filtered].sort((a, b) => {
    let valA = a[sortKey];
    let valB = b[sortKey];
    if (typeof valA === 'string') valA = valA.toLowerCase();
    if (typeof valB === 'string') valB = valB.toLowerCase();
    if (valA < valB) return sortDir === 'asc' ? -1 : 1;
    if (valA > valB) return sortDir === 'asc' ? 1 : -1;
    return 0;
  });

  function handleSort(key) {
    if (sortKey === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir((key === 'updated_at' || key === 'number' || key === 'risk_score') ? 'desc' : 'asc');
    }
  }

  return (
    <div className="matrix-wrapper">
      {/* Condensed PR Command Bar (KPI Stat Chips + Search + View Switcher + Popover Filters) */}
      <PRCommandBar
        prs={prs}
        search={search}
        setSearch={setSearch}
        activeKpis={activeKpis}
        toggleKpi={toggleKpi}
        resetKpis={resetKpis}
        tagFilter={tagFilter} setTagFilter={setTagFilter}
        statusFilter={statusFilter} setStatusFilter={setStatusFilter}
        typeFilter={typeFilter} setTypeFilter={setTypeFilter}
        subtypeFilter={subtypeFilter} setSubtypeFilter={setSubtypeFilter}
        currStatusFilter={currStatusFilter} setCurrStatusFilter={setCurrStatusFilter}
        riskFilter={riskFilter} setRiskFilter={setRiskFilter}
        actionFilter={actionFilter} setActionFilter={setActionFilter}
        availableTags={availableTags}
        statuses={statuses}
        types={types}
        subtypes={subtypes}
        currStatuses={currStatuses}
        risks={risks}
        actions={actions}
        clearAllFilters={clearAllFilters}
        viewMode={viewMode}
        setViewMode={setViewMode}
      />

      {viewMode === 'cards' ? (
        /* Glassmorphic Card Grid View */
        <div className="pr-cards-grid">
          {sorted.length === 0 ? (
            <div className="empty-box card-empty">No Pull Requests match the selected filters.</div>
          ) : (
            sorted.map(pr => {
              const key = `${pr.repo_name}#${pr.number}`;
              const prTags = tagsMap[key] || [];

              return (
                <div key={key} className="pr-glass-card" onClick={() => onSelectPr(pr.number)}>
                  <div className="card-top-row">
                    <div className="card-pr-id">
                      <span className="pr-num">#{pr.number}</span>
                      {pr.repo_name && <span className="repo-badge">{pr.repo_name}</span>}
                    </div>
                    <span className={`risk-badge ${pr.risk.toLowerCase()}`}>
                      {pr.risk_desc || pr.risk} Risk
                    </span>
                  </div>

                  <h3 className="card-pr-title">{pr.title}</h3>
                  <p className="card-pr-summary">{pr.summary}</p>

                  {prTags.length > 0 && (
                    <div className="pr-tags-list card-tags">
                      {prTags.map(tag => (
                        <span key={tag} className="pr-tag-pill">🏷️ {tag}</span>
                      ))}
                    </div>
                  )}

                  <div className="card-meta-row">
                    <span className="card-author">👤 @{pr.author}</span>
                    <span className={`status-badge ${pr.status.toLowerCase()}`}>{pr.status}</span>
                  </div>

                  <div className="card-footer-row">
                    <span className="card-action-label">Action: {pr.rec_action}</span>
                    <span className="card-updated">🕒 {pr.updated_at_human}</span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      ) : (
        /* Table View */
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th onClick={() => handleSort('number')} className="sortable">
                  PR ID {sortKey === 'number' ? (sortDir === 'asc' ? '▲' : '▼') : ''}
                </th>
                <th onClick={() => handleSort('updated_at')} className="sortable">
                  Last Updated {sortKey === 'updated_at' ? (sortDir === 'asc' ? '▲' : '▼') : ''}
                </th>
                <th onClick={() => handleSort('title')} className="sortable">
                  Title, Flags & Summary {sortKey === 'title' ? (sortDir === 'asc' ? '▲' : '▼') : ''}
                </th>
                <th onClick={() => handleSort('status')} className="sortable">
                  Status {sortKey === 'status' ? (sortDir === 'asc' ? '▲' : '▼') : ''}
                </th>
                <th onClick={() => handleSort('type')} className="sortable">
                  Type {sortKey === 'type' ? (sortDir === 'asc' ? '▲' : '▼') : ''}
                </th>
                <th onClick={() => handleSort('subtype')} className="sortable">
                  Subtype {sortKey === 'subtype' ? (sortDir === 'asc' ? '▲' : '▼') : ''}
                </th>
                <th onClick={() => handleSort('current_status')} className="sortable">
                  Current Status {sortKey === 'current_status' ? (sortDir === 'asc' ? '▲' : '▼') : ''}
                </th>
                <th onClick={() => handleSort('risk_score')} className="sortable">
                  Risk {sortKey === 'risk_score' ? (sortDir === 'asc' ? '▲' : '▼') : ''}
                </th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 ? (
                <tr>
                  <td colSpan="9" className="no-data">
                    No Pull Requests match the selected filters.
                  </td>
                </tr>
              ) : (
                sorted.map(pr => {
                  const key = `${pr.repo_name}#${pr.number}`;
                  const prTags = tagsMap[key] || [];

                  return (
                    <tr key={key} onClick={() => onSelectPr(pr.number)} className="pr-row">
                      <td className="pr-id-cell">
                        <span className="pr-num">PR #{pr.number}</span>
                        {pr.repo_name && <span className="repo-badge">{pr.repo_name}</span>}
                      </td>
                      <td className="updated-cell">{pr.updated_at_human}</td>
                      <td className="title-summary-cell">
                        <div className="pr-title-row">
                          <span className="pr-title">{pr.title}</span>
                        </div>
                        {prTags.length > 0 && (
                          <div className="pr-tags-list">
                            {prTags.map(tag => (
                              <span key={tag} className="pr-tag-pill">🏷️ {tag}</span>
                            ))}
                          </div>
                        )}
                        <div className="pr-summary">{pr.summary}</div>
                        <div className="pr-author-meta">Created: {pr.created_at_human}</div>
                      </td>
                      <td>
                        <span className={`status-badge ${pr.status.toLowerCase()}`}>{pr.status}</span>
                      </td>
                      <td>{pr.type}</td>
                      <td>{pr.subtype}</td>
                      <td>
                        <span className={`curr-status-badge ${pr.current_status.toLowerCase().replace(/\s+/g, '-')}`}>
                          {pr.current_status}
                        </span>
                      </td>
                      <td>
                        <span className={`risk-badge ${pr.risk.toLowerCase()}`}>
                          {pr.risk_desc || pr.risk}
                        </span>
                      </td>
                      <td className="action-cell">
                        <span className="action-label">{pr.rec_action}</span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
