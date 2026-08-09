import React from 'react';

export default function Sidebar({
  activeTab,
  setActiveTab,
  isCollapsed,
  setIsCollapsed,
  mobileOpen,
  setMobileOpen,
  repos = [],
  selectedRepo,
  setSelectedRepo,
  onManageRepos,
  onOpenShortcuts,
  handleSync,
  syncing
}) {
  const navItems = [
    {
      group: 'PR Intelligence',
      icon: '📊',
      items: [
        { id: 'matrix', label: 'PR Matrix', icon: '📊', shortcut: '1' },
        { id: 'conflicts', label: 'Collision Matrix', icon: '⚡', shortcut: '2' }
      ]
    },
    {
      group: 'Release Management',
      icon: '🚀',
      items: [
        { id: 'workspaces', label: 'PR Workspaces', icon: '📦', shortcut: '3' },
        { id: 'release', label: 'Release Builder', icon: '🚀', shortcut: '4' }
      ]
    }
  ];

  const handleTabClick = (tabId) => {
    setActiveTab(tabId);
    if (mobileOpen) setMobileOpen(false);
  };

  return (
    <>
      {/* Mobile Overlay backdrop */}
      {mobileOpen && (
        <div 
          className="sidebar-mobile-backdrop" 
          onClick={() => setMobileOpen(false)} 
          aria-hidden="true"
        />
      )}

      <aside className={`sidebar-nav ${isCollapsed ? 'collapsed' : ''} ${mobileOpen ? 'mobile-open' : ''}`}>
        {/* Sidebar Header */}
        <div className="sidebar-header">
          <div className="sidebar-brand" onClick={() => handleTabClick('matrix')}>
            <span className="brand-icon">⚡</span>
            {!isCollapsed && (
              <div className="brand-text">
                <h2>PR Intelligence</h2>
                <span className="brand-subtitle">AI Triage & Release</span>
              </div>
            )}
          </div>
          
          <button 
            className="sidebar-toggle-btn"
            onClick={() => setIsCollapsed(!isCollapsed)}
            title={isCollapsed ? "Expand Sidebar (Ctrl+B)" : "Collapse Sidebar (Ctrl+B)"}
          >
            {isCollapsed ? '➔' : '◀'}
          </button>
        </div>

        {/* Repository Context Card */}
        <div className="sidebar-repo-section">
          {!isCollapsed && (
            <span className="sidebar-group-title">
              <span className="group-title-icon">📁</span>
              <span className="group-title-text">Repository Context</span>
            </span>
          )}
          <div className="repo-select-container">
            {!isCollapsed ? (
              <>
                <select 
                  value={selectedRepo} 
                  onChange={e => setSelectedRepo(e.target.value)} 
                  className="sidebar-repo-select"
                  title="Select Active Repository"
                >
                  <option value="">All Repositories ({repos.length})</option>
                  {repos.map(r => (
                    <option key={r.repo_name} value={r.repo_name}>
                      {r.repo_name}
                    </option>
                  ))}
                </select>
                <button 
                  onClick={onManageRepos} 
                  className="sidebar-manage-repo-btn"
                  title="Manage Repositories"
                >
                  <span>⚙️</span> Manage Repositories
                </button>
              </>
            ) : (
              <button 
                onClick={onManageRepos} 
                className="sidebar-manage-repo-btn collapsed"
                title={`Active Repo: ${selectedRepo || 'All'}. Click to manage repos.`}
              >
                ⚙️
              </button>
            )}
          </div>
        </div>

        {/* Navigation Sections */}
        <nav className="sidebar-menu">
          {navItems.map(group => (
            <div key={group.group} className="sidebar-group">
              {!isCollapsed && (
                <span className="sidebar-group-title">
                  <span className="group-title-icon">{group.icon}</span>
                  <span className="group-title-text">{group.group}</span>
                </span>
              )}
              <ul className="sidebar-nav-list">
                {group.items.map(item => {
                  const isActive = activeTab === item.id;
                  return (
                    <li key={item.id}>
                      <button
                        className={`sidebar-item ${isActive ? 'active' : ''}`}
                        onClick={() => handleTabClick(item.id)}
                        title={`${item.label} (Press ${item.shortcut})`}
                      >
                        <span className="sidebar-item-icon">{item.icon}</span>
                        {!isCollapsed && <span className="sidebar-item-label">{item.label}</span>}
                        {!isCollapsed && item.shortcut && (
                          <span className="sidebar-shortcut-badge">{item.shortcut}</span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        {/* Footer / System Actions */}
        <div className="sidebar-footer">
          <button 
            onClick={handleSync} 
            disabled={syncing} 
            className="sidebar-sync-btn"
            title="Sync PRs from GitHub"
          >
            <span className={`sync-icon ${syncing ? 'spinning' : ''}`}>🔄</span>
            {!isCollapsed && (
              <span>{syncing ? 'Syncing...' : 'Sync PRs Now'}</span>
            )}
          </button>

          <a 
            href="/api/export/csv" 
            download 
            className="sidebar-export-btn"
            title="Export CSV Report"
          >
            <span className="export-icon">📥</span>
            {!isCollapsed && <span>Export CSV</span>}
          </a>

          <button
            onClick={onOpenShortcuts}
            className="sidebar-shortcuts-btn"
            title="Keyboard Shortcuts (?)"
          >
            <span className="shortcuts-icon">⌨️</span>
            {!isCollapsed && <span>Shortcuts (?)</span>}
          </button>
        </div>
      </aside>
    </>
  );
}
