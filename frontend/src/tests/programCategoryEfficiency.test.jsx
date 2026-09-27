import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import ProgramCategoryEfficiencyChart from '../pages/ProgramForecast/ProgramCategoryEfficiencyChart';

// Dates relative to today so the 6M / 1Y zoom windows are deterministic.
const iso = monthsFromNow => {
  const d = new Date();
  d.setMonth(d.getMonth() + monthsFromNow);
  return d.toISOString().slice(0, 10);
};

const PROGRAMS = [
  {
    dept: 'TET', program_name: 'RIGHT',
    planRecords: [
      {
        id: 1, baseline: '4.2.0', baseline_start: iso(-30), baseline_end: iso(-27),
        estimated_hrs: '1000', actual_hrs: '900', effort_variance: '100', savings_hrs: '300', efficiency_pct: 30,
        categories: { automation_testing: 100, automation_others: 50, automation_cicd: 100, ai_copilot: 50 },
      },
      {
        id: 2, baseline: '5.0.0', baseline_start: iso(-3), baseline_end: iso(-1),
        estimated_hrs: '1000', actual_hrs: '1100', effort_variance: '-100', savings_hrs: '400', efficiency_pct: 40,
        categories: { automation_testing: 200, reuse_library: 100, simulators_tools: 100 },
      },
    ],
    forecastRecords: [
      {
        id: 3, baseline: '5.6.0', baseline_start: iso(1), baseline_end: iso(4),
        estimated_hrs: '500', savings_hrs: '100', efficiency_pct: 20,
        categories: { automation_cicd: 60, sdlc_improvement: 40 },
      },
    ],
  },
  {
    dept: 'Mainline', program_name: 'CIXL',
    planRecords: [
      {
        id: 4, baseline: '3.1', baseline_start: iso(-2), baseline_end: iso(2),
        estimated_hrs: '25', actual_hrs: '20', effort_variance: '5', savings_hrs: '165', efficiency_pct: 660,
        categories: { ai_copilot: 165 },
      },
      // No dates -> skipped, same as the other forecast-page charts.
      { id: 5, baseline: 'undated', baseline_start: null, baseline_end: null, efficiency_pct: 10, categories: { ai_copilot: 5 } },
    ],
    forecastRecords: [],
  },
];

const renderChart = (props = {}) =>
  render(<ProgramCategoryEfficiencyChart programs={PROGRAMS} startDate={null} endDate={null} isDark={false} {...props} />);

describe('ProgramCategoryEfficiencyChart', () => {
  it('renders one column per dated baseline, grouped by program', () => {
    renderChart();
    expect(screen.getAllByTestId(/^column-/)).toHaveLength(4);
    expect(screen.getByTestId('program-RIGHT')).toBeInTheDocument();
    expect(screen.getByTestId('program-CIXL')).toBeInTheDocument();
    expect(screen.queryByText('undated')).not.toBeInTheDocument();
  });

  it('stacks consolidated categories, hatching forecast columns', () => {
    renderChart();
    // automation_testing + automation_others -> Automation
    expect(screen.getByTestId('seg-plan-1-automation')).toHaveAttribute('fill', '#eda100');
    expect(screen.getByTestId('seg-forecast-3-cicd_devx')).toHaveAttribute('fill', 'url(#fc-hatch-cicd_devx)');
    // sdlc_improvement -> Reference / SDLC group
    expect(screen.getByTestId('seg-forecast-3-ref_lib_sdlc')).toBeInTheDocument();
  });

  it('shows category, program, baseline, hours and contribution on segment hover', () => {
    renderChart();
    fireEvent.mouseMove(screen.getByTestId('seg-plan-1-automation'), { clientX: 100, clientY: 100 });
    const tip = screen.getByTestId('chart-tooltip');
    expect(tip).toHaveTextContent('Automation');
    expect(tip).toHaveTextContent('RIGHT | TET');
    expect(tip).toHaveTextContent('4.2.0');
    expect(tip).toHaveTextContent('150 Hrs');
    expect(tip).toHaveTextContent('50.0%'); // 150 of 300
  });

  it('hides a category across all baselines from the legend', () => {
    renderChart();
    fireEvent.click(screen.getByTestId('legend-automation'));
    expect(screen.queryByTestId('seg-plan-1-automation')).not.toBeInTheDocument();
    expect(screen.queryByTestId('seg-plan-2-automation')).not.toBeInTheDocument();
    expect(screen.getByTestId('legend-automation')).toHaveAttribute('aria-pressed', 'false');
  });

  it('opens a detail panel for the selected baseline', () => {
    renderChart();
    fireEvent.click(screen.getByTestId('column-plan-2'));
    const panel = screen.getByTestId('baseline-detail');
    expect(panel).toHaveTextContent('5.0.0');
    expect(panel).toHaveTextContent('Estimated Hrs1,000 Hrs');
    expect(panel).toHaveTextContent('Actual Hrs1,100 Hrs');
    expect(panel).toHaveTextContent('Variance-100 Hrs');
    expect(panel).toHaveTextContent('40.0%');
    expect(panel).toHaveTextContent('Total400 Hrs');

    fireEvent.click(screen.getByTestId('column-forecast-3'));
    const fc = screen.getByTestId('baseline-detail');
    expect(within(fc).getByText('Forecasting')).toBeInTheDocument();
    expect(fc).toHaveTextContent('Actual Hrs—');
  });

  it('focuses a program and de-emphasises the others', () => {
    renderChart();
    fireEvent.click(screen.getByTestId('program-RIGHT'));
    expect(screen.getByTestId('column-plan-4').parentElement).toHaveAttribute('opacity', '0.18');
    expect(screen.getByTestId('column-plan-1').parentElement).toHaveAttribute('opacity', '1');
  });

  it('applies the Time Interval filter by overlap', () => {
    const start = new Date(); start.setMonth(start.getMonth() - 4);
    renderChart({ startDate: start });
    expect(screen.queryByTestId('column-plan-1')).not.toBeInTheDocument();
    expect(screen.getByTestId('column-plan-2')).toBeInTheDocument();
  });

  it('zooms to baselines around today and resets', () => {
    renderChart();
    fireEvent.click(screen.getByRole('button', { name: '6M' }));
    expect(screen.queryByTestId('column-plan-1')).not.toBeInTheDocument();
    expect(screen.getAllByTestId(/^column-/)).toHaveLength(3);
    fireEvent.click(screen.getByRole('button', { name: /Reset/ }));
    expect(screen.getAllByTestId(/^column-/)).toHaveLength(4);
  });

  it('pins efficiency above 100% to the top of the axis', () => {
    renderChart();
    expect(screen.getByTestId('point-plan-4')).toHaveAttribute('data-clipped', 'true');
    expect(screen.getByTestId('clipped-note')).toHaveTextContent('1 efficiency value');
  });

  it('shows an empty state when nothing matches', () => {
    renderChart({ programs: [] });
    expect(screen.getByText(/No baselines with opportunity-category or efficiency data/)).toBeInTheDocument();
  });
});
