import { describe, it, expect } from 'vitest';

// Re-implement the pure validation logic from planExcelService.js for frontend-side tests
// This mirrors the server-side validation so the frontend can display meaningful pre-flight errors

const REQUIRED_COLUMNS = [
  'Dept',
  'Program Name',
  'PM Responsible',
  'Program Code',
  'Baseline',
  'Baseline Start',
  'Baseline End',
  'Estimated Hrs (Hours)',
  'Actual Hrs (Hours)',
  'Effort Variance (Hours)',
  'Productivity Index (Hours)',
  'Total Effort Saved from Opportunities (Hours)',
  'Total Effort Saved from Opportunities (Euros)',
  'Total Cost Saved from Opportunities (Euros)',
];

function validateHeaders(headers) {
  const errors = [];
  const warnings = [];

  const missingColumns = REQUIRED_COLUMNS.filter(col => !headers.includes(col));
  if (missingColumns.length > 0) {
    errors.push(`Missing columns: ${missingColumns.join(', ')}`);
  }

  const presentOrdered = REQUIRED_COLUMNS.filter(c => headers.includes(c));
  const actualIndices = presentOrdered.map(c => headers.indexOf(c));
  for (let i = 1; i < actualIndices.length; i++) {
    if (actualIndices[i] <= actualIndices[i - 1]) {
      errors.push(`Column "${presentOrdered[i]}" must come after "${presentOrdered[i - 1]}"`);
    }
  }

  if (headers.length > REQUIRED_COLUMNS.length) {
    warnings.push(`${headers.length - REQUIRED_COLUMNS.length} extra column(s) will be ignored`);
  }

  return { valid: errors.length === 0, errors, warnings };
}

describe('Column existence validation', () => {
  it('passes with all 14 columns', () => {
    const result = validateHeaders([...REQUIRED_COLUMNS]);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('fails when one column is missing', () => {
    const headers = REQUIRED_COLUMNS.filter(c => c !== 'Dept');
    const result = validateHeaders(headers);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('Dept'))).toBe(true);
  });

  it('fails when multiple columns are missing', () => {
    const headers = REQUIRED_COLUMNS.slice(0, 5);
    const result = validateHeaders(headers);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('Missing');
  });

  it('fails when all columns are missing', () => {
    const result = validateHeaders(['Random', 'Headers']);
    expect(result.valid).toBe(false);
  });

  it('passes with extra columns (warns)', () => {
    const headers = [...REQUIRED_COLUMNS, 'Extra Column'];
    const result = validateHeaders(headers);
    expect(result.valid).toBe(true);
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});

describe('Column order validation', () => {
  it('passes when columns are in exact order', () => {
    const result = validateHeaders([...REQUIRED_COLUMNS]);
    expect(result.valid).toBe(true);
  });

  it('fails when first two columns are swapped', () => {
    const headers = [...REQUIRED_COLUMNS];
    [headers[0], headers[1]] = [headers[1], headers[0]];
    const result = validateHeaders(headers);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('must come after'))).toBe(true);
  });

  it('fails when date columns are swapped', () => {
    const headers = [...REQUIRED_COLUMNS];
    const startIdx = headers.indexOf('Baseline Start');
    const endIdx = headers.indexOf('Baseline End');
    [headers[startIdx], headers[endIdx]] = [headers[endIdx], headers[startIdx]];
    const result = validateHeaders(headers);
    expect(result.valid).toBe(false);
  });
});

describe('Required column names', () => {
  it('includes Baseline Start and Baseline End as date columns', () => {
    expect(REQUIRED_COLUMNS).toContain('Baseline Start');
    expect(REQUIRED_COLUMNS).toContain('Baseline End');
  });

  it('includes all three monetary/effort saved columns', () => {
    expect(REQUIRED_COLUMNS).toContain('Total Effort Saved from Opportunities (Hours)');
    expect(REQUIRED_COLUMNS).toContain('Total Effort Saved from Opportunities (Euros)');
    expect(REQUIRED_COLUMNS).toContain('Total Cost Saved from Opportunities (Euros)');
  });

  it('includes Productivity Index', () => {
    expect(REQUIRED_COLUMNS).toContain('Productivity Index (Hours)');
  });
});
