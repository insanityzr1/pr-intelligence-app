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
    type: 'Refactor',
    subtype: 'Core Logic',
    headRefName: 'feature/refactor',
    baseRefName: 'main'
  }
];

describe('ReleaseBuilder Component', () => {
  beforeEach(() => {
    client.fetchChangelogs.mockResolvedValue({ changelogs: [] });
  });

  it('renders typeahead search and filters PRs by number', async () => {
    render(<ReleaseBuilder prs={samplePrs} />);

    expect(screen.getByText('#1874: Refactor admin template rendering')).toBeInTheDocument();

    const searchInput = screen.getByPlaceholderText(/Type PR title, branch name, author, or '#1874'/i);
    fireEvent.change(searchInput, { target: { value: '#999' } });

    expect(screen.getByText("No PRs match your search query '#999'.")).toBeInTheDocument();
  });

  it('triggers generateChangelog on button click', async () => {
    client.generateChangelog.mockResolvedValue({
      id: 1,
      title: 'Release Notes (1 PRs: #1874)',
      markdown: '# Release Notes\n- Refactor admin template rendering'
    });

    render(<ReleaseBuilder prs={samplePrs} />);

    const checkbox = screen.getByRole('checkbox');
    fireEvent.click(checkbox);

    const generateBtn = screen.getByText(/Generate Changelog \(1 Selected\)/i);
    fireEvent.click(generateBtn);

    await waitFor(() => {
      expect(client.generateChangelog).toHaveBeenCalledWith([1874]);
    });
  });
});
