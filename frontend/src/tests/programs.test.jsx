import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';
import {
  fiscalYearOf, fiscalQuarterOf, fyLabel, resolveFyRange, fiscalQuarterRange, fyRangeFromDates, DEFAULT_FY_RANGE,
} from '../utils/fiscalYear';

const mockGetTimeline = vi.fn();
vi.mock('../services/planApi', () => ({
  planForecastApi: {
    getFilterOptions: vi.fn(),
    getTimeline: (...args) => mockGetTimeline(...args),
  },
}));

// Lightweight MUI stand-ins — the dropdown widgets aren't the thing under test.
vi.mock('@mui/material', () => ({
  ThemeProvider: ({ children }) => React.createElement(React.Fragment, null, children),
  StyledEngineProvider: ({ children }) => React.createElement(React.Fragment, null, children),
  createTheme: vi.fn(() => ({})),
  TextField: (props) => React.createElement('input', { placeholder: props.placeholder, 'aria-label': props.inputProps?.['aria-label'] }),
  Autocomplete: ({ options, value, onChange, renderInput, getOptionLabel }) => {
    const label = (o) => (getOptionLabel ? getOptionLabel(o) : String(o));
    return React.createElement('div', { 'data-testid': 'autocomplete' }, [
      React.cloneElement(renderInput({ inputProps: {} }), { key: 'input' }),
      React.createElement('select', {
        key: 'sel',
        'data-testid': 'ac-select',
        value: value == null ? '' : String(value),
        onChange: (e) => {
          const picked = options.find(o => String(o) === e.target.value) ?? null;
          onChange?.(null, picked);
        },
      }, [
        React.createElement('option', { key: '__none', value: '' }, '—'),
        ...options.map(o => React.createElement('option', { key: String(o), value: String(o) }, label(o))),
      ]),
    ]);
  },
}));

import Programs from '../pages/Programs/index';
import ProgramEfficiencyPillars, { efficiencyScale } from '../pages/Programs/ProgramEfficiencyPillars';

function wrapper({ children }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );
}

const timelineData = {
  programs: [
    {
      dept: 'TET',
      program_name: 'RIGHT',
      planRecords: [
        { id: 1, baseline: '4.2.0', baseline_start: '2024-04-01T00:00:00', baseline_end: '2024-06-30T00:00:00', estimated_hrs: 10000, actual_hrs: 9000, effort_variance: 1000, savings_hrs: 3000, efficiency_pct: 30,
          categories: { automation_testing: 1500, automation_others: 500, automation_cicd: 1000 } },
        { id: 2, baseline: '5.1.0', baseline_start: '2025-07-01T00:00:00', baseline_end: '2025-09-30T00:00:00', estimated_hrs: 18050, actual_hrs: 16059, effort_variance: 1991, savings_hrs: 7573, efficiency_pct: 42,
          categories: { automation_testing: 3000, ai_copilot: 2000, simulators_tools: 2573 } },
      ],
      forecastRecords: [
        { id: 10, baseline: '5.1.0', baseline_start: '2025-07-01T00:00:00', baseline_end: '2025-09-30T00:00:00', estimated_hrs: 18050, savings_hrs: 8000, efficiency_pct: 44.3,
          categories: { automation_testing: 8000 } },
        { id: 9, baseline: '6.0.0', baseline_start: '2025-10-01T00:00:00', baseline_end: '2026-06-30T00:00:00', estimated_hrs: 12000, savings_hrs: 2000, efficiency_pct: 16.7,
          categories: { sdlc_improvement: 2000 } },
      ],
    },
    {
      dept: 'DTech',
      program_name: 'MOON',
      planRecords: [
        { id: 3, baseline: '1.0.0', baseline_start: '2024-10-01T00:00:00', baseline_end: '2024-12-31T00:00:00', estimated_hrs: 1000, actual_hrs: 1200, effort_variance: -200, savings_hrs: 50, efficiency_pct: 5 },
      ],
      forecastRecords: [],
    },
    {
      dept: 'TET',
      program_name: 'OLD',
      planRecords: [
        { id: 4, baseline: '0.1.0', baseline_start: '2021-04-01T00:00:00', baseline_end: '2021-06-30T00:00:00', estimated_hrs: 1, actual_hrs: 1, effort_variance: 0, savings_hrs: 0, efficiency_pct: 0 },
      ],
      forecastRecords: [],
    },
  ],
};

describe('fiscalYear utils', () => {
  it('uses an April–March fiscal year', () => {
    expect(fiscalYearOf(new Date(2025, 3, 1))).toBe(2025);
    expect(fiscalYearOf(new Date(2026, 2, 31))).toBe(2025);
    expect(fyLabel(2025)).toBe('FY 2025-26');
  });

  it('maps quarters Q1 Apr–Jun … Q4 Jan–Mar', () => {
    expect(fiscalQuarterOf(new Date(2025, 3, 15))).toBe(1);
    expect(fiscalQuarterOf(new Date(2025, 6, 1))).toBe(2);
    expect(fiscalQuarterOf(new Date(2025, 11, 31))).toBe(3);
    expect(fiscalQuarterOf(new Date(2026, 0, 1))).toBe(4);
    expect(fiscalQuarterOf(new Date(2026, 2, 31))).toBe(4);
    const q4 = fiscalQuarterRange(2025, 4);
    expect(q4.start).toEqual(new Date(2026, 0, 1));
    expect(q4.end).toEqual(new Date(2026, 2, 31));
  });

  it('resolves an FY range to 01-Apr → 31-Mar dates and back', () => {
    const { start, end } = resolveFyRange(2024, 2025);
    expect(start).toEqual(new Date(2024, 3, 1));
    expect(end).toEqual(new Date(2026, 2, 31));
    expect(fyRangeFromDates(start, end)).toEqual({ startFy: 2024, endFy: 2025 });
    expect(fyRangeFromDates(new Date(2024, 4, 1), end)).toBeNull();
  });

  it('has a default FY range of FY 2024-25 → FY 2025-26', () => {
    expect(DEFAULT_FY_RANGE).toEqual({ startFy: 2024, endFy: 2025 });
  });
});

describe('efficiencyScale', () => {
  it('adapts the y-axis to the data and leaves headroom above the tallest pillar', () => {
    const low = efficiencyScale(43);
    expect(low.top).toBeGreaterThan(43 * 1.1);
    expect(low.top).toBeLessThanOrEqual(60);
    const high = efficiencyScale(82);
    expect(high.top).toBeGreaterThan(82 * 1.1);
    expect(high.top).toBeLessThanOrEqual(100);
    expect(low.ticks[0]).toBe(0);
    expect(low.ticks).toHaveLength(6);
  });
});

describe('ProgramEfficiencyPillars (Chart-2 quarter layout)', () => {
  const ctx = { dept: 'All Departments', program: 'All Programs', period: 'FY 2024-25 → FY 2025-26' };
  const renderChart = () => render(
    <ProgramEfficiencyPillars
      programs={timelineData.programs}
      windowStart={new Date(2024, 3, 1)}
      windowEnd={new Date(2026, 2, 31, 23, 59, 59)}
      context={ctx}
      isDark={false}
    />
  );
  const barHeight = (g) => parseFloat(g.querySelector('rect').getAttribute('height'));

  it('shows the chart context in the header, not on the y-axis', () => {
    renderChart();
    expect(screen.getByText('Program Efficiency & Opportunity Analysis')).toBeInTheDocument();
    expect(screen.getByText('FY 2024-25 → FY 2025-26')).toBeInTheDocument();
    expect(screen.getByText('Efficiency (%)')).toBeInTheDocument();
  });

  it('shows FY → Year → Quarter → Month only in the timeline header', () => {
    const { container } = renderChart();
    const hdr = within(container.querySelector('[data-testid="timeline-header"]'));
    expect(hdr.getByText('FY 2024-25')).toBeInTheDocument();
    expect(hdr.getByText('FY 2025-26')).toBeInTheDocument();
    ['2024', '2025', '2026'].forEach(y => expect(hdr.getByText(y)).toBeInTheDocument());
    ['Q1', 'Q2', 'Q3', 'Q4'].forEach(q => expect(hdr.getAllByText(q)).toHaveLength(2));
    expect(hdr.getAllByText('Apr')).toHaveLength(2);
    expect(container.querySelectorAll('[data-testid="timeline-header"] title')).toHaveLength(24); // every month
    expect(container.querySelectorAll('[data-testid="fy-boundary"]')).toHaveLength(2); // 1-Apr-2024, 1-Apr-2025
    expect(container.querySelectorAll('[data-testid="pillar-overall"]')).toHaveLength(1);
    expect(screen.queryByText('BL 6.0.0')).not.toBeInTheDocument(); // ends after the window
    expect(screen.queryByText('BL 0.1.0')).not.toBeInTheDocument(); // ends before the window
  });

  it('keeps period text out of the ribbons and colours Forecast ribbons amber', () => {
    const { container } = renderChart();
    const ribbons = [...container.querySelectorAll('[data-testid="quarter-ribbon"]')];
    expect(ribbons).toHaveLength(3); // quarters with baselines: Q1 & Q3 FY24-25, Q2 FY25-26
    ribbons.forEach(r => expect(r.textContent).not.toMatch(/Q\d|FY|20\d\d|Jan|Apr|Jul|Oct/));
    expect(ribbons.map(r => r.textContent)).toEqual(['Efficiency 30.0%', 'Efficiency 5.0%', 'Efficiency 42.0%Forecasted 44.3%']);
    const plan = [...container.querySelectorAll('[data-testid="ribbon-plan"]')];
    const fc = [...container.querySelectorAll('[data-testid="ribbon-forecast"]')];
    expect(plan).toHaveLength(3);
    expect(fc).toHaveLength(1);
    expect(new Set(plan.map(r => r.getAttribute('fill')))).toEqual(new Set(['#1E3246']));
    expect(fc[0].getAttribute('fill')).toBe('#d97706');
  });

  it('shows each efficiency value once (in the ribbon), and only baseline names on the x-axis', () => {
    const { container } = renderChart();
    const timeline = [...container.querySelectorAll('svg[role="img"] text')]
      .filter(t => !t.closest('[data-testid="totals-zone"]') && !t.closest('[data-testid="quarter-ribbon"]'));
    expect(timeline.map(t => t.textContent).filter(t => /^d+(.d)?%$/.test(t) && !/^d+%$/.test(t))).toEqual([]);
    const xLabels = [...container.querySelectorAll('[data-testid="x-label"]')].map(t => t.textContent);
    expect(xLabels.sort()).toEqual(['BL 1.0.0', 'BL 4.2.0', 'BL 5.1.0', 'BL 5.1.0']);
    expect(screen.queryByText('Forecast')).not.toBeInTheDocument();
    expect(screen.queryByText('Total')).not.toBeInTheDocument();
    expect(screen.queryByText('Fcst Total')).not.toBeInTheDocument();
    expect(screen.queryByText('RIGHT')).not.toBeInTheDocument(); // no program-name sub-label
  });

  it('gives long baseline names enough room so x-axis labels do not overlap', () => {
    const rec = (id, baseline) => ({ id, baseline, baseline_start: '2025-04-01T00:00:00', baseline_end: '2025-06-30T00:00:00',
      estimated_hrs: 100, savings_hrs: 10, efficiency_pct: 10, categories: { automation_testing: 10 } });
    const { container } = render(
      <ProgramEfficiencyPillars
        programs={[{ dept: 'X', program_name: 'P', planRecords: [], forecastRecords: [rec(1, 'Health Monitor 2.10'), rec(2, 'Platform 3.3'), rec(3, 'Alarm service 4.1')] }]}
        windowStart={new Date(2025, 3, 1)} windowEnd={new Date(2026, 2, 31, 23, 59, 59)} context={{ dept: 'X', program: 'P', period: 'p' }} isDark={false}
      />
    );
    const labels = [...container.querySelectorAll('[data-testid="x-label"]')];
    expect(labels.map(l => l.textContent)).toEqual(['BL Health Monitor 2.10', 'BL Platform 3.3', 'BL Alarm service 4.1']);
    const xs = labels.map(l => parseFloat(l.getAttribute('x')));
    for (let i = 1; i < labels.length; i++) {
      const halfPrev = labels[i - 1].textContent.length * 6.2 / 2;
      const halfCur = labels[i].textContent.length * 6.2 / 2;
      expect(xs[i] - xs[i - 1]).toBeGreaterThanOrEqual(halfPrev + halfCur);
    }
  });

  it('places each baseline under the month of its End Date', () => {
    const { container } = renderChart();
    const monthX = (label, nth) => {
      const t = [...container.querySelectorAll('[data-testid="timeline-header"] text')].filter(e => e.textContent.endsWith(label))[nth];
      return parseFloat(t.getAttribute('x')) - 7;
    };
    const pillarX = (bl) => parseFloat(container.querySelector(`[data-testid="pillar-plan"][data-baseline="${bl}"] rect`).getAttribute('x'));
    expect(pillarX('4.2.0')).toBeGreaterThan(monthX('Jun', 0));
    expect(pillarX('4.2.0')).toBeLessThan(monthX('Jul', 0));
    expect(pillarX('5.1.0')).toBeGreaterThan(monthX('Sep', 1));
    expect(pillarX('5.1.0')).toBeLessThan(monthX('Oct', 1));
  });

  it('sizes every column by Efficiency (%)', () => {
    const { container } = renderChart();
    const plan = (bl) => container.querySelector(`[data-testid="pillar-plan"][data-baseline="${bl}"]`);
    expect(container.querySelectorAll('[data-testid="pillar-plan"]')).toHaveLength(3);
    expect(container.querySelectorAll('[data-testid="pillar-forecast"]')).toHaveLength(1);
    expect(barHeight(plan('5.1.0')) / barHeight(plan('4.2.0'))).toBeCloseTo(42 / 30, 1);
    expect(barHeight(plan('4.2.0'))).toBeGreaterThan(barHeight(plan('1.0.0')));
  });

  it('stacks quarter totals by opportunity category with share labels', () => {
    const { container } = renderChart();
    const q1 = container.querySelector('[data-testid="total-plan"][data-scope="Q1 FY 2024-25"]');
    const segs = within(q1).getAllByTestId('pillar-segment');
    expect(segs.map(s => s.getAttribute('data-category'))).toEqual(['automation', 'cicd_devx']);
    const total = segs.reduce((s, r) => s + parseFloat(r.getAttribute('height')), 0);
    expect(total).toBeCloseTo(barHeight(container.querySelector('[data-testid="pillar-plan"][data-baseline="4.2.0"]')), 0);
    expect(within(q1).getByText('67%')).toBeInTheDocument();
    expect(within(q1).getByText('33%')).toBeInTheDocument();
  });

  it('uses a hatched treatment for Forecasting', () => {
    const { container } = renderChart();
    const fcTotal = container.querySelector('[data-testid="total-forecast"][data-scope="Q2 FY 2025-26"]');
    expect(within(fcTotal).getByTestId('pillar-segment').getAttribute('fill')).toMatch(/^url\(#q-hatch-/);
    const fcBaseline = container.querySelector('[data-testid="pillar-forecast"]');
    expect(fcBaseline.querySelector('rect').getAttribute('fill')).toBe('url(#q-hatch-grey)');
  });

  it('shows baseline and category tooltips on hover', () => {
    const { container } = renderChart();
    fireEvent.mouseMove(container.querySelector('[data-testid="pillar-plan"][data-baseline="4.2.0"]'), { clientX: 100, clientY: 200 });
    let tip = screen.getByRole('tooltip');
    expect(within(tip).getByText('10,000 Hrs')).toBeInTheDocument();
    expect(within(tip).getByText('9,000 Hrs')).toBeInTheDocument();
    expect(within(tip).getByText('30.0%')).toBeInTheDocument();

    const q1 = container.querySelector('[data-testid="total-plan"][data-scope="Q1 FY 2024-25"]');
    fireEvent.mouseMove(within(q1).getAllByTestId('pillar-segment')[0], { clientX: 100, clientY: 200 });
    tip = screen.getByRole('tooltip');
    expect(within(tip).getByText('Automation')).toBeInTheDocument();
    expect(within(tip).getByText('2,000 Hrs')).toBeInTheDocument();
    expect(within(tip).getByText('66.7%')).toBeInTheDocument();
  });

  it('toggles a category across all totals from the legend', () => {
    const { container } = renderChart();
    const count = () => container.querySelectorAll('[data-category="automation"]').length;
    const before = count();
    expect(before).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'Automation' }));
    expect(count()).toBe(0);
    fireEvent.click(screen.getByRole('button', { name: 'Automation' }));
    expect(count()).toBe(before);
  });
});

describe('Programs page', () => {
  it('defaults to FY 2024-25 → FY 2025-26 and filters by department', async () => {
    mockGetTimeline.mockResolvedValue({ data: timelineData });
    render(<Programs />, { wrapper });

    await waitFor(() => expect(screen.getAllByText('BL 4.2.0')).toHaveLength(2));
    expect(screen.getAllByText('FY 2024-25 → FY 2025-26 (01-Apr-2024 → 31-Mar-2026)')).toHaveLength(2);
    expect(screen.getAllByText('BL 1.0.0')).toHaveLength(2);

    const [deptSelect, programSelect] = screen.getAllByTestId('ac-select');
    fireEvent.change(deptSelect, { target: { value: 'DTech' } });
    await waitFor(() => expect(screen.queryByText('BL 4.2.0')).not.toBeInTheDocument());
    expect(screen.getAllByText('BL 1.0.0')).toHaveLength(2);
    expect(screen.getAllByText('DTech', { selector: 'strong' })).toHaveLength(2);
    expect(within(programSelect).queryByText('RIGHT')).not.toBeInTheDocument();
    expect(within(programSelect).getByText('MOON')).toBeInTheDocument();
  });

  it('resolves an FY selection to April–March dates', async () => {
    mockGetTimeline.mockResolvedValue({ data: timelineData });
    render(<Programs />, { wrapper });
    await waitFor(() => expect(screen.getAllByText('BL 5.1.0').length).toBeGreaterThan(0));

    const endFy = screen.getAllByTestId('ac-select')[3];
    fireEvent.change(endFy, { target: { value: '2024' } });
    await waitFor(() => expect(screen.getAllByText('FY 2024-25 → FY 2024-25 (01-Apr-2024 → 31-Mar-2025)')).toHaveLength(2));
    expect(screen.queryByText('BL 5.1.0')).not.toBeInTheDocument(); // FY 2025-26 baseline drops out
  });
});
