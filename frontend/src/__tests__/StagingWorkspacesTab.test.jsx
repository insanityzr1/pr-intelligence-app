import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import StagingWorkspacesTab from '../components/StagingWorkspacesTab';
import * as client from '../api/client';

vi.mock('../api/client');

const samplePrs = [
  {
    number: 1874,
    title: 'Refactor admin template rendering',
    author: 'rpnunez',
    status: 'Open',
    risk: 'Low',
    repo_name: 'rpnunez/wp-ai-scheduler'
  }
];

const sampleGroups = [
  {
    group_id: 1,
    name: 'Feature Release v2.9',
    description: 'Sprint 2.9 items',
    item_count: 1,
    updated_at: '2026-08-08T00:00:00Z'
  }
];

describe('StagingWorkspacesTab Component', () => {
  beforeEach(() => {
    client.fetchGroups.mockResolvedValue({ groups: sampleGroups });
    client.fetchGroupItems.mockResolvedValue({ items: [{ pr_number: 1874, repo_name: 'rpnunez/wp-ai-scheduler' }] });
  });

  it('renders workspace directory and active workspace PRs', async () => {
    render(<StagingWorkspacesTab prs={samplePrs} onSelectPr={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('Feature Release v2.9')).toBeInTheDocument();
      expect(screen.getByText('Workspace: Feature Release v2.9')).toBeInTheDocument();
      expect(screen.getAllByText(/Refactor admin template rendering/i).length).toBeGreaterThan(0);
    });
  });

  it('opens modal and triggers createGroup when "+ Add Workspace" is clicked and submitted', async () => {
    client.createGroup.mockResolvedValue({ status: 'success', group: { group_id: 2, name: 'Hotfix v2.9.1' } });

    render(<StagingWorkspacesTab prs={samplePrs} onSelectPr={vi.fn()} />);

    const addWorkspaceBtn = screen.getByRole('button', { name: /\+ Add Workspace/i });
    fireEvent.click(addWorkspaceBtn);

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/e.g. Feature Release v2.9/i)).toBeInTheDocument();
    });

    const nameInput = screen.getByPlaceholderText(/e.g. Feature Release v2.9/i);
    fireEvent.change(nameInput, { target: { value: 'Hotfix v2.9.1' } });

    const submitBtn = screen.getByRole('button', { name: /Create Workspace/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(client.createGroup).toHaveBeenCalledWith('Hotfix v2.9.1', '');
    });
  });

  it('filters workspaces in the directory search input', async () => {
    render(<StagingWorkspacesTab prs={samplePrs} onSelectPr={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Filter workspaces.../i)).toBeInTheDocument();
    });

    const filterInput = screen.getByPlaceholderText(/Filter workspaces.../i);
    fireEvent.change(filterInput, { target: { value: 'Nonexistent' } });

    expect(screen.getByText(/No workspaces found/i)).toBeInTheDocument();
  });
});
