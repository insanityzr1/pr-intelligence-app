import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import FormattedMarkdown from '../components/FormattedMarkdown';

describe('FormattedMarkdown Component', () => {
  it('renders headers, paragraphs, and list items cleanly', () => {
    const markdown = `
# Executive Summary
This is a test paragraph.

- Item 1
- Item 2
`;
    render(<FormattedMarkdown content={markdown} />);

    expect(screen.getByText('Executive Summary')).toBeInTheDocument();
    expect(screen.getByText('This is a test paragraph.')).toBeInTheDocument();
    expect(screen.getByText('Item 1')).toBeInTheDocument();
    expect(screen.getByText('Item 2')).toBeInTheDocument();
  });

  it('renders inline code ticks and checkbox items', () => {
    const markdown = `
Use \`git rebase\` to resolve conflicts.
- [x] Completed task
`;
    render(<FormattedMarkdown content={markdown} />);

    expect(screen.getByText('git rebase')).toBeInTheDocument();
    expect(screen.getByText('Completed task')).toBeInTheDocument();
  });
});
