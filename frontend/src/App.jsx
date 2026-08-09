import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { fetchPRs, syncPRs, fetchRepos } from './api/client';
import Sidebar from './components/Sidebar';
import TopHeader from './components/TopHeader';
import MetricsBar from './components/MetricsBar';
import PRMatrix from './components/PRMatrix';
import PRDetailDrawer from './components/PRDetailDrawer';
import ConflictMap from './components/ConflictMap';
import ReleaseBuilder from './components/ReleaseBuilder';
import StagingWorkspacesTab from './components/StagingWorkspacesTab';
import RepoManagerModal from './components/RepoManagerModal';
import ConflictResolverModal from './components/ConflictResolverModal';
import KeyboardShortcutsModal from './components/KeyboardShortcutsModal';
import { ToastContainer } from './components/ToastNotification';
import './App.css';

export default function App() {
  const [activeTab, setActiveTab] = useState('matrix');
  const [prs, setPrs] = useState([]);
  const [repos, setRepos] = useState([]);
  const [selectedRepo, setSelectedRepo] = useState('');
  
  const [selectedPrNumber, setSelectedPrNumber] = useState(null);
  const [conflictResolverPr, setConflictResolverPr] = useState(null);
  const [showRepoManager, setShowRepoManager] = useState(false);
  const [showShortcutsModal, setShowShortcutsModal] = useState(false);
  
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  // Toast Notification System
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((message, type = 'info', duration = 4000) => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, message, type, duration }]);
  }, []);

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  // Layout & Navigation State
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    return localStorage.getItem('pr_app_sidebar_collapsed') === 'true';
  });
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Persist sidebar collapsed state
  useEffect(() => {
    localStorage.setItem('pr_app_sidebar_collapsed', isSidebarCollapsed);
  }, [isSidebarCollapsed]);

  // Global Keyboard Shortcuts
  useEffect(() => {
    function handleKeyDown(e) {
      // Ignore shortcut keypresses inside text inputs or textareas
      const tag = e.target.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || e.target.isContentEditable) {
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        setIsSidebarCollapsed(prev => !prev);
      } else if (e.key === '1') {
        setActiveTab('matrix');
      } else if (e.key === '2') {
        setActiveTab('conflicts');
      } else if (e.key === '3') {
        setActiveTab('workspaces');
      } else if (e.key === '4') {
        setActiveTab('release');
      } else if (e.key === '?' || (e.shiftKey && e.key === '/')) {
        e.preventDefault();
        setShowShortcutsModal(prev => !prev);
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

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
      addToast('Failed to load repositories', 'error');
    }
  }

  async function loadPrs() {
    setLoading(true);
    try {
      const data = await fetchPRs(selectedRepo || null);
      setPrs(data);
    } catch (err) {
      console.error(err);
      addToast('Failed to load PRs', 'error');
    } finally {
      setLoading(false);
    }
  }

  async function handleSync() {
    setSyncing(true);
    try {
      const res = await syncPRs(null, 'open', 'updated-desc', selectedRepo || null);
      setPrs(res.prs || []);
      addToast(`Successfully synced ${(res.prs || []).length} PRs from GitHub`, 'success');
    } catch (err) {
      console.error(err);
      addToast('Failed to sync PRs from GitHub', 'error');
    } finally {
      setSyncing(false);
    }
  }

  // Filter PRs by search query
  const filteredPrs = useMemo(() => {
    if (!searchQuery.trim()) return prs;
    const query = searchQuery.toLowerCase().trim();
    return prs.filter(p => {
      const titleMatch = p.title?.toLowerCase().includes(query);
      const authorMatch = p.author?.toLowerCase().includes(query);
      const numMatch = String(p.pr_number || p.number).includes(query);
      const repoMatch = p.repo_name?.toLowerCase().includes(query);
      const branchMatch = p.head_branch?.toLowerCase().includes(query) || p.base_branch?.toLowerCase().includes(query);
      const tagsMatch = p.tags?.some(t => t.toLowerCase().includes(query));

      return titleMatch || authorMatch || numMatch || repoMatch || branchMatch || tagsMatch;
    });
  }, [prs, searchQuery]);

  return (
    <div className={`app-shell ${isSidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
      {/* Toast Notification Container */}
      <ToastContainer toasts={toasts} removeToast={removeToast} />

      {/* Left Collapsible Navigation Sidebar */}
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        isCollapsed={isSidebarCollapsed}
        setIsCollapsed={setIsSidebarCollapsed}
        mobileOpen={mobileOpen}
        setMobileOpen={setMobileOpen}
        repos={repos}
        selectedRepo={selectedRepo}
        setSelectedRepo={setSelectedRepo}
        onManageRepos={() => setShowRepoManager(true)}
        onOpenShortcuts={() => setShowShortcutsModal(true)}
        handleSync={handleSync}
        syncing={syncing}
      />

      {/* Main Viewport Workspace */}
      <div className="main-viewport">
        {/* Pinned Top Workspace Header */}
        <TopHeader
          activeTab={activeTab}
          selectedRepo={selectedRepo}
          prs={prs}
          onMobileMenuToggle={() => setMobileOpen(true)}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          onOpenShortcuts={() => setShowShortcutsModal(true)}
        />

        {loading ? (
          <div className="loading-state-container">
            <div className="loading-spinner">⚡</div>
            <p>Fetching multi-repo pull request intelligence...</p>
          </div>
        ) : (
          <main className="app-main">
            {activeTab === 'matrix' && (
              <PRMatrix prs={filteredPrs} onSelectPr={num => setSelectedPrNumber(num)} addToast={addToast} />
            )}

            {activeTab === 'conflicts' && (
              <ConflictMap onResolveConflict={(num, repo) => setConflictResolverPr({ prNumber: num, repoName: repo })} addToast={addToast} />
            )}

            {activeTab === 'workspaces' && (
              <StagingWorkspacesTab prs={filteredPrs} onSelectPr={num => setSelectedPrNumber(num)} addToast={addToast} />
            )}

            {activeTab === 'release' && (
              <ReleaseBuilder prs={filteredPrs} addToast={addToast} />
            )}

            {selectedPrNumber && (
              <PRDetailDrawer
                prNumber={selectedPrNumber}
                repoName={selectedRepo}
                onClose={() => setSelectedPrNumber(null)}
                onResolveConflict={(num, repo) => setConflictResolverPr({ prNumber: num, repoName: repo })}
                addToast={addToast}
              />
            )}

            {conflictResolverPr && (
              <ConflictResolverModal
                prNumber={conflictResolverPr.prNumber}
                repoName={conflictResolverPr.repoName}
                onClose={() => setConflictResolverPr(null)}
                addToast={addToast}
              />
            )}

            {showRepoManager && (
              <RepoManagerModal
                onClose={() => setShowRepoManager(false)}
                onReposUpdated={() => { loadRepos(); loadPrs(); }}
                addToast={addToast}
              />
            )}

            {showShortcutsModal && (
              <KeyboardShortcutsModal
                isOpen={showShortcutsModal}
                onClose={() => setShowShortcutsModal(false)}
              />
            )}
          </main>
        )}
      </div>
    </div>
  );
}
