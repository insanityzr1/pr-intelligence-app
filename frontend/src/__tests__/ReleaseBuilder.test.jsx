import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ReleaseBuilder from '../components/ReleaseBuilder';
import * as client from '../api/client';

vi.mock('../api/client');

const samplePrs = [
  {
    number: 1874,
    title: 'Refactor admin template rendering',
    author: 'rpnunez',
    status: 'Open',
    risk: 'Low',
    headRefName: 'feature/refactor',
    baseRefName: 'main'
  }
];

const sampleGroups = [
  {
    group_id: 1,
    name: 'Feature Release v2.9',
    description: 'Sprint items',
    item_count: 1
  }
];

describe('ReleaseBuilder Component', () => {
  beforeEach(() => {
    client.fetchChangelogs.mockResolvedValue({ changelogs: [] });
    client.fetchGroups.mockResolvedValue({ groups: sampleGroups });
    client.fetchGroupItems.mockResolvedValue({ items: [{ pr_number: 1874, repo_name: 'rpnunez/wp-ai-scheduler' }] });
  });

  it('renders workspace selector and displays workspace PRs', async () => {
    render(<ReleaseBuilder prs={samplePrs} />);

    await waitFor(() => {
      expect(screen.getAllByText(/Feature Release v2.9/i).length).toBeGreaterThan(0);
      expect(screen.getByText(/Refactor admin template rendering/i)).toBeInTheDocument();
    });
  });

  it('triggers generateChangelog for selected workspace on button click', async () => {
    client.generateChangelog.mockResolvedValue({
      id: 1,
      title: "Release Notes for 'Feature Release v2.9' (1 PRs: #1874)",
      markdown: '# Release Notes\n- Refactor admin template rendering'
    });

    render(<ReleaseBuilder prs={samplePrs} />);

    await waitFor(() => {
      expect(screen.getByText(/Generate Changelog \(1 PRs\)/i)).toBeInTheDocument();
    });

    const generateBtn = screen.getByText(/Generate Changelog \(1 PRs\)/i);
    fireEvent.click(generateBtn);

    await waitFor(() => {
      expect(client.generateChangelog).toHaveBeenCalledWith([1874], 'Feature Release v2.9');
    });
  });

  it('allows inline creation of a new workspace', async () => {
    client.createGroup.mockResolvedValue({ status: 'success', group: { group_id: 2, name: 'Hotfix v2.9.1' } });

    render(<ReleaseBuilder prs={samplePrs} />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/New Workspace Name.../i)).toBeInTheDocument();
    });

    const input = screen.getByPlaceholderText(/New Workspace Name.../i);
    fireEvent.change(input, { target: { value: 'Hotfix v2.9.1' } });

    const createBtn = screen.getByText(/\+ New Workspace/i);
    fireEvent.click(createBtn);

    await waitFor(() => {
      expect(client.createGroup).toHaveBeenCalledWith('Hotfix v2.9.1');
    });
  });
});
