import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import BuildPanel from '../components/BuildPanel';
import * as client from '../api/client';

vi.mock('../api/client');

const CLEAN = {
  readiness: { ready: true, total_prs: 2, blocker_count: 0, blockers: {}, warnings: {} },
  simulation: {
    available: true, clean: true, total_prs: 2,
    repos: [{
      repo_name: 'acme/alpha', available: true, base_branch: 'main', clean: true,
      pr_count: 2, merged: ['#1', '#2'], blocked: [], conflict_pairs: [],
      suggested_order: [1, 2], tree: 'abc',
      steps: [
        { label: '#1', clean: true, conflicts: [] },
        { label: '#2', clean: true, conflicts: [] },
      ],
    }],
  },
};

const CONFLICTED = {
  readiness: {
    ready: false, total_prs: 2, blocker_count: 2, shippable_with_review: false,
    blockers: {
      conflicting: [{ pr_number: 2, repo_name: 'acme/alpha', title: 'B' }],
      failing_ci: [{ pr_number: 1, repo_name: 'acme/alpha', title: 'A', failed_checks: ['lint'] }],
      changes_requested: [], unapproved: [], drafts: [],
    },
    warnings: { pending_ci: [] },
  },
  simulation: {
    available: true, clean: false, total_prs: 2,
    repos: [{
      repo_name: 'acme/alpha', available: true, base_branch: 'main', clean: false,
      pr_count: 2, merged: ['#1'], blocked: ['#2'],
      conflict_pairs: [{ a: '#1', b: '#2', files: ['shared.txt'] }],
      suggested_order: [1, 2], tree: 'abc',
      steps: [
        { label: '#1', clean: true, conflicts: [] },
        { label: '#2', clean: false, conflicts: ['shared.txt'] },
      ],
    }],
  },
};

describe('BuildPanel', () => {
  beforeEach(() => {
    client.fetchBuildStatus.mockResolvedValue({ enabled: true, git_version: '2.55' });
    client.buildPatchUrl.mockReturnValue('/api/build/patch?group_id=1');
  });

  it('does not simulate until asked', async () => {
    render(<BuildPanel groupId={1} groupName="v2.9" prCount={2} />);
    await waitFor(() => expect(client.fetchBuildStatus).toHaveBeenCalled());
    expect(client.fetchBuildReadiness).not.toHaveBeenCalled();
  });

  it('reports a clean build and offers the patch', async () => {
    client.fetchBuildReadiness.mockResolvedValue(CLEAN);
    render(<BuildPanel groupId={1} groupName="v2.9" prCount={2} />);

    fireEvent.click(screen.getByText(/Run Simulation/i));

    expect(await screen.findByText(/Ready to ship/i)).toBeInTheDocument();
    expect(screen.getByText(/Download Patch/i)).toBeInTheDocument();
  });

  it('surfaces which PR breaks the build and which pair collides', async () => {
    client.fetchBuildReadiness.mockResolvedValue(CONFLICTED);
    render(<BuildPanel groupId={1} groupName="v2.9" prCount={2} />);

    fireEvent.click(screen.getByText(/Run Simulation/i));

    expect(await screen.findByText(/2 ship blockers/i)).toBeInTheDocument();
    // The conflicting pair is named, not just "there is a conflict".
    expect(screen.getByText(/Conflicting pairs/i)).toBeInTheDocument();
    expect(screen.getAllByText('shared.txt').length).toBeGreaterThan(0);
    // A broken build offers no patch download.
    expect(screen.queryByText(/Download Patch/i)).not.toBeInTheDocument();
    // Failing CI names the check.
    expect(screen.getByText(/lint/)).toBeInTheDocument();
  });

  it('explains itself when real merges are unavailable', async () => {
    client.fetchBuildStatus.mockResolvedValue({ enabled: false, reason: 'git 2.30 is too old' });
    render(<BuildPanel groupId={1} groupName="v2.9" prCount={2} />);

    expect(await screen.findByText(/git 2.30 is too old/i)).toBeInTheDocument();
    expect(screen.getByText(/Run Simulation/i)).toBeDisabled();
  });

  it('clears a stale result when the workspace changes', async () => {
    client.fetchBuildReadiness.mockResolvedValue(CLEAN);
    const { rerender } = render(<BuildPanel groupId={1} groupName="v2.9" prCount={2} />);

    fireEvent.click(screen.getByText(/Run Simulation/i));
    expect(await screen.findByText(/Ready to ship/i)).toBeInTheDocument();

    // A simulation is only valid for the workspace it ran against.
    rerender(<BuildPanel groupId={2} groupName="v3.0" prCount={4} />);
    await waitFor(() => {
      expect(screen.queryByText(/Ready to ship/i)).not.toBeInTheDocument();
    });
  });
});
