import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import React from 'react';
import BaselineEfficiencyWaterfall, { buildWaterfall } from '../pages/Programs/BaselineEfficiencyWaterfall';

const rec = (id, baseline, end, eff, extra = {}) => ({
  id, baseline, baseline_start: '2024-01-01T00:00:00', baseline_end: `${end}T00:00:00`,
  estimated_hrs: 1000, actual_hrs: 900, savings_hrs: eff * 10, efficiency_pct: eff, ...extra,
});

const programs = [
  {
    dept: 'TET', program_name: 'RIGHT',
    planRecords: [
      rec(1, '4.2', '2024-06-30', 10.3),
      rec(2, '4.3', '2024-09-30', 13.2),
      rec(3, '4.5', '2025-03-31', 43.8, { estimated_hrs: 17280, actual_hrs: 16444, savings_hrs: 7563 }),
      rec(4, '5.0', '2025-06-30', 38.6),
    ],
    forecastRecords: [rec(9, '5.1', '2025-12-31', 41.0), rec(10, '9.9', '2027-12-31', 50)],
  },
  { dept: 'DTech', program_name: 'MOON', planRecords: [rec(5, '1.0', '2024-12-31', 5)], forecastRecords: [] },
];

const START = new Date(2024, 3, 1);
const END = new Date(2026, 2, 31, 23, 59, 59);
const ctx = { dept: 'All Departments', program: 'All Programs', period: 'FY 2024-25 → FY 2025-26' };
const renderChart = (p = programs) => render(
  <BaselineEfficiencyWaterfall programs={p} windowStart={START} windowEnd={END} context={ctx} isDark={false} />
);

describe('buildWaterfall', () => {
  it('chains Plan baselines by End Date, then Forecast, with deltas from the previous step', () => {
    const [right] = buildWaterfall(programs, START, END);
    expect(right.steps.map(s => [s.baseline, s.kind, s.anchor])).toEqual([
      ['4.2', 'plan', true], ['4.3', 'plan', false], ['4.5', 'plan', false], ['5.0', 'plan', false], ['5.1', 'forecast', false],
    ]);
    expect(right.steps[0].delta).toBeNull();
    expect(right.steps[1].delta).toBeCloseTo(2.9);
    expect(right.steps[3].delta).toBeCloseTo(-5.2);
    expect(right.steps[4].prevBaseline).toBe('5.0');
  });
});

describe('BaselineEfficiencyWaterfall', () => {
  it('draws a starting bar, then up/down steps, with the current efficiency on each', () => {
    const { container } = renderChart([programs[0]]);
    const steps = [...container.querySelectorAll('[data-testid^="waterfall-step-"]')];
    expect(steps.map(s => s.getAttribute('data-direction'))).toEqual(['start', 'up', 'up', 'down', 'up']);
    expect(steps.map(s => within(s).getByTestId('waterfall-value').textContent)).toEqual(['10.3%', '13.2%', '43.8%', '38.6%', '41.0%']);
    expect(within(steps[3]).getByText('−5.2%')).toBeInTheDocument();
    expect(within(steps[2]).getByText('+30.6%')).toBeInTheDocument();
    expect(screen.queryByText('BL 9.9')).not.toBeInTheDocument(); // ends outside the window
  });

  it('sizes the floating bar by the change and the starting bar from 0', () => {
    const { container } = renderChart([programs[0]]);
    const bar = (bl) => container.querySelector(`[data-baseline="${bl}"] [data-testid="waterfall-bar"]`);
    const h = (bl) => parseFloat(bar(bl).getAttribute('height'));
    expect(h('4.5') / h('4.2')).toBeCloseTo(30.6 / 10.3, 1);
    // the 4.5 bar starts where 4.3 ended
    const y43Top = parseFloat(bar('4.3').getAttribute('y'));
    const y45Bottom = parseFloat(bar('4.5').getAttribute('y')) + h('4.5');
    expect(y45Bottom).toBeCloseTo(y43Top, 5);
  });

  it('connects consecutive baselines and hatches Forecasted steps', () => {
    const { container } = renderChart([programs[0]]);
    expect(container.querySelectorAll('[data-testid="waterfall-connector"]')).toHaveLength(4);
    const fc = container.querySelector('[data-testid="waterfall-step-forecast"] [data-testid="waterfall-bar"]');
    expect(fc.getAttribute('fill')).toMatch(/^url\(#wf-hatch-/);
    expect(fc.getAttribute('stroke-dasharray')).toBe('4 3');
    const plan = container.querySelector('[data-testid="waterfall-step-plan"] [data-testid="waterfall-bar"]');
    expect(plan.getAttribute('fill')).toMatch(/^#/);
  });

  it('uses distinct colours for increases and decreases', () => {
    const { container } = renderChart([programs[0]]);
    const fill = (bl) => container.querySelector(`[data-baseline="${bl}"] [data-testid="waterfall-bar"]`).getAttribute('fill');
    expect(fill('4.3')).not.toBe(fill('5.0'));
    expect(fill('4.3')).toBe(fill('4.5'));
  });

  it('shows previous / current / change in the tooltip (N/A for the first baseline)', () => {
    const { container } = renderChart([programs[0]]);
    fireEvent.mouseMove(container.querySelector('[data-baseline="4.2"]'), { clientX: 50, clientY: 300 });
    let tip = screen.getByRole('tooltip');
    expect(within(tip).getAllByText('N/A')).toHaveLength(2);
    expect(within(tip).getByText('10.3%')).toBeInTheDocument();

    fireEvent.mouseMove(container.querySelector('[data-baseline="4.5"]'), { clientX: 50, clientY: 300 });
    tip = screen.getByRole('tooltip');
    expect(within(tip).getByText('RIGHT')).toBeInTheDocument();
    expect(within(tip).getByText('13.2% (BL 4.3)')).toBeInTheDocument();
    expect(within(tip).getByText('43.8%')).toBeInTheDocument();
    expect(within(tip).getByText('+30.6%')).toBeInTheDocument();
    expect(within(tip).getByText('17,280')).toBeInTheDocument();
    expect(within(tip).getByText('16,444')).toBeInTheDocument();
    expect(within(tip).getByText('7,563 Hrs')).toBeInTheDocument();
  });

  it('keeps each program as its own waterfall and summarises first → latest', () => {
    const { container } = renderChart();
    expect(container.querySelectorAll('[data-testid="waterfall-group"]')).toHaveLength(2);
    const summary = screen.getByTestId('waterfall-summary');
    expect(summary.textContent).toContain('RIGHT: 10.3% → 38.6% (+28.3%)');
    expect(summary.textContent).toContain('Forecasted 41.0%');
    expect(summary.textContent).toContain('MOON: 5.0% → 5.0% (±0.0%)');
  });
});
