import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import Sidebar from '../components/Sidebar';

describe('Sidebar Component', () => {
  const sampleRepos = [
    { id: 1, repo_name: 'owner/repo-a' },
    { id: 2, repo_name: 'owner/repo-b' }
  ];

  it('renders brand title and all primary navigation items', () => {
    render(
      <Sidebar
        activeTab="matrix"
        setActiveTab={vi.fn()}
        isCollapsed={false}
        setIsCollapsed={vi.fn()}
        mobileOpen={false}
        setMobileOpen={vi.fn()}
        repos={sampleRepos}
        selectedRepo=""
        setSelectedRepo={vi.fn()}
        onManageRepos={vi.fn()}
        handleSync={vi.fn()}
        syncing={false}
      />
    );

    expect(screen.getAllByText(/PR Intelligence/i).length).toBeGreaterThan(0);
    expect(screen.getByText('PR Matrix')).toBeInTheDocument();
    expect(screen.getByText('Collision Matrix')).toBeInTheDocument();
    expect(screen.getByText('PR Workspaces')).toBeInTheDocument();
    expect(screen.getByText('Release Builder')).toBeInTheDocument();
  });

  it('triggers tab change when navigation button is clicked', () => {
    const setActiveTabMock = vi.fn();
    render(
      <Sidebar
        activeTab="matrix"
        setActiveTab={setActiveTabMock}
        isCollapsed={false}
        setIsCollapsed={vi.fn()}
        mobileOpen={false}
        setMobileOpen={vi.fn()}
        repos={sampleRepos}
        selectedRepo=""
        setSelectedRepo={vi.fn()}
        onManageRepos={vi.fn()}
        handleSync={vi.fn()}
        syncing={false}
      />
    );

    fireEvent.click(screen.getByText('Release Builder'));
    expect(setActiveTabMock).toHaveBeenCalledWith('release');
  });

  it('triggers sidebar collapse toggle when collapse button is clicked', () => {
    const setIsCollapsedMock = vi.fn();
    render(
      <Sidebar
        activeTab="matrix"
        setActiveTab={vi.fn()}
        isCollapsed={false}
        setIsCollapsed={setIsCollapsedMock}
        mobileOpen={false}
        setMobileOpen={vi.fn()}
        repos={sampleRepos}
        selectedRepo=""
        setSelectedRepo={vi.fn()}
        onManageRepos={vi.fn()}
        handleSync={vi.fn()}
        syncing={false}
      />
    );

    const toggleBtn = screen.getByTitle('Collapse Sidebar (Ctrl+B)');
    fireEvent.click(toggleBtn);
    expect(setIsCollapsedMock).toHaveBeenCalledWith(true);
  });

  it('triggers sync handler when Sync PRs button is clicked', () => {
    const handleSyncMock = vi.fn();
    render(
      <Sidebar
        activeTab="matrix"
        setActiveTab={vi.fn()}
        isCollapsed={false}
        setIsCollapsed={vi.fn()}
        mobileOpen={false}
        setMobileOpen={vi.fn()}
        repos={sampleRepos}
        selectedRepo=""
        setSelectedRepo={vi.fn()}
        onManageRepos={vi.fn()}
        handleSync={handleSyncMock}
        syncing={false}
      />
    );

    fireEvent.click(screen.getByText('Sync PRs Now'));
    expect(handleSyncMock).toHaveBeenCalled();
  });
});
