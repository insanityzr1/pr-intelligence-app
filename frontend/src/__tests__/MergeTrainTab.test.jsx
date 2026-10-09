import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import MergeTrainTab from '../components/MergeTrainTab';
import { ToastProvider } from '../components/ToastProvider';

// Mock the API client
vi.mock('../api/client', () => ({
  fetchMergeTrainStatus: vi.fn().mockResolvedValue({ enabled: true, git_version: '2.40' }),
  simulateMergeTrain: vi.fn().mockResolvedValue({
    status: 'success',
    result: {
      status: 'clean',
      repo_name: 'acme/repo',
      base_branch: 'main',
      total_prs: 2,
      clean_count: 2,
      blocked_count: 0,
      ordered_prs: [101, 102],
      steps: [
        { pr_number: 101, title: 'Feature 1', clean: true, conflicts: [] },
        { pr_number: 102, title: 'Feature 2', clean: true, conflicts: [] }
      ],
      clean_prs: [101, 102],
      blocked_prs: [],
      can_publish_staging: true,
      staging_branch_candidate: 'staging/merge-train-20261008-01',
      final_commit: 'commit123'
    }
  }),
  publishMergeTrain: vi.fn().mockResolvedValue({
    status: 'published',
    result: {
      staging_branch: 'staging/merge-train-20261008-01'
    }
  })
}));

describe('MergeTrainTab Component', () => {
  const samplePrs = [
    { number: 101, title: 'Add auth token', status: 'Open', author: 'alice', repo_name: 'acme/repo' },
    { number: 102, title: 'Update UI cards', status: 'Open', author: 'bob', repo_name: 'acme/repo' },
    { number: 103, title: 'Fix query logic', status: 'Open', author: 'carol', repo_name: 'acme/repo' }
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders merge train header and initial queue', () => {
    render(
      <ToastProvider>
        <MergeTrainTab prs={samplePrs} />
      </ToastProvider>
    );

    expect(screen.getByText(/Virtual Merge Train/i)).toBeInTheDocument();
    expect(screen.getByText(/Train Queue/i)).toBeInTheDocument();
    expect(screen.getByText(/Add auth token/i)).toBeInTheDocument();
  });

  it('simulates merge train and renders passing cars', async () => {
    render(
      <ToastProvider>
        <MergeTrainTab prs={samplePrs} />
      </ToastProvider>
    );

    const simulateBtn = screen.getByRole('button', { name: /Run Merge Train Simulation/i });
    fireEvent.click(simulateBtn);

    await waitFor(() => {
      expect(screen.getByText(/Merge Train Complete/i)).toBeInTheDocument();
    });

    expect(screen.getByText(/Visual Train Sequence/i)).toBeInTheDocument();
    expect(screen.getByText(/Deploy Validated Staging Branch/i)).toBeInTheDocument();
  });
});
