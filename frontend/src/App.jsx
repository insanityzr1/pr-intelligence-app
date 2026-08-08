import React, { useState, useEffect } from 'react';
import { fetchPRs, syncPRs } from './api/client';
import MetricsBar from './components/MetricsBar';
import PRMatrix from './components/PRMatrix';
import PRDetailDrawer from './components/PRDetailDrawer';
import ConflictMap from './components/ConflictMap';
import ReleaseBuilder from './components/ReleaseBuilder';
import './App.css';

export default function App() {
  const [activeTab, setActiveTab] = useState('matrix');
  const [prs, setPrs] = useState([]);
  const [selectedPrNumber, setSelectedPrNumber] = useState(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    loadPrs();
  }, []);

  async function loadPrs() {
    setLoading(true);
    try {
      const data = await fetchPRs();
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
      const res = await syncPRs(50, 'open', 'updated-desc');
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
          <p>AI-Powered PR Review, Conflict Scanner & Release Builder</p>
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
            <PRMatrix prs={prs} onSelectPr={num => setSelectedPrNumber(num)} />
          )}

          {activeTab === 'conflicts' && (
            <ConflictMap />
          )}

          {activeTab === 'release' && (
            <ReleaseBuilder prs={prs} />
          )}

          {selectedPrNumber && (
            <PRDetailDrawer prNumber={selectedPrNumber} onClose={() => setSelectedPrNumber(null)} />
          )}
        </main>
      )}
    </div>
  );
}
