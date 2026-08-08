import React, { useState, useEffect } from 'react';
import { fetchTagsMap } from '../api/client';

export default function PRMatrix({ prs, onSelectPr }) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [subtypeFilter, setSubtypeFilter] = useState('');
  const [currStatusFilter, setCurrStatusFilter] = useState('');
  const [riskFilter, setRiskFilter] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [tagFilter, setTagFilter] = useState('');

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

    return mSearch && mStatus && mType && mSubtype && mCurrStatus && mRisk && mAction && mTag;
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
      <div className="filter-panel">
        <h2>Filter & Search PRs</h2>
        <div className="filters-grid">
          <div className="filter-group">
            <label>Search Text</label>
            <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search PR ID, title, summary..." />
          </div>
          <div className="filter-group">
            <label>Filter by Tag / Flag</label>
            <select value={tagFilter} onChange={e => setTagFilter(e.target.value)}>
              <option value="">All Tags & Flags ({availableTags.length})</option>
              {availableTags.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className="filter-group">
            <label>Status</label>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
              <option value="">All Statuses</option>
              {statuses.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="filter-group">
            <label>Type</label>
            <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
              <option value="">All Types</option>
              {types.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className="filter-group">
            <label>Subtype</label>
            <select value={subtypeFilter} onChange={e => setSubtypeFilter(e.target.value)}>
              <option value="">All Subtypes</option>
              {subtypes.map(st => <option key={st} value={st}>{st}</option>)}
            </select>
          </div>
          <div className="filter-group">
            <label>Current Status</label>
            <select value={currStatusFilter} onChange={e => setCurrStatusFilter(e.target.value)}>
              <option value="">All Current Statuses</option>
              {currStatuses.map(cs => <option key={cs} value={cs}>{cs}</option>)}
            </select>
          </div>
          <div className="filter-group">
            <label>Risk Level</label>
            <select value={riskFilter} onChange={e => setRiskFilter(e.target.value)}>
              <option value="">All Risk Levels</option>
              {risks.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div className="filter-group">
            <label>Recommended Action</label>
            <select value={actionFilter} onChange={e => setActionFilter(e.target.value)}>
              <option value="">All Actions</option>
              {actions.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
        </div>
      </div>

      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th onClick={() => handleSort('number')}>PR ID {sortKey === 'number' && (sortDir === 'asc' ? '▲' : '▼')}</th>
              <th onClick={() => handleSort('updated_at')}>Last Updated {sortKey === 'updated_at' && (sortDir === 'asc' ? '▲' : '▼')}</th>
              <th onClick={() => handleSort('title')}>Title, Flags & Summary {sortKey === 'title' && (sortDir === 'asc' ? '▲' : '▼')}</th>
              <th onClick={() => handleSort('status')}>Status {sortKey === 'status' && (sortDir === 'asc' ? '▲' : '▼')}</th>
              <th onClick={() => handleSort('type')}>Type {sortKey === 'type' && (sortDir === 'asc' ? '▲' : '▼')}</th>
              <th onClick={() => handleSort('subtype')}>Subtype {sortKey === 'subtype' && (sortDir === 'asc' ? '▲' : '▼')}</th>
              <th onClick={() => handleSort('current_status')}>Current Status {sortKey === 'current_status' && (sortDir === 'asc' ? '▲' : '▼')}</th>
              <th onClick={() => handleSort('risk_score')}>Risk {sortKey === 'risk_score' && (sortDir === 'asc' ? '▲' : '▼')}</th>
              <th onClick={() => handleSort('rec_action')}>Action {sortKey === 'rec_action' && (sortDir === 'asc' ? '▲' : '▼')}</th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr><td colSpan="9" className="empty-cell">No matching pull requests found.</td></tr>
            ) : (
              sorted.map(pr => {
                const prKey = `${pr.repo_name}#${pr.number}`;
                const rowTags = tagsMap[prKey] || [];
                return (
                  <tr key={pr.number} onClick={() => onSelectPr(pr.number)} className="clickable-row">
                    <td><a className="pr-link" href={pr.url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}>{pr.id_str}</a></td>
                    <td className="updated-cell">{pr.updated_rel}</td>
                    <td>
                      <div className="pr-title">{pr.title}</div>
                      {rowTags.length > 0 && (
                        <div className="row-tags-list">
                          {rowTags.map(t => <span key={t} className="row-tag-badge">{t}</span>)}
                        </div>
                      )}
                      <div className="pr-summary">{pr.summary}</div>
                      <div className="pr-created">Created: {pr.created_fmt}</div>
                    </td>
                    <td>
                      <span className={`badge ${pr.status === 'Draft' ? 'badge-draft' : 'badge-open'}`}>{pr.status}</span>
                    </td>
                    <td>{pr.type}</td>
                    <td>{pr.subtype}</td>
                    <td>
                      <span className={`badge ${pr.mergeable === 'CONFLICTING' ? 'badge-conflict' : (pr.current_status === 'Ready to merge' ? 'badge-ready' : 'badge-review')}`}>
                        {pr.mergeable === 'CONFLICTING' ? '⚠️ Conflicts' : pr.current_status}
                      </span>
                    </td>
                    <td className={`risk-${pr.risk.toLowerCase()}`}>{pr.risk_detail}</td>
                    <td>{pr.rec_action}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
