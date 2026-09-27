import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import PlanOpportunityDonutEnhanced from '../pages/PlanDashboard/charts/PlanOpportunityDonutEnhanced';

const DATA = [
  { key: 'automation_testing', value: 30000 },
  { key: 'automation_others', value: 18742 },
  { key: 'automation_cicd', value: 24528 },
  { key: 'ai_copilot', value: 10000 },
  { key: 'automation_reviews', value: 4801 },
  { key: 'simulators_tools', value: 5733 },
  { key: 'reuse_library', value: 10283 },
];

describe('PlanOpportunityDonutEnhanced', () => {
  it('shows the total effort saved in the center and no legend by default', () => {
    render(<PlanOpportunityDonutEnhanced data={DATA} />);
    expect(screen.getByText('Total Effort Saved')).toBeInTheDocument();
    expect(screen.getByText('1,04,087')).toBeInTheDocument();
    expect(screen.queryByTestId('label-automation')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Compact view' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('shows a tooltip with name, hours and percentage on segment hover', () => {
    render(<PlanOpportunityDonutEnhanced data={DATA} />);
    fireEvent.mouseEnter(screen.getByTestId('segment-cicd_devx'));
    const tip = screen.getByTestId('donut-tooltip');
    expect(tip).toHaveTextContent('CI/CD / DevX');
    expect(tip).toHaveTextContent('24,528 Hrs');
    expect(tip).toHaveTextContent('23.6% of total');
    fireEvent.mouseLeave(screen.getByTestId('segment-cicd_devx'));
    expect(screen.queryByTestId('donut-tooltip')).not.toBeInTheDocument();
  });

  it('keeps a clicked segment selected', () => {
    render(<PlanOpportunityDonutEnhanced data={DATA} />);
    const seg = screen.getByTestId('segment-automation');
    fireEvent.click(seg);
    expect(seg).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(seg);
    expect(seg).toHaveAttribute('aria-pressed', 'false');
  });

  it('shows connector labels for every category when expanded and removes them on collapse', async () => {
    render(<PlanOpportunityDonutEnhanced data={DATA} />);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Expanded view' })); });
    // Tween runs on rAF; wait for it to finish.
    await act(() => new Promise(r => setTimeout(r, 700)));
    for (const key of ['automation', 'cicd_devx', 'ai_assisted', 'ref_lib_sdlc', 'simulator_tools']) {
      expect(screen.getByTestId(`label-${key}`)).toBeInTheDocument();
    }
    expect(screen.getByTestId('label-automation')).toHaveTextContent('46.8%');
    expect(screen.getByTestId('label-automation')).toHaveTextContent('48,742 Hrs');

    fireEvent.mouseEnter(screen.getByTestId('label-cicd_devx'));
    expect(screen.getByTestId('segment-automation').parentElement.style.opacity).toBe('0.35');
    expect(screen.getByTestId('segment-cicd_devx').parentElement.style.opacity).toBe('1');

    // Balanced columns: the two largest (first clockwise) on the right, the rest on the left.
    // Right-column labels are anchored by their left edge, left-column by their right edge.
    const style = key => screen.getByTestId(`label-${key}`).style;
    for (const key of ['automation', 'cicd_devx']) expect(parseFloat(style(key).left)).toBeGreaterThan(400);
    for (const key of ['ai_assisted', 'ref_lib_sdlc', 'simulator_tools']) expect(parseFloat(style(key).right)).toBeGreaterThan(400);

    const strip = screen.getByTestId('summary-strip');
    expect(strip).toHaveTextContent('Total');
    expect(strip).toHaveTextContent('1,04,087 Hrs');
    expect(screen.getByTestId('summary-simulator_tools')).toHaveTextContent('5.5%');

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Compact view' })); });
    await act(() => new Promise(r => setTimeout(r, 700)));
    expect(screen.queryByTestId('label-automation')).not.toBeInTheDocument();
    expect(screen.queryByTestId('summary-strip')).not.toBeInTheDocument();
  });

  it('renders an empty state without data', () => {
    render(<PlanOpportunityDonutEnhanced data={[]} />);
    expect(screen.getByText('No opportunity-category data available')).toBeInTheDocument();
  });
});
