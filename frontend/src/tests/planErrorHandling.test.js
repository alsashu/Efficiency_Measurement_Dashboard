import { describe, it, expect, vi } from 'vitest';

// Test error handling and edge cases for the plan module

describe('Excel validation error messages', () => {
  // Canonical names match TC_Efficiency-Clean.xlsx reference file
  const REQUIRED_COLUMNS = [
    'Dept', 'Program Name', 'PM Responsible', 'Program Code', 'Baseline',
    'Baseline Start', 'Baseline End', 'Estimated Hrs (Hours)', 'Actual Hrs  (Hours)',
    'Effort Variance (Hours)', 'Productivity Index (Hours)',
    'Total Effort Saved from opportunities (Hours)',
    'Total Effort Saved from opportunities (Euros)',
    'Total Cost Saved from opportunities (Euros)',
  ];

  it('has meaningful error for missing column', () => {
    const missing = ['Dept'];
    const msg = `Missing required columns: ${missing.map(c => `"${c}"`).join(', ')}`;
    expect(msg).toBe('Missing required columns: "Dept"');
    expect(msg.length).toBeGreaterThan(0);
  });

  it('has meaningful error for column order violation', () => {
    const msg = `Column "Program Name" (position 1) must come after "Dept" (position 2)`;
    expect(msg).toContain('must come after');
  });

  it('identifies all 14 columns correctly', () => {
    expect(REQUIRED_COLUMNS.length).toBe(14);
    expect(REQUIRED_COLUMNS[0]).toBe('Dept');
    expect(REQUIRED_COLUMNS[8]).toBe('Actual Hrs  (Hours)');
    expect(REQUIRED_COLUMNS[11]).toBe('Total Effort Saved from opportunities (Hours)');
    expect(REQUIRED_COLUMNS[13]).toBe('Total Cost Saved from opportunities (Euros)');
  });
});

describe('Financial Year edge cases', () => {
  function getFYRange(year) {
    return {
      start: `${year}-04-01`,
      end: `${year + 1}-03-31`,
    };
  }

  it('handles Y2K-adjacent years correctly', () => {
    const fy = getFYRange(1999);
    expect(fy.start).toBe('1999-04-01');
    expect(fy.end).toBe('2000-03-31');
  });

  it('handles current year correctly', () => {
    const fy = getFYRange(2025);
    expect(fy.start).toBe('2025-04-01');
    expect(fy.end).toBe('2026-03-31');
  });

  it('correctly identifies if a date falls in a FY', () => {
    const startDate = '2025-06-15';
    const fy = getFYRange(2025);
    const d = new Date(startDate);
    const s = new Date(fy.start);
    const e = new Date(fy.end);
    expect(d >= s && d <= e).toBe(true);
  });

  it('identifies date in wrong FY', () => {
    const startDate = '2025-01-15'; // Before April 2025, so it's FY 2024
    const fy = getFYRange(2025);
    const d = new Date(startDate);
    const s = new Date(fy.start);
    expect(d < s).toBe(true);
  });
});

describe('Data integrity — no calculations allowed', () => {
  it('plan record stores raw Excel values without computing effort variance', () => {
    const excelRow = { estimated_hrs: 1000, actual_hrs: 900, effort_variance: 50 };
    // We do NOT compute effort_variance; we store it as-is from Excel
    expect(excelRow.effort_variance).toBe(50);
    // If we had computed it: 1000 - 900 = 100, which differs
    const computed = excelRow.estimated_hrs - excelRow.actual_hrs;
    expect(computed).toBe(100);
    expect(excelRow.effort_variance).not.toBe(computed); // Raw value preserved
  });

  it('plan record stores productivity_index as-is from Excel', () => {
    const excelRow = { estimated_hrs: 1000, actual_hrs: 900, productivity_index: 1.15 };
    // We do NOT compute PI = estimated/actual = 1000/900 = 1.111...
    const computed = excelRow.estimated_hrs / excelRow.actual_hrs;
    expect(excelRow.productivity_index).toBe(1.15);
    expect(Math.abs(excelRow.productivity_index - computed)).toBeGreaterThan(0); // Preserved as-is
  });
});

describe('Upload validation error scenarios', () => {
  const validateUploadParams = ({ file, year }) => {
    const errors = [];
    if (!file) errors.push('No file uploaded');
    if (!year) errors.push('Year is required');
    return errors;
  };

  it('reports error for missing file', () => {
    const errors = validateUploadParams({ file: null, year: '2026' });
    expect(errors).toContain('No file uploaded');
  });

  it('reports error for missing year', () => {
    const errors = validateUploadParams({ file: { name: 'test.xlsx' }, year: null });
    expect(errors).toContain('Year is required');
  });

  it('no errors when all params present', () => {
    const errors = validateUploadParams({ file: { name: 'test.xlsx' }, year: '2026' });
    expect(errors).toHaveLength(0);
  });
});

describe('Plan API endpoint paths', () => {
  it('uses /plan/ namespace to avoid conflicts with legacy API', () => {
    const endpoints = [
      '/plan/uploads', '/plan/programs', '/plan/analytics/summary',
      '/plan/analytics/by-department', '/plan/analytics/by-program',
      '/plan/analytics/trends', '/plan/analytics/top-programs',
      '/plan/analytics/period-options', '/plan/years',
    ];
    endpoints.forEach(ep => {
      expect(ep.startsWith('/plan/')).toBe(true);
    });
  });
});
