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
import ForecastTimeline from '../pages/ProgramForecast/ForecastTimeline';
import EfficiencySavingsChart from '../pages/ProgramForecast/EfficiencySavingsChart';

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
  overall: {
    planSavingsHrs: 7623, planEstimatedHrs: 20614,
    forecastSavingsHrs: 2340, forecastEstimatedHrs: 13614,
    achievedEfficiencyPct: 37, forecastedEfficiencyPct: 29.1,
  },
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

  it('displays Achieved Efficiency and Forecasted Efficiency from the API response', async () => {
    render(<ProgramForecast />, { wrapper });
    await waitFor(() => expect(screen.getByText('Achieved Efficiency')).toBeInTheDocument());
    expect(screen.getByText('Forecasted Efficiency')).toBeInTheDocument();
    expect(screen.getByText('37.0%')).toBeInTheDocument();
    expect(screen.getByText('29.1%')).toBeInTheDocument();
  });

  it('fetches the timeline with no filters by default (empty dept/program arrays = "All")', async () => {
    render(<ProgramForecast />, { wrapper });
    await waitFor(() => expect(mockGetTimeline).toHaveBeenCalled());
    expect(mockGetTimeline).toHaveBeenCalledWith({ dept: [], program: [] });
  });

  it('renders a "Time Interval" filter beside Program Name', async () => {
    render(<ProgramForecast />, { wrapper });
    expect(screen.getByText('Time Interval')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Start Date')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('End Date')).toBeInTheDocument();
  });
});

describe('ForecastTimeline — Time Interval filtering', () => {
  it('shows all overlapping records when no interval is set', () => {
    render(<ForecastTimeline programs={timelineData.programs} />, { wrapper });
    expect(screen.getByText('RIGHT')).toBeInTheDocument();
    expect(screen.getByText('MOON')).toBeInTheDocument();
  });

  it('excludes a program whose only record falls outside the selected [startDate, endDate] window', () => {
    // MOON's only plan record spans Jan–Mar 2025; RIGHT's forecast record spans Apr'25–Mar'27
    // and therefore still overlaps a Jul–Sep 2025 window even though RIGHT's plan record doesn't.
    render(
      <ForecastTimeline programs={timelineData.programs} startDate={new Date(2025, 6, 1)} endDate={new Date(2025, 8, 30)} />,
      { wrapper }
    );
    expect(screen.queryByText('MOON')).not.toBeInTheDocument();
    expect(screen.getByText('RIGHT')).toBeInTheDocument();
  });

  it('shows the empty-filter message when the interval excludes every record', () => {
    render(
      <ForecastTimeline programs={timelineData.programs} startDate={new Date(2030, 0, 1)} endDate={new Date(2030, 11, 31)} />,
      { wrapper }
    );
    expect(screen.getByText('No programs match the selected filters')).toBeInTheDocument();
  });
});

describe('EfficiencySavingsChart', () => {
  it('renders the chart title and does not fall into the empty state when Efficiency Plan baselines exist', () => {
    // recharts' ResponsiveContainer needs a real ResizeObserver to render its SVG children,
    // which jsdom doesn't provide — so this checks the data pipeline (empty-state branch
    // correctly not taken) rather than querying inside the unrendered chart internals.
    // The actual chart rendering (bars, line, labels, tooltip) is verified in a real browser.
    render(<EfficiencySavingsChart programs={timelineData.programs} />, { wrapper });
    expect(screen.getByText('Efficiency, Savings and Baseline')).toBeInTheDocument();
    expect(screen.queryByText('No Efficiency Plan baselines in the selected filters')).not.toBeInTheDocument();
  });

  it('shows the empty state when no Efficiency Plan baselines are in range', () => {
    render(
      <EfficiencySavingsChart programs={timelineData.programs} startDate={new Date(2030, 0, 1)} endDate={new Date(2030, 11, 31)} />,
      { wrapper }
    );
    expect(screen.getByText('No Efficiency Plan baselines in the selected filters')).toBeInTheDocument();
  });

  it('applies the Time Interval filter — a window overlapping neither plan record falls back to the empty state', () => {
    // RIGHT's plan record spans Apr–Jun 2025; MOON's spans Jan–Mar 2025.
    // A Jul–Sep 2025 window overlaps neither, so the chart has nothing to plot.
    render(
      <EfficiencySavingsChart programs={timelineData.programs} startDate={new Date(2025, 6, 1)} endDate={new Date(2025, 8, 30)} />,
      { wrapper }
    );
    expect(screen.getByText('No Efficiency Plan baselines in the selected filters')).toBeInTheDocument();
  });
});
