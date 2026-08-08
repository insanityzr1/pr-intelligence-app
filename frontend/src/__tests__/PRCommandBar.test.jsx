import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import PRCommandBar from '../components/PRCommandBar';

describe('PRCommandBar Component', () => {
  const samplePrs = [
    { number: 1, mergeable: 'MERGEABLE', risk: 'Low', ai_review: true },
    { number: 2, mergeable: 'CONFLICTING', risk: 'High', ai_review: false }
  ];

  it('renders total and KPI stat metric chips', () => {
    render(
      <PRCommandBar
        prs={samplePrs}
        search=""
        setSearch={vi.fn()}
        activeKpis={{}}
        toggleKpi={vi.fn()}
        resetKpis={vi.fn()}
        tagFilter="" setTagFilter={vi.fn()}
        statusFilter="" setStatusFilter={vi.fn()}
        typeFilter="" setTypeFilter={vi.fn()}
        subtypeFilter="" setSubtypeFilter={vi.fn()}
        currStatusFilter="" setCurrStatusFilter={vi.fn()}
        riskFilter="" setRiskFilter={vi.fn()}
        actionFilter="" setActionFilter={vi.fn()}
        clearAllFilters={vi.fn()}
      />
    );

    expect(screen.getByText('Total')).toBeInTheDocument();
    expect(screen.getByText('Mergeable')).toBeInTheDocument();
    expect(screen.getByText('Conflicts')).toBeInTheDocument();
    expect(screen.getByText('High Risk')).toBeInTheDocument();
    expect(screen.getByText('AI Analyzed')).toBeInTheDocument();
  });

  it('triggers toggleKpi callback when a KPI chip is clicked', () => {
    const toggleKpiMock = vi.fn();
    render(
      <PRCommandBar
        prs={samplePrs}
        search=""
        setSearch={vi.fn()}
        activeKpis={{}}
        toggleKpi={toggleKpiMock}
        resetKpis={vi.fn()}
        tagFilter="" setTagFilter={vi.fn()}
        statusFilter="" setStatusFilter={vi.fn()}
        typeFilter="" setTypeFilter={vi.fn()}
        subtypeFilter="" setSubtypeFilter={vi.fn()}
        currStatusFilter="" setCurrStatusFilter={vi.fn()}
        riskFilter="" setRiskFilter={vi.fn()}
        actionFilter="" setActionFilter={vi.fn()}
        clearAllFilters={vi.fn()}
      />
    );

    fireEvent.click(screen.getByTitle('Click to toggle Conflicts filter'));
    expect(toggleKpiMock).toHaveBeenCalledWith('conflicts');
  });

  it('opens floating popover menu when Filters button is clicked', () => {
    render(
      <PRCommandBar
        prs={samplePrs}
        search=""
        setSearch={vi.fn()}
        activeKpis={{}}
        toggleKpi={vi.fn()}
        resetKpis={vi.fn()}
        tagFilter="" setTagFilter={vi.fn()}
        statusFilter="" setStatusFilter={vi.fn()}
        typeFilter="" setTypeFilter={vi.fn()}
        subtypeFilter="" setSubtypeFilter={vi.fn()}
        currStatusFilter="" setCurrStatusFilter={vi.fn()}
        riskFilter="" setRiskFilter={vi.fn()}
        actionFilter="" setActionFilter={vi.fn()}
        clearAllFilters={vi.fn()}
      />
    );

    fireEvent.click(screen.getByText(/Filters/i));
    expect(screen.getByText('Detailed PR Filters')).toBeInTheDocument();
  });

  it('calls clearAllFilters when Clear All button is clicked', () => {
    const clearAllMock = vi.fn();
    render(
      <PRCommandBar
        prs={samplePrs}
        search="test query"
        setSearch={vi.fn()}
        activeKpis={{}}
        toggleKpi={vi.fn()}
        resetKpis={vi.fn()}
        tagFilter="" setTagFilter={vi.fn()}
        statusFilter="" setStatusFilter={vi.fn()}
        typeFilter="" setTypeFilter={vi.fn()}
        subtypeFilter="" setSubtypeFilter={vi.fn()}
        currStatusFilter="" setCurrStatusFilter={vi.fn()}
        riskFilter="" setRiskFilter={vi.fn()}
        actionFilter="" setActionFilter={vi.fn()}
        clearAllFilters={clearAllMock}
      />
    );

    fireEvent.click(screen.getByText(/Clear All/i));
    expect(clearAllMock).toHaveBeenCalled();
  });
});
