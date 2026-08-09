import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { fetchPRs, syncPRs, fetchRepos, fetchTagsMap } from './api/client';
import { prNumberOf, tagKeyOf, headBranchOf, baseBranchOf } from './utils/prStats';
import { readParams, writeParams } from './hooks/useUrlState';
import { useEventStream } from './hooks/useEventStream';
import { useToast } from './components/ToastProvider';
import KeyboardHelpOverlay from './components/KeyboardHelpOverlay';
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

const VALID_TABS = ['matrix', 'conflicts', 'workspaces', 'release'];

export default function App() {
  const toast = useToast();

  // Hydrate from the URL so a refresh or a shared link lands in the same place.
  const initialParams = useMemo(() => readParams(), []);

  const [activeTab, setActiveTab] = useState(
    () => (VALID_TABS.includes(initialParams.tab) ? initialParams.tab : 'matrix')
  );
  const [prs, setPrs] = useState([]);
  const [repos, setRepos] = useState([]);
  const [selectedRepo, setSelectedRepo] = useState(() => initialParams.repo || '');

  // Track the PR's own repository alongside its number. `selectedRepo` is '' when
  // "All Repositories" is active, which previously left the drawer with no repo
  // context at all.
  const [selectedPr, setSelectedPr] = useState(() => (
    initialParams.pr
      ? { prNumber: Number(initialParams.pr), repoName: initialParams.prRepo || null }
      : null
  ));
  const [conflictResolverPr, setConflictResolverPr] = useState(null);
  const [showRepoManager, setShowRepoManager] = useState(false);
  const [showKeyboardHelp, setShowKeyboardHelp] = useState(false);

  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [loadError, setLoadError] = useState(null);

  // Guards against a slow response for a previous repo landing after a newer one.
  const loadRequestId = useRef(0);

  // Layout & Navigation State
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    return localStorage.getItem('pr_app_sidebar_collapsed') === 'true';
  });
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState(() => initialParams.q || '');
  // Tags live in a separate map keyed `{repo}#{number}`; the global search needs it
  // to be able to match on tag text.
  const [tagsMap, setTagsMap] = useState({});

  // Persist sidebar collapsed state
  useEffect(() => {
    localStorage.setItem('pr_app_sidebar_collapsed', isSidebarCollapsed);
  }, [isSidebarCollapsed]);

  // Mirror shareable state into the query string. Tab/repo/search replace the
  // current entry (Back should not step through every keystroke)...
  useEffect(() => {
    writeParams(
      { tab: activeTab === 'matrix' ? '' : activeTab, repo: selectedRepo, q: searchQuery },
      { replace: true }
    );
  }, [activeTab, selectedRepo, searchQuery]);

  // ...but opening a PR pushes an entry, so Back closes the drawer instead of
  // leaving the app.
  useEffect(() => {
    writeParams(
      { pr: selectedPr?.prNumber || '', prRepo: selectedPr?.repoName || '' },
      { replace: false }
    );
  }, [selectedPr?.prNumber, selectedPr?.repoName]);

  // Keep state in sync with Back/Forward.
  useEffect(() => {
    function onPopState() {
      const params = readParams();
      setActiveTab(VALID_TABS.includes(params.tab) ? params.tab : 'matrix');
      setSelectedRepo(params.repo || '');
      setSearchQuery(params.q || '');
      setSelectedPr(
        params.pr ? { prNumber: Number(params.pr), repoName: params.prRepo || null } : null
      );
    }
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

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
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        focusGlobalSearch();
      } else if (e.key === '/') {
        e.preventDefault();
        focusGlobalSearch();
      } else if (e.key === '?') {
        e.preventDefault();
        setShowKeyboardHelp(prev => !prev);
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

  // Esc closes the topmost overlay. Registered separately because, unlike the
  // shortcuts above, it must fire even while focus is inside an input.
  useEffect(() => {
    function handleEscape(e) {
      if (e.key !== 'Escape') return;
      if (showKeyboardHelp) return setShowKeyboardHelp(false);
      if (showRepoManager) return setShowRepoManager(false);
      if (conflictResolverPr) return setConflictResolverPr(null);
      if (selectedPr) return setSelectedPr(null);
    }
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [showKeyboardHelp, showRepoManager, conflictResolverPr, selectedPr]);

  function focusGlobalSearch() {
    const input = document.querySelector('.top-search-input');
    if (input) {
      input.focus();
      input.select();
    }
  }

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
      toast.error(`Could not load repositories: ${err.message}`);
    }
  }

  const loadTags = useCallback(async () => {
    try {
      const res = await fetchTagsMap();
      setTagsMap(res.tags_map || {});
    } catch (err) {
      console.error(err);
      toast.error(`Could not load tags: ${err.message}`);
    }
  }, [toast]);

  async function loadPrs() {
    // Ignore any response that is not from the most recent request, so rapidly
    // switching repositories cannot land stale data over fresh data.
    const requestId = ++loadRequestId.current;
    setLoading(true);
    setLoadError(null);
    try {
      const data = await fetchPRs(selectedRepo || null);
      if (requestId !== loadRequestId.current) return;
      setPrs(data);
    } catch (err) {
      if (requestId !== loadRequestId.current) return;
      console.error(err);
      setLoadError(err.message || 'Could not load pull requests.');
      toast.error(`Could not load pull requests: ${err.message}`);
    } finally {
      if (requestId === loadRequestId.current) setLoading(false);
    }
  }

  async function handleSync() {
    setSyncing(true);
    try {
      const res = await syncPRs(null, 'open', 'updated-desc', selectedRepo || null);
      setPrs(res.prs || []);
      setLoadError(null);
      toast.success(`Synced ${res.prs?.length ?? 0} pull requests.`);
    } catch (err) {
      console.error(err);
      toast.error(`Sync failed: ${err.message}`);
    } finally {
      setSyncing(false);
    }
  }

  // Live updates. Data used to be stale until someone clicked "Sync PRs Now";
  // webhook deliveries and the background sync worker now push changes here.
  const { connected: liveConnected } = useEventStream({
    prs_updated: (payload) => {
      // Only refetch when the update concerns what is on screen.
      if (!selectedRepo || payload.repo_name === selectedRepo) {
        loadPrs();
        toast.info(`${payload.changed} PR${payload.changed === 1 ? '' : 's'} updated in ${payload.repo_name}.`);
      }
    },
    sync_failed: (payload) => {
      toast.error(`Sync failed for ${payload.repo_name}: ${payload.error}`);
    },
  });

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
          liveConnected={liveConnected}
        />

        {loading ? (
          <div className="loading-state-container">
            <div className="loading-spinner">⚡</div>
            <p>Fetching multi-repo pull request intelligence...</p>
          </div>
        ) : loadError ? (
          // A failed load previously rendered the same "no results" empty state
          // as a successful-but-empty one.
          <div className="loading-state-container" role="alert">
            <div className="loading-spinner">⚠️</div>
            <p>{loadError}</p>
            <button className="btn btn-primary" onClick={loadPrs}>Retry</button>
          </div>
        ) : (
          <main className="app-main">
            {activeTab === 'matrix' && (
              <PRMatrix prs={filteredPrs} onSelectPr={handleSelectPr} tagsMap={tagsMap} onTagsChanged={loadTags} />
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

      <KeyboardHelpOverlay
        isOpen={showKeyboardHelp}
        onClose={() => setShowKeyboardHelp(false)}
      />
    </div>
  );
}
