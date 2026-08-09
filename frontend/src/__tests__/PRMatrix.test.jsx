import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import PRMatrix from '../components/PRMatrix';
import * as client from '../api/client';

vi.mock('../api/client');

const samplePRs = [
  {
    number: 1874,
    id_str: 'PR #1874',
    url: 'https://github.com/org/repo/pull/1874',
    title: 'Refactor admin template rendering',
    status: 'Open',
    summary: 'Remove inline styles',
    type: 'Refactor',
    subtype: 'Core Logic',
    current_status: 'Review Required',
    risk: 'Low',
    risk_detail: 'Small Change',
    risk_score: 1,
    rec_action: 'Review Code',
    changed_files: 2,
    additions: 20,
    deletions: 5,
    mergeable: 'CLEAN',
    author: 'rpnunez',
    updated_at: '2026-08-08T00:00:00Z',
    updated_rel: '1 hour ago',
    created_at: '2026-08-08T00:00:00Z',
    created_fmt: 'Aug 8, 2026',
    head_sha: 'sha1874',
    repo_name: 'rpnunez/wp-ai-scheduler',
    labels: []
  }
];

describe('PRMatrix Component', () => {
  beforeEach(() => {
    client.fetchTagsMap.mockResolvedValue({ tags_map: {} });
  });

  it('renders PR matrix table with PR items', async () => {
    render(<PRMatrix prs={samplePRs} onSelectPr={vi.fn()} />);

    expect(screen.getByText('Refactor admin template rendering')).toBeInTheDocument();
    expect(screen.getByText('Remove inline styles')).toBeInTheDocument();
  });

  it('filters PR items when search input is typed', async () => {
    render(<PRMatrix prs={samplePRs} onSelectPr={vi.fn()} />);

    const searchInput = screen.getByPlaceholderText(/Filter PR ID, title, summary/i);
    fireEvent.change(searchInput, { target: { value: 'Nonexistent' } });

    expect(screen.getByText('No Pull Requests match the selected filters.')).toBeInTheDocument();
  });

  it('calls onSelectPr when a row is clicked', async () => {
    const onSelectMock = vi.fn();
    render(<PRMatrix prs={samplePRs} onSelectPr={onSelectMock} />);

    const prRow = screen.getByText('Refactor admin template rendering').closest('tr');
    fireEvent.click(prRow);

    // The row now passes the PR's own repository alongside the number, so the
    // detail drawer keeps its repo context in multi-repo mode.
    expect(onSelectMock).toHaveBeenCalledWith(1874, 'rpnunez/wp-ai-scheduler');
  });
});
