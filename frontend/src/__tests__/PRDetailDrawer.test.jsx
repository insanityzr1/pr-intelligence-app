import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import PRDetailDrawer from '../components/PRDetailDrawer';
import * as client from '../api/client';

vi.mock('../api/client');

const samplePrDetail = {
  number: 1874,
  title: 'Refactor admin template rendering',
  author: 'rpnunez',
  summary: 'Remove inline styles in admin templates',
  body: 'This PR refactors admin templates.',
  updated_rel: '1 hour ago',
  url: 'https://github.com/org/repo/pull/1874',
  mergeable: 'CLEAN',
  repo_name: 'rpnunez/wp-ai-scheduler',
  ai_review: {
    code_quality_score: 88,
    ai_summary: 'Clean modular refactoring.',
    architectural_impact: 'Updates admin templates.',
    breaking_changes: [],
    security_risks: [],
    qa_test_scenarios: ['1. Test admin settings rendering.']
  }
};

describe('PRDetailDrawer Component', () => {
  beforeEach(() => {
    client.fetchPRDetail.mockResolvedValue(samplePrDetail);
    client.fetchPRChatHistory.mockResolvedValue({ history: [] });
    client.fetchTagsMap.mockResolvedValue({ tags_map: {} });
  });

  it('renders overview tab with quality score and AI executive synthesis', async () => {
    render(
      <PRDetailDrawer
        prNumber={1874}
        repoName="rpnunez/wp-ai-scheduler"
        onClose={vi.fn()}
        onResolveConflict={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/Refactor admin template rendering/i)).toBeInTheDocument();
    });

    expect(screen.getByText('88 / 100')).toBeInTheDocument();
    expect(screen.getByText('Clean modular refactoring.')).toBeInTheDocument();
  });

  it('switches to chat tab on click', async () => {
    render(
      <PRDetailDrawer
        prNumber={1874}
        repoName="rpnunez/wp-ai-scheduler"
        onClose={vi.fn()}
        onResolveConflict={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/Refactor admin template rendering/i)).toBeInTheDocument();
    });

    const chatTabBtn = screen.getByText(/Chat with AI/i);
    fireEvent.click(chatTabBtn);

    expect(screen.getByPlaceholderText(/Ask AI about tests, refactors, edge cases, or code diff.../i)).toBeInTheDocument();
  });
});
