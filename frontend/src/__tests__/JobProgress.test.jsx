import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import JobProgress, { isJobFinished } from '../components/JobProgress';

const job = (overrides = {}) => ({
  id: 'j1', kind: 'analyze', status: 'running',
  total: 4, completed: 1, failed: 0, current: 42, errors: [],
  ...overrides,
});

describe('JobProgress', () => {
  it('renders nothing without a job', () => {
    const { container } = render(<JobProgress job={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows which PR is being reviewed and how far along it is', () => {
    render(<JobProgress job={job()} onCancel={vi.fn()} />);

    expect(screen.getByText(/Reviewing #42/)).toBeInTheDocument();
    expect(screen.getByText('1/4')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '25');
  });

  it('counts failures toward progress, not just successes', () => {
    render(<JobProgress job={job({ completed: 1, failed: 1 })} />);
    // 2 of 4 resolved, so the bar must not stall at 25%.
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '50');
    expect(screen.getByText(/1 failed/)).toBeInTheDocument();
  });

  it('offers cancel while running and hides it once finished', () => {
    const onCancel = vi.fn();
    const { rerender } = render(<JobProgress job={job()} onCancel={onCancel} />);

    fireEvent.click(screen.getByText('Cancel'));
    expect(onCancel).toHaveBeenCalledWith('j1');

    rerender(<JobProgress job={job({ status: 'done', completed: 4 })} onCancel={onCancel} />);
    expect(screen.queryByText('Cancel')).not.toBeInTheDocument();
    expect(screen.getByText('Complete')).toBeInTheDocument();
  });

  it('surfaces errors instead of silently finishing', () => {
    render(<JobProgress job={job({
      status: 'completed_with_errors', completed: 2, failed: 2,
      errors: [{ pr_number: 7, error: 'rate limited' }],
    })} />);

    expect(screen.getByText(/Finished with errors/)).toBeInTheDocument();
    expect(screen.getByText(/#7: rate limited/)).toBeInTheDocument();
  });

  it('isJobFinished covers every terminal state', () => {
    ['done', 'failed', 'cancelled', 'completed_with_errors'].forEach(s =>
      expect(isJobFinished(s)).toBe(true)
    );
    ['queued', 'running'].forEach(s => expect(isJobFinished(s)).toBe(false));
  });
});
