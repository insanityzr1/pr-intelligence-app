import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { fetchTagsMap } from '../api/client';
import PRCommandBar from './PRCommandBar';
import BulkActionBar from './BulkActionBar';
import CIBadge from './CIBadge';
import { isConflicting, isMergeable, isHighRisk, isAiAnalyzed, prRefKey } from '../utils/prStats';

export default function PRMatrix({ prs, onSelectPr, tagsMap: tagsMapProp, onTagsChanged }) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [subtypeFilter, setSubtypeFilter] = useState('');
  const [currStatusFilter, setCurrStatusFilter] = useState('');
  const [riskFilter, setRiskFilter] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [tagFilter, setTagFilter] = useState('');

  // Interactive KPI Multi-Select Filters
  const [activeKpis, setActiveKpis] = useState({
    mergeable: false,
    conflicts: false,
    highRisk: false,
    aiAnalyzed: false
  });

  const [ownTagsMap, setOwnTagsMap] = useState({});
  const [sortKey, setSortKey] = useState('updated_at');
  const [sortDir, setSortDir] = useState('desc');

  // Bulk selection, keyed by `{repo}#{number}`.
  const [selectedKeys, setSelectedKeys] = useState(() => new Set());
  const [lastClickedIndex, setLastClickedIndex] = useState(null);
  const [focusedIndex, setFocusedIndex] = useState(-1);

  // App already loads the tag map for global search; prefer it and only fetch
  // independently when rendered standalone (e.g. in tests).
  const tagsMap = tagsMapProp ?? ownTagsMap;
  const usingOwnTags = tagsMapProp === undefined;

  useEffect(() => {
    if (usingOwnTags) loadTags();
  }, [usingOwnTags]);

  async function loadTags() {
    try {
      const res = await fetchTagsMap();
      setOwnTagsMap(res.tags_map || {});
    } catch (err) {
      console.error(err);
    }
  }

  const refreshTags = useCallback(() => {
    if (onTagsChanged) onTagsChanged();
    if (usingOwnTags) loadTags();
  }, [onTagsChanged, usingOwnTags]);

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
  }

  // These previously rebuilt six Sets, filtered, and full-array-sorted on every
  // single render — including every keystroke in the search box.
  const { statuses, types, subtypes, currStatuses, actions } = useMemo(() => ({
    statuses: Array.from(new Set(prs.map(p => p.status))).sort(),
    types: Array.from(new Set(prs.map(p => p.type))).sort(),
    subtypes: Array.from(new Set(prs.map(p => p.subtype))).sort(),
    currStatuses: Array.from(new Set(prs.map(p => p.current_status))).sort(),
    actions: Array.from(new Set(prs.map(p => p.rec_action))).sort(),
  }), [prs]);

  const risks = ['Low', 'Medium', 'High'];

  // Extract all unique tags present across PRs
  const availableTags = useMemo(() => {
    const allTagsSet = new Set();
    Object.values(tagsMap).forEach(list => list.forEach(t => allTagsSet.add(t)));
    return Array.from(allTagsSet).sort();
  }, [tagsMap]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return prs.filter(pr => {
      const prTags = tagsMap[prRefKey(pr)] || [];

      const mSearch = !search ||
        pr.id_str?.toLowerCase().includes(q) ||
        pr.title?.toLowerCase().includes(q) ||
        pr.summary?.toLowerCase().includes(q) ||
        pr.author?.toLowerCase().includes(q);

      const mStatus = !statusFilter || pr.status === statusFilter;
      const mType = !typeFilter || pr.type === typeFilter;
      const mSubtype = !subtypeFilter || pr.subtype === subtypeFilter;
      const mCurrStatus = !currStatusFilter || pr.current_status === currStatusFilter;
      const mRisk = !riskFilter || pr.risk === riskFilter;
      const mAction = !actionFilter || pr.rec_action === actionFilter;
      const mTag = !tagFilter || prTags.includes(tagFilter);

      // KPI Multi-select Filters
      let mKpi = true;
      if (activeKpis.mergeable && !isMergeable(pr)) mKpi = false;
      if (activeKpis.conflicts && !isConflicting(pr)) mKpi = false;
      if (activeKpis.highRisk && !isHighRisk(pr)) mKpi = false;
      if (activeKpis.aiAnalyzed && !isAiAnalyzed(pr)) mKpi = false;

      return mSearch && mStatus && mType && mSubtype && mCurrStatus && mRisk && mAction && mTag && mKpi;
    });
  }, [prs, tagsMap, search, statusFilter, typeFilter, subtypeFilter,
      currStatusFilter, riskFilter, actionFilter, tagFilter, activeKpis]);

  const sorted = useMemo(() => (
    [...filtered].sort((a, b) => {
      let valA = a[sortKey];
      let valB = b[sortKey];
      if (typeof valA === 'string') valA = valA.toLowerCase();
      if (typeof valB === 'string') valB = valB.toLowerCase();
      if (valA < valB) return sortDir === 'asc' ? -1 : 1;
      if (valA > valB) return sortDir === 'asc' ? 1 : -1;
      return 0;
    })
  ), [filtered, sortKey, sortDir]);

  function handleSort(key) {
    if (sortKey === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir((key === 'updated_at' || key === 'number' || key === 'risk_score') ? 'desc' : 'asc');
    }
  }

  // --- Bulk selection -----------------------------------------------------
  // The matrix had no multi-select at all, so the primary tab could only act on
  // one PR at a time — a hard ceiling for a high-volume workflow.

  const selectedPrs = useMemo(
    () => sorted.filter(pr => selectedKeys.has(prRefKey(pr))),
    [sorted, selectedKeys]
  );

  const allVisibleSelected = sorted.length > 0 && sorted.every(pr => selectedKeys.has(prRefKey(pr)));

  function toggleRow(index, { shiftKey = false } = {}) {
    const key = prRefKey(sorted[index]);
    setSelectedKeys(prev => {
      const next = new Set(prev);
      // Shift-click extends from the previous click, like a file manager.
      if (shiftKey && lastClickedIndex !== null) {
        const [from, to] = [lastClickedIndex, index].sort((a, b) => a - b);
        const shouldSelect = !prev.has(key);
        for (let i = from; i <= to; i++) {
          const k = prRefKey(sorted[i]);
          if (shouldSelect) next.add(k); else next.delete(k);
        }
        return next;
      }
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
    setLastClickedIndex(index);
  }

  function toggleSelectAllVisible() {
    setSelectedKeys(prev => {
      if (allVisibleSelected) {
        const next = new Set(prev);
        sorted.forEach(pr => next.delete(prRefKey(pr)));
        return next;
      }
      return new Set([...prev, ...sorted.map(prRefKey)]);
    });
  }

  const clearSelection = useCallback(() => setSelectedKeys(new Set()), []);

  // Row navigation: j/k to move, Enter to open, x to toggle selection.
  useEffect(() => {
    function onKeyDown(e) {
      const tag = e.target.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || e.target.isContentEditable) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (sorted.length === 0) return;

      if (e.key === 'j' || e.key === 'ArrowDown') {
        e.preventDefault();
        setFocusedIndex(i => Math.min(sorted.length - 1, i + 1));
      } else if (e.key === 'k' || e.key === 'ArrowUp') {
        e.preventDefault();
        setFocusedIndex(i => Math.max(0, i <= 0 ? 0 : i - 1));
      } else if (e.key === 'Enter' && focusedIndex >= 0) {
        e.preventDefault();
        const pr = sorted[focusedIndex];
        onSelectPr(pr.number, pr.repo_name);
      } else if (e.key === 'x' && focusedIndex >= 0) {
        e.preventDefault();
        toggleRow(focusedIndex);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [sorted, focusedIndex, onSelectPr, lastClickedIndex]);

  return (
    <div className="matrix-wrapper">
      {/* Condensed PR Command Bar (KPI Stat Chips + Search + Popover Filters) */}
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
      />

      <BulkActionBar
        selectedPrs={selectedPrs}
        onClear={clearSelection}
        onTagsChanged={refreshTags}
      />

      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th className="select-cell">
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  onChange={toggleSelectAllVisible}
                  aria-label={allVisibleSelected ? 'Deselect all visible PRs' : 'Select all visible PRs'}
                  title="Select all filtered PRs"
                />
              </th>
              <th onClick={() => handleSort('number')} className="sortable"
                  aria-sort={sortKey === 'number' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}>
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
                <td colSpan="10" className="no-data">
                  No Pull Requests match the selected filters.
                </td>
              </tr>
            ) : (
              sorted.map((pr, index) => {
                const key = prRefKey(pr);
                const prTags = tagsMap[key] || [];

                const conflicting = isConflicting(pr);
                const isSelected = selectedKeys.has(key);
                const isFocused = index === focusedIndex;

                return (
                  <tr
                    key={key}
                    onClick={() => onSelectPr(pr.number, pr.repo_name)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onSelectPr(pr.number, pr.repo_name);
                      }
                    }}
                    onFocus={() => setFocusedIndex(index)}
                    tabIndex={0}
                    role="button"
                    aria-label={`Open PR #${pr.number}: ${pr.title}`}
                    aria-selected={isSelected}
                    className={[
                      'pr-row',
                      conflicting ? 'row-conflicting' : '',
                      isSelected ? 'row-selected' : '',
                      isFocused ? 'row-focused' : '',
                    ].filter(Boolean).join(' ')}
                  >
                    {/* stopPropagation so ticking the box does not also open the drawer */}
                    <td className="select-cell" onClick={e => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => {}}
                        onClick={e => toggleRow(index, { shiftKey: e.shiftKey })}
                        aria-label={`Select PR #${pr.number}`}
                      />
                    </td>
                    <td className="pr-id-cell">
                      <span className="pr-num">PR #{pr.number}</span>
                      {conflicting && (
                        <span className="conflict-badge" title="Conflicts with base branch">
                          ⚠️ Conflict
                        </span>
                      )}
                      {pr.repo_name && <span className="repo-badge">{pr.repo_name}</span>}
                    </td>
                    <td className="updated-cell">{pr.updated_rel}</td>
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
                      <div className="pr-author-meta">Created: {pr.created_fmt}</div>
                    </td>
                    <td>
                      <span className={`status-badge ${pr.status.toLowerCase()}`}>{pr.status}</span>
                      <CIBadge pr={pr} />
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
                        {pr.risk_detail || pr.risk}
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
    </div>
  );
}
