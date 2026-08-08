import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import PRTagBar from '../components/PRTagBar';
import * as client from '../api/client';

vi.mock('../api/client');

describe('PRTagBar Component', () => {
  it('renders predefined quick tags and active tags', () => {
    render(
      <PRTagBar
        prNumber={101}
        repoName="test/repo"
        activeTags={['⭐ Starred']}
        onTagsUpdated={vi.fn()}
      />
    );

    expect(screen.getByText('⭐ Starred')).toBeInTheDocument();
    expect(screen.getByText('🚀 Must Review')).toBeInTheDocument();
    expect(screen.getByText('+ Add Custom Tag')).toBeInTheDocument();
  });

  it('toggles tag on button click', async () => {
    client.addPRTag.mockResolvedValue({ tags: ['⭐ Starred', '🚀 Must Review'] });
    const onTagsUpdatedMock = vi.fn();

    render(
      <PRTagBar
        prNumber={101}
        repoName="test/repo"
        activeTags={['⭐ Starred']}
        onTagsUpdated={onTagsUpdatedMock}
      />
    );

    const mustReviewBtn = screen.getByText('🚀 Must Review');
    fireEvent.click(mustReviewBtn);

    expect(client.addPRTag).toHaveBeenCalledWith(101, '🚀 Must Review', 'test/repo');
  });
});
