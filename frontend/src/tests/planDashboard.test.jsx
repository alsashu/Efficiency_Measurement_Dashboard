import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';

// Mock the plan API
vi.mock('../services/planApi', () => ({
  planAnalyticsApi: {
    getPeriodOptions: vi.fn().mockResolvedValue({
      data: {
        calendarYears: [2025, 2026],
        financialYears: [
          { value: 2025, label: 'FY 2025-26' },
          { value: 2026, label: 'FY 2026-27' },
        ],
      },
    }),
    getSummary: vi.fn().mockResolvedValue({ data: { total_baselines: '5', total_programs: '3', total_departments: '2', total_estimated_hrs: '1000', total_actual_hrs: '900', total_effort_variance: '100', avg_productivity_index: '1.1', total_effort_saved_hrs: '50', total_effort_saved_euros: '5000', total_cost_saved_euros: '2000', overbudget_count: '0', onbudget_count: '5' } }),
    getByDepartment: vi.fn().mockResolvedValue({ data: [] }),
    getTrends: vi.fn().mockResolvedValue({ data: { quarterly: [], yearly: [] } }),
    getTopPrograms: vi.fn().mockResolvedValue({ data: { top: [] } }),
  },
  planUploadsApi: {
    getAll: vi.fn().mockResolvedValue({ data: [] }),
  },
  planYearsApi: {
    getAll: vi.fn().mockResolvedValue({ data: [] }),
  },
}));

// Mock recharts to avoid canvas issues
vi.mock('recharts', () => {
  const React = require('react');
  const MockChart = ({ children }) => React.createElement('div', { 'data-testid': 'chart' }, children);
  return {
    BarChart: MockChart, Bar: () => null, XAxis: () => null, YAxis: () => null,
    CartesianGrid: () => null, Tooltip: () => null, Legend: () => null,
    ResponsiveContainer: ({ children }) => React.createElement('div', null, children),
    LineChart: MockChart, Line: () => null, Cell: () => null,
  };
});

import PlanDashboard from '../pages/PlanDashboard/index';
import { usePlanFilterStore } from '../store/useStore';

function wrapper({ children }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  usePlanFilterStore.getState().reset();
});

describe('PlanDashboard', () => {
  it('renders without crashing', async () => {
    render(<PlanDashboard />, { wrapper });
    await waitFor(() => {
      expect(screen.getByText(/New Dashboard/i)).toBeInTheDocument();
    });
  });

  it('shows calendar year / financial year toggle buttons', async () => {
    render(<PlanDashboard />, { wrapper });
    await waitFor(() => {
      // Use role-based query to distinguish toggle buttons from the year-filter label
      // (which also says "Calendar Year" when periodType = 'calendar')
      expect(screen.getByRole('button', { name: 'Calendar Year' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Financial Year' })).toBeInTheDocument();
    });
  });

  it('shows View by label for period type toggle', async () => {
    render(<PlanDashboard />, { wrapper });
    await waitFor(() => {
      expect(screen.getByText(/View by/i)).toBeInTheDocument();
    });
  });

  it('toggles to Financial Year when button clicked', async () => {
    render(<PlanDashboard />, { wrapper });
    await waitFor(() => screen.getByText('Financial Year'));
    fireEvent.click(screen.getByText('Financial Year'));
    expect(usePlanFilterStore.getState().periodType).toBe('financial');
  });

  it('toggles back to Calendar Year', async () => {
    usePlanFilterStore.getState().setPeriodType('financial');
    render(<PlanDashboard />, { wrapper });
    await waitFor(() => screen.getByText('Calendar Year'));
    fireEvent.click(screen.getByText('Calendar Year'));
    expect(usePlanFilterStore.getState().periodType).toBe('calendar');
  });

  it('shows overview and charts tabs', async () => {
    render(<PlanDashboard />, { wrapper });
    await waitFor(() => {
      expect(screen.getByText('overview')).toBeInTheDocument();
      expect(screen.getByText('charts')).toBeInTheDocument();
    });
  });

  it('displays source of truth message', async () => {
    render(<PlanDashboard />, { wrapper });
    await waitFor(() => {
      expect(screen.getByText(/Source of truth/i)).toBeInTheDocument();
    });
  });

  it('resets filters when Reset button clicked', async () => {
    usePlanFilterStore.getState().setPeriodType('financial');
    usePlanFilterStore.getState().setPeriodYear(2020);
    render(<PlanDashboard />, { wrapper });
    await waitFor(() => screen.getByText('Reset'));
    fireEvent.click(screen.getByText('Reset'));
    expect(usePlanFilterStore.getState().periodType).toBe('calendar');
  });
});

describe('PlanDashboard — no data state', () => {
  it('shows no data message when no records and year is selected', async () => {
    const { planAnalyticsApi } = await import('../services/planApi');
    planAnalyticsApi.getSummary.mockResolvedValueOnce({
      data: { total_baselines: '0', total_programs: '0', total_departments: '0', total_estimated_hrs: '0', total_actual_hrs: '0', total_effort_variance: '0', avg_productivity_index: '0', total_effort_saved_hrs: '0', total_effort_saved_euros: '0', total_cost_saved_euros: '0', overbudget_count: '0', onbudget_count: '0' },
    });
    usePlanFilterStore.getState().setPeriodYear(2020);
    render(<PlanDashboard />, { wrapper });
    await waitFor(() => {
      expect(screen.getByText(/No data for the selected period/i)).toBeInTheDocument();
    });
  });
});
