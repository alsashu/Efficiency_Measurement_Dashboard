const path = require('path');
const fs = require('fs');
const os = require('os');
const XLSX = require('xlsx');

// Mock database to avoid DB connections in unit tests
jest.mock('../src/config/database', () => ({
  query: jest.fn(),
  getClient: jest.fn(() => ({
    query: jest.fn(),
    release: jest.fn(),
  })),
}));

jest.mock('../src/config/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

const planExcelService = require('../src/services/planExcelService');

const REQUIRED_COLUMNS = [
  'Dept',
  'Program Name',
  'PM Responsible',
  'Program Code',
  'Baseline',
  'Baseline Start',
  'Baseline End',
  'Estimated Hrs (Hours)',
  'Actual Hrs  (Hours)',
  'Effort Variance (Hours)',
  'Productivity Index (Hours)',
  'Total Effort Saved from opportunities (Hours)',
  'Total Effort Saved from opportunities (Euros)',
  'Total Cost Saved from opportunities (Euros)',
];

function createExcelFile(headers, rows = []) {
  const wb = XLSX.utils.book_new();
  const wsData = [headers, ...rows];
  const ws = XLSX.utils.aoa_to_sheet(wsData);
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  const tmpFile = path.join(os.tmpdir(), `test-${Date.now()}.xlsx`);
  XLSX.writeFile(wb, tmpFile);
  return tmpFile;
}

describe('planExcelService — REQUIRED_COLUMNS export', () => {
  it('exports exactly 14 required columns', () => {
    expect(planExcelService.REQUIRED_COLUMNS).toHaveLength(14);
    expect(planExcelService.REQUIRED_COLUMNS[0]).toBe('Dept');
    expect(planExcelService.REQUIRED_COLUMNS[8]).toBe('Actual Hrs  (Hours)');
    expect(planExcelService.REQUIRED_COLUMNS[11]).toBe('Total Effort Saved from opportunities (Hours)');
    expect(planExcelService.REQUIRED_COLUMNS[13]).toBe('Total Cost Saved from opportunities (Euros)');
  });
});

describe('planExcelService.validateAndParse — column existence', () => {
  afterEach(() => { jest.clearAllMocks(); });

  it('passes when all 14 columns present in exact order', async () => {
    const file = createExcelFile(REQUIRED_COLUMNS, [
      ['TET', 'Program A', 'John', 'PGA-001', 'BL1', '2025-01-01', '2025-12-31', 100, 90, 10, 1.1, 5, 1000, 500],
    ]);
    try {
      const result = await planExcelService.validateAndParse(file);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.recordCount).toBe(1);
    } finally {
      if (fs.existsSync(file)) fs.unlinkSync(file);
    }
  });

  it('fails when a required column is missing', async () => {
    const headers = [...REQUIRED_COLUMNS];
    headers.splice(7, 1); // Remove 'Estimated Hrs (Hours)'
    const file = createExcelFile(headers);
    try {
      const result = await planExcelService.validateAndParse(file);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('Estimated Hrs (Hours)'))).toBe(true);
    } finally {
      if (fs.existsSync(file)) fs.unlinkSync(file);
    }
  });

  it('fails when all required columns are missing', async () => {
    const file = createExcelFile(['Random', 'Columns', 'Only']);
    try {
      const result = await planExcelService.validateAndParse(file);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    } finally {
      if (fs.existsSync(file)) fs.unlinkSync(file);
    }
  });

  it('fails when header row not found', async () => {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([['NotDept', 'something']]);
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    const tmpFile = path.join(os.tmpdir(), `test-noheader-${Date.now()}.xlsx`);
    XLSX.writeFile(wb, tmpFile);
    try {
      const result = await planExcelService.validateAndParse(tmpFile);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.toLowerCase().includes('header'))).toBe(true);
    } finally {
      if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
    }
  });

  it('fails for empty sheet', async () => {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([]);
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    const tmpFile = path.join(os.tmpdir(), `test-empty-${Date.now()}.xlsx`);
    XLSX.writeFile(wb, tmpFile);
    try {
      const result = await planExcelService.validateAndParse(tmpFile);
      expect(result.valid).toBe(false);
    } finally {
      if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
    }
  });
});

describe('planExcelService.validateAndParse — column order', () => {
  it('fails when columns are in wrong order', async () => {
    const swapped = [...REQUIRED_COLUMNS];
    // Swap columns 1 and 2 (Program Name ↔ PM Responsible) so 'Dept' stays first
    // — header row detection requires 'Dept' as the first cell
    [swapped[1], swapped[2]] = [swapped[2], swapped[1]];
    const file = createExcelFile(swapped, []);
    try {
      const result = await planExcelService.validateAndParse(file);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.toLowerCase().includes('order'))).toBe(true);
    } finally {
      if (fs.existsSync(file)) fs.unlinkSync(file);
    }
  });

  it('warns but still passes when extra columns are present', async () => {
    const headers = [...REQUIRED_COLUMNS, 'Extra Column'];
    const file = createExcelFile(headers, [
      ['TET', 'Program A', 'John', 'PGA-001', 'BL1', '2025-01-01', '2025-12-31', 100, 90, 10, 1.1, 5, 1000, 500, 'extra'],
    ]);
    try {
      const result = await planExcelService.validateAndParse(file);
      expect(result.valid).toBe(true);
      expect(result.warnings.some(w => w.includes('extra') || w.toLowerCase().includes('column'))).toBe(true);
    } finally {
      if (fs.existsSync(file)) fs.unlinkSync(file);
    }
  });
});

describe('planExcelService.validateAndParse — data validation', () => {
  it('reports row error when Dept is missing', async () => {
    const file = createExcelFile(REQUIRED_COLUMNS, [
      [null, 'Program A', 'John', 'PGA-001', 'BL1', '2025-01-01', '2025-12-31', 100, 90, 10, 1.1, 5, 1000, 500],
    ]);
    try {
      const result = await planExcelService.validateAndParse(file);
      expect(result.validationReport.rowErrors.some(e => e.includes('Dept'))).toBe(true);
    } finally {
      if (fs.existsSync(file)) fs.unlinkSync(file);
    }
  });

  it('reports row error for non-numeric hours column', async () => {
    const file = createExcelFile(REQUIRED_COLUMNS, [
      ['TET', 'Program A', 'John', 'PGA-001', 'BL1', '2025-01-01', '2025-12-31', 'NOT_A_NUMBER', 90, 10, 1.1, 5, 1000, 500],
    ]);
    try {
      const result = await planExcelService.validateAndParse(file);
      expect(result.validationReport.rowErrors.some(e => e.includes('Estimated Hrs'))).toBe(true);
    } finally {
      if (fs.existsSync(file)) fs.unlinkSync(file);
    }
  });

  it('reports row error for invalid date', async () => {
    const file = createExcelFile(REQUIRED_COLUMNS, [
      ['TET', 'Program A', 'John', 'PGA-001', 'BL1', 'not-a-date', '2025-12-31', 100, 90, 10, 1.1, 5, 1000, 500],
    ]);
    try {
      const result = await planExcelService.validateAndParse(file);
      expect(result.validationReport.rowErrors.some(e => e.includes('Baseline Start'))).toBe(true);
    } finally {
      if (fs.existsSync(file)) fs.unlinkSync(file);
    }
  });

  it('skips rows where both Dept and Program Name are empty', async () => {
    const file = createExcelFile(REQUIRED_COLUMNS, [
      [null, null, 'John', 'PGA-001', 'BL1', '2025-01-01', '2025-12-31', 100, 90, 10, 1.1, 5, 1000, 500],
      ['TET', 'Program A', 'John', 'PGA-001', 'BL1', '2025-01-01', '2025-12-31', 100, 90, 10, 1.1, 5, 1000, 500],
    ]);
    try {
      const result = await planExcelService.validateAndParse(file);
      expect(result.recordCount).toBe(1);
    } finally {
      if (fs.existsSync(file)) fs.unlinkSync(file);
    }
  });

  it('accepts numeric Excel serial dates', async () => {
    // Excel serial date for 2025-01-01 is 45658
    const file = createExcelFile(REQUIRED_COLUMNS, [
      ['TET', 'Program A', 'John', 'PGA-001', 'BL1', 45658, 45750, 100, 90, 10, 1.1, 5, 1000, 500],
    ]);
    try {
      const result = await planExcelService.validateAndParse(file);
      expect(result.valid).toBe(true);
      expect(result.records[0].baseline_start).toBeTruthy();
    } finally {
      if (fs.existsSync(file)) fs.unlinkSync(file);
    }
  });

  it('parses all 14 columns correctly', async () => {
    const file = createExcelFile(REQUIRED_COLUMNS, [
      ['TET', 'Program A', 'John Smith', 'PGA-001', 'BL1.0', '2025-01-01', '2025-12-31', 1000, 900, 100, 1.11, 50, 10000, 5000],
    ]);
    try {
      const result = await planExcelService.validateAndParse(file);
      expect(result.valid).toBe(true);
      const r = result.records[0];
      expect(r.dept).toBe('TET');
      expect(r.program_name).toBe('Program A');
      expect(r.pm_responsible).toBe('John Smith');
      expect(r.program_code).toBe('PGA-001');
      expect(r.baseline).toBe('BL1.0');
      expect(r.estimated_hrs).toBe(1000);
      expect(r.actual_hrs).toBe(900);
      expect(r.effort_variance).toBe(100);
      expect(r.productivity_index).toBe(1.11);
      expect(r.total_effort_saved_hrs).toBe(50);
      expect(r.total_effort_saved_euros).toBe(10000);
      expect(r.total_cost_saved_euros).toBe(5000);
    } finally {
      if (fs.existsSync(file)) fs.unlinkSync(file);
    }
  });
});

describe('planExcelService.validateAndParse — header in non-first row', () => {
  it('finds header row when there are leading blank/metadata rows', async () => {
    const wb = XLSX.utils.book_new();
    const wsData = [
      ['TC Efficiency Dashboard - Plan Data'], // metadata row
      [], // blank
      [], // blank
      REQUIRED_COLUMNS,
      ['TET', 'Program A', 'John', 'PGA-001', 'BL1', '2025-01-01', '2025-12-31', 100, 90, 10, 1.1, 5, 1000, 500],
    ];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    const tmpFile = path.join(os.tmpdir(), `test-offset-${Date.now()}.xlsx`);
    XLSX.writeFile(wb, tmpFile);
    try {
      const result = await planExcelService.validateAndParse(tmpFile);
      expect(result.valid).toBe(true);
      expect(result.recordCount).toBe(1);
    } finally {
      if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
    }
  });
});

describe('planExcelService.validateAndParse — validation report structure', () => {
  it('returns a complete validation report with all expected fields', async () => {
    const file = createExcelFile(REQUIRED_COLUMNS, [
      ['TET', 'Program A', 'John', 'PGA-001', 'BL1', '2025-01-01', '2025-12-31', 100, 90, 10, 1.1, 5, 1000, 500],
    ]);
    try {
      const result = await planExcelService.validateAndParse(file);
      const r = result.validationReport;
      expect(r).toHaveProperty('passed');
      expect(r).toHaveProperty('sheetUsed');
      expect(r).toHaveProperty('totalRows');
      expect(r).toHaveProperty('validRows');
      expect(r).toHaveProperty('errors');
      expect(r).toHaveProperty('warnings');
      expect(r).toHaveProperty('rowErrors');
      expect(r).toHaveProperty('columnsSummary');
      expect(r).toHaveProperty('headersDiagnostic');
      expect(Array.isArray(r.columnsSummary)).toBe(true);
      expect(r.columnsSummary).toHaveLength(14);
      expect(Array.isArray(r.headersDiagnostic)).toBe(true);
      expect(r.headersDiagnostic).toHaveLength(14);
    } finally {
      if (fs.existsSync(file)) fs.unlinkSync(file);
    }
  });

  it('marks all columns as exact match with correct positions in valid file', async () => {
    const file = createExcelFile(REQUIRED_COLUMNS, []);
    try {
      const result = await planExcelService.validateAndParse(file);
      result.validationReport.columnsSummary.forEach((col, i) => {
        expect(col.found).toBe(true);
        expect(col.expectedPosition).toBe(i + 1);
        expect(col.actualPosition).toBe(i + 1);
      });
      result.validationReport.headersDiagnostic.forEach(d => {
        expect(d.matchType).toBe('exact');
        expect(d.found).toBe(true);
      });
    } finally {
      if (fs.existsSync(file)) fs.unlinkSync(file);
    }
  });
});

describe('planExcelService.validateAndParse — normalized (fuzzy) matching', () => {
  it('accepts column with single-space variant via normalized match and emits a warning', async () => {
    // Col 9 in reference file is "Actual Hrs  (Hours)" (double space)
    // A file with single space should still pass via normalized matching
    const headers = [...REQUIRED_COLUMNS];
    headers[8] = 'Actual Hrs (Hours)'; // single space variant
    const file = createExcelFile(headers, [
      ['TET', 'Program A', 'John', 'PGA-001', 'BL1', '2025-01-01', '2025-12-31', 100, 90, 10, 1.1, 5, 1000, 500],
    ]);
    try {
      const result = await planExcelService.validateAndParse(file);
      expect(result.valid).toBe(true);
      expect(result.validationReport.warnings.some(w => w.includes('Actual Hrs'))).toBe(true);
      expect(result.validationReport.headersDiagnostic[8].matchType).toBe('normalized');
    } finally {
      if (fs.existsSync(file)) fs.unlinkSync(file);
    }
  });

  it('accepts column with case-only difference via normalized match and emits a warning', async () => {
    // Uppercase "Opportunities" vs lowercase "opportunities"
    const headers = [...REQUIRED_COLUMNS];
    headers[11] = 'Total Effort Saved from Opportunities (Hours)'; // uppercase O
    const file = createExcelFile(headers, [
      ['TET', 'Program A', 'John', 'PGA-001', 'BL1', '2025-01-01', '2025-12-31', 100, 90, 10, 1.1, 5, 1000, 500],
    ]);
    try {
      const result = await planExcelService.validateAndParse(file);
      expect(result.valid).toBe(true);
      expect(result.validationReport.warnings.some(w => w.includes('Total Effort Saved from'))).toBe(true);
      expect(result.validationReport.headersDiagnostic[11].matchType).toBe('normalized');
    } finally {
      if (fs.existsSync(file)) fs.unlinkSync(file);
    }
  });

  it('headersDiagnostic contains matchType=missing for absent columns', async () => {
    const headers = [...REQUIRED_COLUMNS];
    headers.splice(7, 1); // Remove 'Estimated Hrs (Hours)'
    const file = createExcelFile(headers);
    try {
      const result = await planExcelService.validateAndParse(file);
      expect(result.valid).toBe(false);
      const missingDiag = result.validationReport.headersDiagnostic.find(d => d.expected === 'Estimated Hrs (Hours)');
      expect(missingDiag).toBeDefined();
      expect(missingDiag.matchType).toBe('missing');
      expect(missingDiag.found).toBe(false);
    } finally {
      if (fs.existsSync(file)) fs.unlinkSync(file);
    }
  });

  it('error message includes available file headers when columns are missing', async () => {
    // 'Dept' must be first so header row is found; other columns are wrong
    const file = createExcelFile(['Dept', 'WrongCol1', 'WrongCol2']);
    try {
      const result = await planExcelService.validateAndParse(file);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('Headers found in file'))).toBe(true);
    } finally {
      if (fs.existsSync(file)) fs.unlinkSync(file);
    }
  });
});

describe('planExcelService.validateAndParse — edge cases', () => {
  it('handles completely blank data rows gracefully', async () => {
    const file = createExcelFile(REQUIRED_COLUMNS, [
      [null, null, null, null, null, null, null, null, null, null, null, null, null, null],
      ['TET', 'Program A', 'John', 'PGA-001', 'BL1', '2025-01-01', '2025-12-31', 100, 90, 10, 1.1, 5, 1000, 500],
    ]);
    try {
      const result = await planExcelService.validateAndParse(file);
      expect(result.recordCount).toBe(1);
    } finally {
      if (fs.existsSync(file)) fs.unlinkSync(file);
    }
  });

  it('returns warning when no data rows after header', async () => {
    const file = createExcelFile(REQUIRED_COLUMNS, []);
    try {
      const result = await planExcelService.validateAndParse(file);
      expect(result.valid).toBe(true);
      expect(result.validationReport.warnings.some(w => w.toLowerCase().includes('no data'))).toBe(true);
    } finally {
      if (fs.existsSync(file)) fs.unlinkSync(file);
    }
  });

  it('handles multiple data rows', async () => {
    const rows = Array.from({ length: 20 }, (_, i) => [
      `Dept${i}`, `Program ${i}`, `PM ${i}`, `CODE-${i}`, `BL${i}`,
      '2025-01-01', '2025-12-31', 100, 90, 10, 1.1, 5, 1000, 500,
    ]);
    const file = createExcelFile(REQUIRED_COLUMNS, rows);
    try {
      const result = await planExcelService.validateAndParse(file);
      expect(result.valid).toBe(true);
      expect(result.recordCount).toBe(20);
    } finally {
      if (fs.existsSync(file)) fs.unlinkSync(file);
    }
  });

  it('trims whitespace from string fields', async () => {
    const file = createExcelFile(REQUIRED_COLUMNS, [
      ['  TET  ', '  Program A  ', '  John  ', 'PGA-001', 'BL1', '2025-01-01', '2025-12-31', 100, 90, 10, 1.1, 5, 1000, 500],
    ]);
    try {
      const result = await planExcelService.validateAndParse(file);
      expect(result.records[0].dept).toBe('TET');
      expect(result.records[0].program_name).toBe('Program A');
      expect(result.records[0].pm_responsible).toBe('John');
    } finally {
      if (fs.existsSync(file)) fs.unlinkSync(file);
    }
  });

  it('handles null/empty numeric values gracefully', async () => {
    const file = createExcelFile(REQUIRED_COLUMNS, [
      ['TET', 'Program A', '', '', '', null, null, null, null, null, null, null, null, null],
    ]);
    try {
      const result = await planExcelService.validateAndParse(file);
      const r = result.records[0];
      expect(r.estimated_hrs).toBeNull();
      expect(r.actual_hrs).toBeNull();
      expect(r.baseline_start).toBeNull();
    } finally {
      if (fs.existsSync(file)) fs.unlinkSync(file);
    }
  });
});
