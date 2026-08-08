import React, { useState, useEffect, useMemo } from 'react';
import { fetchPRs, syncPRs, fetchRepos, fetchTagsMap } from './api/client';
import { prNumberOf, tagKeyOf, headBranchOf, baseBranchOf } from './utils/prStats';
import Sidebar from './components/Sidebar';
import TopHeader from './components/TopHeader';
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
  
  // Track the PR's own repository alongside its number. `selectedRepo` is '' when
  // "All Repositories" is active, which previously left the drawer with no repo
  // context at all.
  const [selectedPr, setSelectedPr] = useState(null); // { prNumber, repoName }
  const [conflictResolverPr, setConflictResolverPr] = useState(null);
  const [showRepoManager, setShowRepoManager] = useState(false);
  
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  // Layout & Navigation State
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    return localStorage.getItem('pr_app_sidebar_collapsed') === 'true';
  });
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  // Tags live in a separate map keyed `{repo}#{number}`; the global search needs it
  // to be able to match on tag text.
  const [tagsMap, setTagsMap] = useState({});

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
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    loadRepos();
    loadPrs();
    loadTags();
  }, [selectedRepo]);

  async function loadRepos() {
    try {
      const data = await fetchRepos();
      setRepos(data.repositories || []);
    } catch (err) {
      console.error(err);
    }
  }

  async function loadTags() {
    try {
      const res = await fetchTagsMap();
      setTagsMap(res.tags_map || {});
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

  // Resolve the PR's repository from the PR itself, falling back to the active repo
  // filter. Callers that already know the repo pass it explicitly.
  function handleSelectPr(num, repoName) {
    const resolved =
      repoName ||
      prs.find(p => prNumberOf(p) === num)?.repo_name ||
      selectedRepo ||
      null;
    setSelectedPr({ prNumber: num, repoName: resolved });
  }

  // Filter PRs by search query.
  // Field names here must track the backend payload (github_service.fetch_prs):
  // the PR number is `number`, branches are `headRefName`/`baseRefName`, and tags
  // arrive from the separate /tags map rather than on the PR itself.
  const filteredPrs = useMemo(() => {
    if (!searchQuery.trim()) return prs;
    const rawQuery = searchQuery.toLowerCase().trim();
    // Allow "#1874" as well as "1874".
    const query = rawQuery.startsWith('#') ? rawQuery.slice(1) : rawQuery;

    return prs.filter(p => {
      const num = prNumberOf(p);
      const prTags = tagsMap[tagKeyOf(p)] || [];

      const titleMatch = p.title?.toLowerCase().includes(query);
      const authorMatch = p.author?.toLowerCase().includes(query);
      const numMatch = num != null && String(num).includes(query);
      const repoMatch = p.repo_name?.toLowerCase().includes(query);
      const branchMatch =
        headBranchOf(p).toLowerCase().includes(query) ||
        baseBranchOf(p).toLowerCase().includes(query);
      const tagsMatch = prTags.some(t => t.toLowerCase().includes(query));

      return titleMatch || authorMatch || numMatch || repoMatch || branchMatch || tagsMatch;
    });
  }, [prs, searchQuery, tagsMap]);

  return (
    <div className={`app-shell ${isSidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
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
        />

        {loading ? (
          <div className="loading-state-container">
            <div className="loading-spinner">⚡</div>
            <p>Fetching multi-repo pull request intelligence...</p>
          </div>
        ) : (
          <main className="app-main">
            {activeTab === 'matrix' && (
              <PRMatrix prs={filteredPrs} onSelectPr={handleSelectPr} />
            )}

            {activeTab === 'conflicts' && (
              <ConflictMap />
            )}

            {activeTab === 'workspaces' && (
              <StagingWorkspacesTab prs={filteredPrs} onSelectPr={handleSelectPr} />
            )}

            {activeTab === 'release' && (
              <ReleaseBuilder prs={filteredPrs} />
            )}

            {selectedPr && (
              <PRDetailDrawer
                prNumber={selectedPr.prNumber}
                repoName={selectedPr.repoName}
                onClose={() => setSelectedPr(null)}
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
    </div>
  );
}
