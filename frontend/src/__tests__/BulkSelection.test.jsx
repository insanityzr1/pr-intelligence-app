import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import PRMatrix from '../components/PRMatrix';
import * as client from '../api/client';

vi.mock('../api/client');

function makePr(number, overrides = {}) {
  return {
    number,
    id_str: `PR #${number}`,
    title: `Change ${number}`,
    summary: 'summary',
    author: 'rpnunez',
    status: 'Open',
    type: 'Enhancement',
    subtype: 'Core Logic',
    current_status: 'Review Required',
    risk: 'Low',
    risk_detail: 'Small Change',
    risk_score: 1,
    rec_action: 'Review Code',
    mergeable: 'MERGEABLE',
    updated_at: `2026-08-0${number}T00:00:00Z`,
    updated_rel: 'Today',
    created_fmt: 'Aug 8',
    repo_name: 'acme/alpha',
    ...overrides,
  };
}

const samplePrs = [makePr(1), makePr(2), makePr(3)];

describe('PRMatrix bulk selection', () => {
  beforeEach(() => {
    client.fetchTagsMap.mockResolvedValue({ tags_map: {} });
    client.fetchGroups.mockResolvedValue({ groups: [] });
  });

  it('shows no bulk bar until a row is selected', () => {
    render(<PRMatrix prs={samplePrs} onSelectPr={vi.fn()} tagsMap={{}} />);
    expect(screen.queryByRole('region', { name: /bulk actions/i })).not.toBeInTheDocument();
  });

  it('selects a row without opening the drawer', async () => {
    const onSelectPr = vi.fn();
    render(<PRMatrix prs={samplePrs} onSelectPr={onSelectPr} tagsMap={{}} />);

    fireEvent.click(screen.getByLabelText('Select PR #1'));

    await waitFor(() => {
      expect(screen.getByRole('region', { name: /bulk actions/i })).toBeInTheDocument();
    });
    expect(screen.getByText('1')).toBeInTheDocument();
    // Ticking the checkbox must not also trigger row navigation.
    expect(onSelectPr).not.toHaveBeenCalled();
  });

  it('shift-click selects a contiguous range', async () => {
    render(<PRMatrix prs={samplePrs} onSelectPr={vi.fn()} tagsMap={{}} />);

    fireEvent.click(screen.getByLabelText('Select PR #3'));
    fireEvent.click(screen.getByLabelText('Select PR #1'), { shiftKey: true });

    await waitFor(() => {
      expect(screen.getByLabelText('Select PR #1').checked).toBe(true);
      expect(screen.getByLabelText('Select PR #2').checked).toBe(true);
      expect(screen.getByLabelText('Select PR #3').checked).toBe(true);
    });
  });

  it('select-all toggles every visible row', async () => {
    render(<PRMatrix prs={samplePrs} onSelectPr={vi.fn()} tagsMap={{}} />);

    const selectAll = screen.getByLabelText(/select all visible/i);
    fireEvent.click(selectAll);

    await waitFor(() => {
      expect(screen.getByLabelText('Select PR #1').checked).toBe(true);
      expect(screen.getByLabelText('Select PR #3').checked).toBe(true);
    });

    fireEvent.click(screen.getByLabelText(/deselect all visible/i));
    await waitFor(() => {
      expect(screen.getByLabelText('Select PR #1').checked).toBe(false);
    });
  });

  it('rows are keyboard reachable and open on Enter', () => {
    const onSelectPr = vi.fn();
    render(<PRMatrix prs={samplePrs} onSelectPr={onSelectPr} tagsMap={{}} />);

    const row = screen.getByText('Change 1').closest('tr');
    expect(row).toHaveAttribute('tabindex', '0');

    fireEvent.keyDown(row, { key: 'Enter' });
    expect(onSelectPr).toHaveBeenCalledWith(1, 'acme/alpha');
  });
});
