import React, { useState, useEffect } from 'react';
import { fetchPRs, syncPRs, fetchRepos } from './api/client';
import MetricsBar from './components/MetricsBar';
import PRMatrix from './components/PRMatrix';
import PRDetailDrawer from './components/PRDetailDrawer';
import ConflictMap from './components/ConflictMap';
import ReleaseBuilder from './components/ReleaseBuilder';
import StagingWorkspacesTab from './components/StagingWorkspacesTab';
import RepoManagerModal from './components/RepoManagerModal';
import ConflictResolverModal from './components/ConflictResolverModal';
import './App.css';

export default function App() {
  const [activeTab, setActiveTab] = useState('matrix');
  const [prs, setPrs] = useState([]);
  const [repos, setRepos] = useState([]);
  const [selectedRepo, setSelectedRepo] = useState('');
  
  const [selectedPrNumber, setSelectedPrNumber] = useState(null);
  const [conflictResolverPr, setConflictResolverPr] = useState(null);
  const [showRepoManager, setShowRepoManager] = useState(false);
  
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    loadRepos();
    loadPrs();
  }, [selectedRepo]);

  async function loadRepos() {
    try {
      const data = await fetchRepos();
      setRepos(data.repositories || []);
    } catch (err) {
      console.error(err);
    }
  }

  async function loadPrs() {
    setLoading(true);
    try {
      const data = await fetchPRs(selectedRepo || null);
      setPrs(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleSync() {
    setSyncing(true);
    try {
      const res = await syncPRs(null, 'open', 'updated-desc', selectedRepo || null);
      setPrs(res.prs || []);
    } catch (err) {
      console.error(err);
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="brand">
          <h1>⚡ PR Intelligence App</h1>
          <p>Multi-Repo AI Code Review, Conflict Resolver & Release Builder</p>
        </div>

        <div className="repo-selector-group">
          <select value={selectedRepo} onChange={e => setSelectedRepo(e.target.value)} className="repo-select">
            <option value="">All Repositories ({repos.length})</option>
            {repos.map(r => <option key={r.repo_name} value={r.repo_name}>{r.repo_name}</option>)}
          </select>
          <button onClick={() => setShowRepoManager(true)} className="btn btn-secondary btn-sm">⚙️ Manage Repos</button>
        </div>

        <div className="nav-tabs">
          <button className={`tab-btn ${activeTab === 'matrix' ? 'active' : ''}`} onClick={() => setActiveTab('matrix')}>PR Matrix</button>
          <button className={`tab-btn ${activeTab === 'conflicts' ? 'active' : ''}`} onClick={() => setActiveTab('conflicts')}>Collision Matrix</button>
          <button className={`tab-btn ${activeTab === 'workspaces' ? 'active' : ''}`} onClick={() => setActiveTab('workspaces')}>📦 PR Workspaces</button>
          <button className={`tab-btn ${activeTab === 'release' ? 'active' : ''}`} onClick={() => setActiveTab('release')}>Release Builder</button>
        </div>

        <div className="header-actions">
          <button onClick={handleSync} disabled={syncing} className="btn btn-primary">
            {syncing ? 'Syncing GitHub...' : 'Sync PRs Now'}
          </button>
          <a href="/api/export/csv" download className="btn btn-secondary">Export CSV</a>
        </div>
      </header>

      {loading ? (
        <div className="loading-state">Loading Pull Request data...</div>
      ) : (
        <main className="app-main">
          <MetricsBar prs={prs} />

          {activeTab === 'matrix' && (
            <PRMatrix prs={prs} onSelectPr={num => setSelectedPrNumber(num)} />
          )}

          {activeTab === 'conflicts' && (
            <ConflictMap />
          )}

          {activeTab === 'workspaces' && (
            <StagingWorkspacesTab prs={prs} onSelectPr={num => setSelectedPrNumber(num)} />
          )}

          {activeTab === 'release' && (
            <ReleaseBuilder prs={prs} />
          )}

          {selectedPrNumber && (
            <PRDetailDrawer
              prNumber={selectedPrNumber}
              repoName={selectedRepo}
              onClose={() => setSelectedPrNumber(null)}
              onResolveConflict={(num, repo) => setConflictResolverPr({ prNumber: num, repoName: repo })}
            />
          )}

          {conflictResolverPr && (
            <ConflictResolverModal
              prNumber={conflictResolverPr.prNumber}
              repoName={conflictResolverPr.repoName}
              onClose={() => setConflictResolverPr(null)}
            />
          )}

          {showRepoManager && (
            <RepoManagerModal
              onClose={() => setShowRepoManager(false)}
              onReposUpdated={() => { loadRepos(); loadPrs(); }}
            />
          )}
        </main>
      )}
    </div>
  );
}
