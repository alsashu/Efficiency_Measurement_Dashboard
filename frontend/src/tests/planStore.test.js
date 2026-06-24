import { describe, it, expect, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { usePlanFilterStore } from '../store/useStore';

describe('usePlanFilterStore', () => {
  beforeEach(() => {
    act(() => {
      usePlanFilterStore.getState().reset();
    });
  });

  it('has correct initial state', () => {
    const state = usePlanFilterStore.getState();
    expect(state.periodType).toBe('calendar');
    expect(state.periodYear).toBeNull(); // null = All Years (no date filter)
    expect(state.selectedUploadId).toBeNull();
  });

  it('setPeriodType switches to financial', () => {
    act(() => { usePlanFilterStore.getState().setPeriodType('financial'); });
    expect(usePlanFilterStore.getState().periodType).toBe('financial');
  });

  it('setPeriodType switches back to calendar', () => {
    act(() => {
      usePlanFilterStore.getState().setPeriodType('financial');
      usePlanFilterStore.getState().setPeriodType('calendar');
    });
    expect(usePlanFilterStore.getState().periodType).toBe('calendar');
  });

  it('setPeriodYear updates year', () => {
    act(() => { usePlanFilterStore.getState().setPeriodYear(2027); });
    expect(usePlanFilterStore.getState().periodYear).toBe(2027);
  });

  it('setUploadId stores upload ID', () => {
    act(() => { usePlanFilterStore.getState().setUploadId('42'); });
    expect(usePlanFilterStore.getState().selectedUploadId).toBe('42');
  });

  it('reset restores default state', () => {
    act(() => {
      usePlanFilterStore.getState().setPeriodType('financial');
      usePlanFilterStore.getState().setPeriodYear(2020);
      usePlanFilterStore.getState().setUploadId('99');
      usePlanFilterStore.getState().reset();
    });
    const state = usePlanFilterStore.getState();
    expect(state.periodType).toBe('calendar');
    expect(state.periodYear).toBeNull();
    expect(state.selectedUploadId).toBeNull();
  });

  it('persists state through hook re-renders', () => {
    const { result } = renderHook(() => usePlanFilterStore());
    act(() => { result.current.setPeriodType('financial'); });
    expect(result.current.periodType).toBe('financial');
    act(() => { result.current.setPeriodYear(2026); });
    expect(result.current.periodYear).toBe(2026);
  });
});

describe('Financial Year label generation', () => {
  it('correctly labels FY 2025 as FY 2025-26', () => {
    const year = 2025;
    const label = `FY ${year}-${String(year + 1).slice(-2)}`;
    expect(label).toBe('FY 2025-26');
  });

  it('correctly labels FY 2026 as FY 2026-27', () => {
    const year = 2026;
    const label = `FY ${year}-${String(year + 1).slice(-2)}`;
    expect(label).toBe('FY 2026-27');
  });

  it('correctly labels FY 2099 as FY 2099-00', () => {
    const year = 2099;
    const label = `FY ${year}-${String(year + 1).slice(-2)}`;
    expect(label).toBe('FY 2099-00');
  });
});

describe('Period date range calculation', () => {
  function getPeriodRange(periodType, year) {
    if (periodType === 'financial') {
      return { start: `${year}-04-01`, end: `${year + 1}-03-31` };
    }
    return { start: `${year}-01-01`, end: `${year}-12-31` };
  }

  it('CY 2025 runs from 2025-01-01 to 2025-12-31', () => {
    const range = getPeriodRange('calendar', 2025);
    expect(range.start).toBe('2025-01-01');
    expect(range.end).toBe('2025-12-31');
  });

  it('FY 2025 runs from 2025-04-01 to 2026-03-31', () => {
    const range = getPeriodRange('financial', 2025);
    expect(range.start).toBe('2025-04-01');
    expect(range.end).toBe('2026-03-31');
  });

  it('FY 2024 runs from 2024-04-01 to 2025-03-31', () => {
    const range = getPeriodRange('financial', 2024);
    expect(range.start).toBe('2024-04-01');
    expect(range.end).toBe('2025-03-31');
  });
});
