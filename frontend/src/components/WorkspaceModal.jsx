import React, { useState, useEffect, useMemo } from 'react';

export default function WorkspaceModal({ isOpen, onClose, onSave, group = null, existingPrNumbers = [], allPrs = [] }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedPrs, setSelectedPrs] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (isOpen) {
      if (group) {
        setName(group.name || '');
        setDescription(group.description || '');
        setSelectedPrs(existingPrNumbers || []);
      } else {
        setName('');
        setDescription('');
        setSelectedPrs([]);
      }
      setSearchQuery('');
      setError(null);
    }
  }, [isOpen, group, existingPrNumbers]);

  const filteredPrs = useMemo(() => {
    if (!searchQuery.trim()) return allPrs;
    const q = searchQuery.trim().toLowerCase();
    
    if (q.startsWith('#')) {
      const numStr = q.replace('#', '');
      return allPrs.filter(pr => (pr.number ?? pr.pr_number)?.toString().includes(numStr));
    }

    return allPrs.filter(pr => {
      const num = (pr.number ?? pr.pr_number)?.toString();
      return (
        pr.title?.toLowerCase().includes(q) ||
        (pr.headRefName && pr.headRefName.toLowerCase().includes(q)) ||
        (pr.head_branch && pr.head_branch.toLowerCase().includes(q)) ||
        (pr.baseRefName && pr.baseRefName.toLowerCase().includes(q)) ||
        (pr.base_branch && pr.base_branch.toLowerCase().includes(q)) ||
        pr.author?.toLowerCase().includes(q) ||
        (num && num.includes(q))
      );
    });
  }, [allPrs, searchQuery]);

  if (!isOpen) return null;

  function togglePr(num) {
    if (selectedPrs.includes(num)) {
      setSelectedPrs(selectedPrs.filter(n => n !== num));
    } else {
      setSelectedPrs([...selectedPrs, num]);
    }
  }

  function selectAllFiltered() {
    const filteredNums = filteredPrs.map(p => p.number ?? p.pr_number).filter(Boolean);
    const combined = Array.from(new Set([...selectedPrs, ...filteredNums]));
    setSelectedPrs(combined);
  }

  function clearSelection() {
    setSelectedPrs([]);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await onSave({
        group_id: group?.group_id || null,
        name: name.trim(),
        description: description.trim(),
        selectedPrNumbers: selectedPrs
      });
      onClose();
    } catch (err) {
      console.error('Failed to save workspace:', err);
      setError(err.message || 'Failed to save workspace. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-container workspace-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{group ? '✏️ Add / Edit PRs in Workspace' : '📦 Create New PR Workspace'}</h3>
          <button className="modal-close-btn" onClick={onClose}>&times;</button>
        </div>

        <form onSubmit={handleSubmit} className="workspace-modal-form">
          <div className="modal-body">
            {error && (
              <div className="modal-error-banner" style={{
                backgroundColor: 'rgba(239, 68, 68, 0.15)',
                border: '1px solid #ef4444',
                color: '#fca5a5',
                padding: '0.75rem 1rem',
                borderRadius: '0.5rem',
                fontSize: '0.85rem',
                marginBottom: '0.5rem'
              }}>
                ⚠️ {error}
              </div>
            )}

            <div className="form-group">
              <label>Workspace Name *</label>
              <input
                type="text"
                placeholder="e.g. Feature Release v2.9"
                value={name}
                onChange={e => setName(e.target.value)}
                className="input-control"
                required
              />
            </div>

            <div className="form-group">
              <label>Description (Optional)</label>
              <input
                type="text"
                placeholder="Brief summary or release target..."
                value={description}
                onChange={e => setDescription(e.target.value)}
                className="input-control"
              />
            </div>

            {/* Combined Search PRs Section */}
            <div className="pr-picker-section">
              <div className="pr-picker-header">
                <label>Search / Select PRs to add ({selectedPrs.length} selected)</label>
                <div className="pr-picker-actions">
                  {searchQuery && filteredPrs.length > 0 && (
                    <button type="button" onClick={selectAllFiltered} className="btn-link-sm">
                      Select All Filtered ({filteredPrs.length})
                    </button>
                  )}
                  {selectedPrs.length > 0 && (
                    <button type="button" onClick={clearSelection} className="btn-link-sm danger">
                      Clear Selection
                    </button>
                  )}
                </div>
              </div>

              <div className="typeahead-input-wrapper" style={{ marginBottom: '10px' }}>
                <input
                  type="text"
                  placeholder="Search PRs by title, author, branch, or '#1874'..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="typeahead-input"
                />
                {searchQuery && (
                  <button type="button" className="clear-search-btn" onClick={() => setSearchQuery('')}>&times;</button>
                )}
              </div>

              <div className="modal-pr-checklist">
                {filteredPrs.length === 0 ? (
                  <div className="empty-box">No PRs match your search query '{searchQuery}'.</div>
                ) : (
                  filteredPrs.map(pr => {
                    const prNum = pr.number ?? pr.pr_number;
                    if (!prNum) return null;
                    const isSelected = selectedPrs.includes(prNum);
                    return (
                      <label key={prNum} className={`pr-checkbox-item ${isSelected ? 'selected' : ''}`}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => togglePr(prNum)}
                        />
                        <div className="info">
                          <div className="pr-checkbox-head">
                            <strong>#{prNum}: {pr.title}</strong>
                            <span className="branch-badge">
                              {pr.headRefName || pr.head_branch || 'feature'} ➜ {pr.baseRefName || pr.base_branch || 'main'}
                            </span>
                          </div>
                          <span className="pr-type-meta">
                            Author: @{pr.author} | Status: <span className={`badge badge-${pr.status?.toLowerCase()}`}>{pr.status}</span>
                            {pr.risk && <> | Risk: <span className={`risk-${pr.risk?.toLowerCase()}`}>{pr.risk}</span></>}
                          </span>
                        </div>
                      </label>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" onClick={onClose} className="btn btn-secondary">Cancel</button>
            <button type="submit" disabled={!name.trim() || saving} className="btn btn-primary">
              {saving ? 'Saving...' : group ? 'Save Workspace' : 'Create Workspace'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
