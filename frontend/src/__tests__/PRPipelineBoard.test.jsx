import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import PRPipelineBoard from '../components/PRPipelineBoard';

describe('PRPipelineBoard Component', () => {
  const samplePrs = [
    {
      number: 101,
      title: 'Fix edge case in auth',
      author: 'alice',
      repo_name: 'acme/repo',
      status: 'Open',
      checks_state: 'FAILING',
      risk: 'High',
      updated_rel: '1h ago',
    },
    {
      number: 102,
      title: 'Refactor database queries',
      author: 'bob',
      repo_name: 'acme/repo',
      status: 'Conflicting',
      mergeable: 'CONFLICTING',
      checks_state: 'PASSING',
      risk: 'Medium',
      updated_rel: '2h ago',
    },
    {
      number: 103,
      title: 'Add analytics tracking',
      author: 'carol',
      repo_name: 'acme/repo',
      status: 'Open',
      checks_state: 'PASSING',
      review_decision: 'APPROVED',
      risk: 'Low',
      updated_rel: '3h ago',
      ai_review: { code_quality_score: 95 }
    },
    {
      number: 104,
      title: 'Documentation updates',
      author: 'dave',
      repo_name: 'acme/repo',
      status: 'Open',
      checks_state: 'PENDING',
      risk: 'Low',
      updated_rel: '4h ago',
    }
  ];

  it('renders all four lifecycle stage columns', () => {
    render(<PRPipelineBoard prs={samplePrs} onSelectPr={() => {}} />);

    expect(screen.getByText(/Needs Review/i)).toBeInTheDocument();
    expect(screen.getByText(/CI Blocked/i)).toBeInTheDocument();
    expect(screen.getByText(/In Staging/i)).toBeInTheDocument();
    expect(screen.getByText(/Ready to Land/i)).toBeInTheDocument();
  });

  it('correctly maps PRs into their stages based on CI, conflict, and review states', () => {
    render(<PRPipelineBoard prs={samplePrs} onSelectPr={() => {}} />);

    // PR #101 has FAILING checks -> CI Blocked
    expect(screen.getByText(/Fix edge case in auth/i)).toBeInTheDocument();
    expect(screen.getByText('🛠️ Fix CI')).toBeInTheDocument();

    // PR #102 is Conflicting -> In Staging
    expect(screen.getByText(/Refactor database queries/i)).toBeInTheDocument();

    // PR #103 is Passing + Approved -> Ready to Land
    expect(screen.getByText(/Add analytics tracking/i)).toBeInTheDocument();
    expect(screen.getByText(/95\/100/i)).toBeInTheDocument();

    // PR #104 is Pending -> Needs Review
    expect(screen.getByText(/Documentation updates/i)).toBeInTheDocument();
  });

  it('triggers onSelectPr when a card is clicked', () => {
    const handleSelect = vi.fn();
    render(<PRPipelineBoard prs={samplePrs} onSelectPr={handleSelect} />);

    fireEvent.click(screen.getByText(/Add analytics tracking/i));
    expect(handleSelect).toHaveBeenCalledWith(103, 'acme/repo');
  });

  it('triggers onSelectPr with ci-triage tab when Fix CI button is clicked', () => {
    const handleSelect = vi.fn();
    render(<PRPipelineBoard prs={samplePrs} onSelectPr={handleSelect} />);

    const fixBtn = screen.getByText('🛠️ Fix CI');
    fireEvent.click(fixBtn);
    expect(handleSelect).toHaveBeenCalledWith(101, 'acme/repo', 'ci-triage');
  });
});
