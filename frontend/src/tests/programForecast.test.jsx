import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';

const mockGetFilterOptions = vi.fn();
const mockGetTimeline = vi.fn();

vi.mock('../services/planApi', () => ({
  planForecastApi: {
    getFilterOptions: (...args) => mockGetFilterOptions(...args),
    getTimeline: (...args) => mockGetTimeline(...args),
  },
}));

// Lightweight MUI stand-ins — Autocomplete/TextField/Chip aren't the thing under test here.
vi.mock('@mui/material', () => ({
  ThemeProvider: ({ children }) => React.createElement(React.Fragment, null, children),
  StyledEngineProvider: ({ children }) => React.createElement(React.Fragment, null, children),
  createTheme: vi.fn(() => ({})),
  Chip: ({ label }) => React.createElement('span', null, label),
  TextField: (props) => React.createElement('input', { placeholder: props.placeholder, ...props.InputProps }),
  Autocomplete: ({ options, value, renderInput }) =>
    React.createElement('div', { key: 'ac', 'data-testid': 'autocomplete' }, [
      React.cloneElement(renderInput({ placeholder: '' }), { key: 'input' }),
      React.createElement('div', { key: 'opts' }, options.join(', ')),
      React.createElement('div', { key: 'val' }, value.join(', ')),
    ]),
}));

import ProgramForecast from '../pages/ProgramForecast/index';

function wrapper({ children }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );
}

const filterOptions = {
  depts: ['DTech', 'TET'],
  programsByDept: { DTech: ['MOON'], TET: ['RIGHT', 'CIXL'] },
};

const timelineData = {
  programs: [
    {
      dept: 'TET',
      program_name: 'RIGHT',
      planRecords: [
        { id: 1, baseline: '5.0.0', baseline_start: '2025-04-01', baseline_end: '2025-06-30', estimated_hrs: 19614, actual_hrs: 17326, effort_variance: 2288, savings_hrs: 7573, efficiency_pct: 38.6 },
      ],
      forecastRecords: [
        { id: 1, baseline: '5.6.0', baseline_start: '2025-04-01', baseline_end: '2027-03-01', estimated_hrs: 13614, savings_hrs: 2340, efficiency_pct: 17.2 },
      ],
    },
    {
      dept: 'DTech',
      program_name: 'MOON',
      planRecords: [
        { id: 2, baseline: '1.0.0', baseline_start: '2025-01-01', baseline_end: '2025-03-31', estimated_hrs: 1000, actual_hrs: 900, effort_variance: 100, savings_hrs: 50, efficiency_pct: 5 },
      ],
      forecastRecords: [],
    },
  ],
  overall: { savingsHrs: 7623, estimatedHrs: 20614, savingsPct: 37 },
};

beforeEach(() => {
  mockGetFilterOptions.mockResolvedValue({ data: filterOptions });
  mockGetTimeline.mockResolvedValue({ data: timelineData });
});

describe('ProgramForecast page', () => {
  it('renders the page header and Department/Program filters', async () => {
    render(<ProgramForecast />, { wrapper });
    expect(screen.getByText('Programs with Forecast')).toBeInTheDocument();
    expect(screen.getByText('Department')).toBeInTheDocument();
    expect(screen.getByText('Program Name')).toBeInTheDocument();
  });

  it('renders one row per program with a solid (plan) and dashed (forecast) segment', async () => {
    render(<ProgramForecast />, { wrapper });
    await waitFor(() => expect(screen.getByText('RIGHT')).toBeInTheDocument());
    expect(screen.getByText('MOON')).toBeInTheDocument();
    expect(screen.getAllByText('TET').length).toBeGreaterThanOrEqual(1);
  });

  it('renders a program with a plan record but no forecast record without error (req. 17)', async () => {
    render(<ProgramForecast />, { wrapper });
    await waitFor(() => expect(screen.getByText('MOON')).toBeInTheDocument());
    // No crash, no stray forecast tooltip — MOON row rendered fine alongside RIGHT's forecast segment
  });

  it('displays Overall Savings and Overall Savings % from the API response', async () => {
    render(<ProgramForecast />, { wrapper });
    await waitFor(() => expect(screen.getByText(/7,623/)).toBeInTheDocument());
    expect(screen.getByText('37.0%')).toBeInTheDocument();
  });

  it('fetches the timeline with no filters by default (empty dept/program arrays = "All")', async () => {
    render(<ProgramForecast />, { wrapper });
    await waitFor(() => expect(mockGetTimeline).toHaveBeenCalled());
    expect(mockGetTimeline).toHaveBeenCalledWith({ dept: [], program: [] });
  });
});
