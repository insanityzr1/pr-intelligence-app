import React, { useState, useEffect } from 'react';
import { fetchPRs, syncPRs, fetchRepos } from './api/client';
import MetricsBar from './components/MetricsBar';
import PRMatrix from './components/PRMatrix';
import MultiPRWorkspace from './components/MultiPRWorkspace';
import ConflictMap from './components/ConflictMap';
import ReleaseBuilder from './components/ReleaseBuilder';
import RepoManagerModal from './components/RepoManagerModal';
import ConflictResolverModal from './components/ConflictResolverModal';
import './App.css';

export default function App() {
  const [activeTab, setActiveTab] = useState('matrix');
  const [prs, setPrs] = useState([]);
  const [repos, setRepos] = useState([]);
  const [selectedRepo, setSelectedRepo] = useState('');
  
  // Multi-PR Workspace State
  const [openPrs, setOpenPrs] = useState([]); // [{ prNumber, repoName }]
  const [activePrNumber, setActivePrNumber] = useState(null);

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

  function handleOpenPr(prNumber) {
    const prItem = prs.find(p => p.number === prNumber);
    const targetRepo = prItem?.repo_name || selectedRepo || 'rpnunez/wp-ai-scheduler';
    
    setOpenPrs(prev => {
      if (prev.some(p => p.prNumber === prNumber)) return prev;
      if (prev.length >= 5) {
        return [...prev.slice(1), { prNumber, repoName: targetRepo }];
      }
      return [...prev, { prNumber, repoName: targetRepo }];
    });
    setActivePrNumber(prNumber);
  }

  function handleClosePr(prNumber) {
    setOpenPrs(prev => {
      const next = prev.filter(p => p.prNumber !== prNumber);
      if (activePrNumber === prNumber) {
        setActivePrNumber(next.length > 0 ? next[next.length - 1].prNumber : null);
      }
      return next;
    });
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
            <PRMatrix prs={prs} onSelectPr={num => handleOpenPr(num)} />
          )}

          {activeTab === 'conflicts' && (
            <ConflictMap />
          )}

          {activeTab === 'release' && (
            <ReleaseBuilder prs={prs} />
          )}

          {openPrs.length > 0 && (
            <MultiPRWorkspace
              openPrs={openPrs}
              activePrNumber={activePrNumber}
              onSelectActivePr={num => setActivePrNumber(num)}
              onClosePr={num => handleClosePr(num)}
              onCloseAll={() => setOpenPrs([])}
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
