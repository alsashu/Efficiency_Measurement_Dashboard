import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';

vi.mock('../services/planApi', () => ({
  planAnalyticsApi: {
    getPeriodOptions: vi.fn().mockResolvedValue({
      data: {
        calendarYears: [2025, 2026],
        financialYears: [{ value: 2025, label: 'FY 2025-26' }],
      },
    }),
    getByDepartment: vi.fn().mockResolvedValue({
      data: [{ dept: 'TET', estimated_hrs: '500', actual_hrs: '450', effort_saved_hrs: '50', avg_pi: '1.1' }],
    }),
    getByProgram: vi.fn().mockResolvedValue({
      data: [{ program_name: 'RIGHT', estimated_hrs: '200', actual_hrs: '180', effort_saved_hrs: '20', avg_pi: '1.1' }],
    }),
    getTrends: vi.fn().mockResolvedValue({
      data: { quarterly: [], yearly: [{ year: 2025, estimated_hrs: '1000', actual_hrs: '900', effort_saved_hrs: '100' }] },
    }),
  },
}));

vi.mock('recharts', () => {
  const React = require('react');
  const Mock = ({ children }) => React.createElement('div', { 'data-testid': 'chart' }, children);
  return {
    BarChart: Mock, Bar: () => null, XAxis: () => null, YAxis: () => null,
    CartesianGrid: () => null, Tooltip: () => null, Legend: () => null,
    ResponsiveContainer: ({ children }) => React.createElement('div', null, children),
    LineChart: Mock, Line: () => null, Cell: () => null, ReferenceLine: () => null,
  };
});

import PlanAnalytics from '../pages/PlanAnalytics/index';
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

describe('PlanAnalytics', () => {
  it('renders without crashing', async () => {
    render(<PlanAnalytics />, { wrapper });
    await waitFor(() => {
      // Year-filter label also reads "Calendar Year" — use role to target the toggle button only
      expect(screen.getByRole('button', { name: /Calendar Year/i })).toBeInTheDocument();
    });
  });

  it('shows departments, programs, trends tabs', async () => {
    render(<PlanAnalytics />, { wrapper });
    await waitFor(() => {
      expect(screen.getByText('departments')).toBeInTheDocument();
      expect(screen.getByText('programs')).toBeInTheDocument();
      expect(screen.getByText('trends')).toBeInTheDocument();
    });
  });

  it('shows CY/FY toggle', async () => {
    render(<PlanAnalytics />, { wrapper });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Calendar Year' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Financial Year' })).toBeInTheDocument();
    });
  });

  it('switches to Financial Year view', async () => {
    render(<PlanAnalytics />, { wrapper });
    await waitFor(() => screen.getByText('Financial Year'));
    fireEvent.click(screen.getByText('Financial Year'));
    expect(usePlanFilterStore.getState().periodType).toBe('financial');
  });

  it('switches to programs tab', async () => {
    render(<PlanAnalytics />, { wrapper });
    await waitFor(() => screen.getByText('programs'));
    fireEvent.click(screen.getByText('programs'));
    await waitFor(() => {
      expect(screen.getByText(/Estimated vs Actual.*by Program/i)).toBeInTheDocument();
    });
  });

  it('switches to trends tab', async () => {
    render(<PlanAnalytics />, { wrapper });
    await waitFor(() => screen.getByText('trends'));
    fireEvent.click(screen.getByText('trends'));
    await waitFor(() => {
      expect(screen.getByText(/Year-over-Year Trends/i)).toBeInTheDocument();
    });
  });

  it('resets filters when Reset clicked', async () => {
    usePlanFilterStore.getState().setPeriodType('financial');
    render(<PlanAnalytics />, { wrapper });
    await waitFor(() => screen.getByText('Reset'));
    fireEvent.click(screen.getByText('Reset'));
    expect(usePlanFilterStore.getState().periodType).toBe('calendar');
  });
});
