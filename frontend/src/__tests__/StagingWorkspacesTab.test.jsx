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
    item_count: 1
  }
];

describe('StagingWorkspacesTab Component', () => {
  beforeEach(() => {
    client.fetchGroups.mockResolvedValue({ groups: sampleGroups });
    client.fetchGroupItems.mockResolvedValue({ items: [{ pr_number: 1874, repo_name: 'rpnunez/wp-ai-scheduler' }] });
  });

  it('renders workspace buckets and group items selection dropdown', async () => {
    render(<StagingWorkspacesTab prs={samplePrs} onSelectPr={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('Feature Release v2.9')).toBeInTheDocument();
    });

    expect(screen.getByText('Workspace: Feature Release v2.9')).toBeInTheDocument();
    expect(screen.getAllByText(/Refactor admin template rendering/i).length).toBeGreaterThan(0);
  });

  it('triggers createGroup when form is submitted', async () => {
    client.createGroup.mockResolvedValue({ status: 'success', group: { group_id: 2, name: 'Hotfix v2.9.1' } });

    render(<StagingWorkspacesTab prs={samplePrs} onSelectPr={vi.fn()} />);

    const input = screen.getByPlaceholderText(/e.g. Feature Release v2.9/i);
    fireEvent.change(input, { target: { value: 'Hotfix v2.9.1' } });

    const submitBtn = screen.getByText(/\+ Create Workspace Bucket/i);
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(client.createGroup).toHaveBeenCalledWith('Hotfix v2.9.1', '');
    });
  });
});
