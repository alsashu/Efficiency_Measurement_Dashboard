const XLSX = require('xlsx');

jest.mock('../src/config/database', () => ({
  query: jest.fn(),
  getClient: jest.fn(() => ({ query: jest.fn(), release: jest.fn() })),
}));

jest.mock('../src/config/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));

const forecastExcelService = require('../src/services/forecastExcelService');

const FORECAST_HEADERS = [
  'Dept', 'Program Name', 'PM Responsible', 'Baseline', 'Baseline Start', 'Baseline End', 'Estimated Hrs',
  'Total Cost Saved from opportunities in Hrs', 'Total Cost Saved from opportunities in Euros',
  'Reuse of Reference Library / Solutions in Hrs', 'Technical Competency Improvement in Hrs',
  'AI Assisted / Copilot usage in Hrs', 'Automation of Testing - Unit / Component / System in Hrs',
  'Automation of Reviews in Hrs', 'Automation of Build & Release Process - CI/CD/DevX in Hrs',
  'Automation - Others, if any in Hrs', 'Usage of Simulators / Tools / Infrastruture in Hrs',
  'Sw Development Life cycle Process Improvement / Leaner Process in Hrs',
  'Any opportunities realised in reducing inefficiency in Hrs',
];

function buildWorkbook(sheets) {
  const wb = XLSX.utils.book_new();
  for (const [name, aoa] of sheets) {
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    XLSX.utils.book_append_sheet(wb, ws, name);
  }
  return wb;
}

describe('forecastExcelService.validateAndParse — sheet detection', () => {
  it('returns found:false (non-fatal) when no Forecasting sheet exists', () => {
    const wb = buildWorkbook([['Efficiency_Plan', [['Dept'], ['TET']]]]);
    const result = forecastExcelService.validateAndParse(wb);
    expect(result.found).toBe(false);
    expect(result.valid).toBe(true);
    expect(result.records).toEqual([]);
  });

  it('finds a sheet named "Forecasting " with a trailing space (trimmed match)', () => {
    const wb = buildWorkbook([
      ['Efficiency_Plan', [['Dept'], ['TET']]],
      ['Forecasting ', [FORECAST_HEADERS, ['TET', 'RIGHT', 'PM One', '5.6.0', '2025-04-01', '2027-03-01', 13614, 2340]]],
    ]);
    const result = forecastExcelService.validateAndParse(wb);
    expect(result.found).toBe(true);
    expect(result.valid).toBe(true);
    expect(result.recordCount).toBe(1);
    expect(result.records[0]).toMatchObject({ dept: 'TET', program_name: 'RIGHT', baseline: '5.6.0', estimated_hrs: 13614, savings_hrs: 2340 });
  });

  it('matches "FORECASTING" case-insensitively', () => {
    const wb = buildWorkbook([['FORECASTING', [FORECAST_HEADERS, ['TET', 'RIGHT', null, '5.6.0', '2025-04-01', '2027-03-01', 13614, 2340]]]]);
    const result = forecastExcelService.validateAndParse(wb);
    expect(result.found).toBe(true);
    expect(result.recordCount).toBe(1);
  });
});

describe('forecastExcelService.validateAndParse — missing dates handled gracefully (req. 18)', () => {
  it('imports a row with missing Baseline Start/End without failing validation', () => {
    const wb = buildWorkbook([
      ['Forecasting', [FORECAST_HEADERS,
        ['TET', 'RIGHT', 'PM One', '5.6.0', null, null, 13614, 2340],
        ['TET', 'CIXL', 'PM Two', '6.0.0', '2025-04-01', '2027-03-01', 40000, 6234],
      ]],
    ]);
    const result = forecastExcelService.validateAndParse(wb);
    expect(result.valid).toBe(true);
    expect(result.recordCount).toBe(2);
    expect(result.records[0].baseline_start).toBeNull();
    expect(result.records[0].baseline_end).toBeNull();
    expect(result.records[1].baseline_start).toBe('2025-04-01');
  });
});

describe('forecastExcelService.validateAndParse — missing required columns', () => {
  it('is non-fatal (valid:true) but returns no records when Dept/Program Name columns are missing', () => {
    const wb = buildWorkbook([['Forecasting', [['Some', 'Other', 'Headers'], [1, 2, 3]]]]);
    const result = forecastExcelService.validateAndParse(wb);
    expect(result.found).toBe(true);
    expect(result.valid).toBe(true); // never fatal to the overall upload
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.records).toEqual([]);
  });
});

describe('forecastExcelService.validateAndParse — a program with no forecast row (req. 17)', () => {
  it('simply does not produce a record for that program — no crash', () => {
    const wb = buildWorkbook([
      ['Forecasting', [FORECAST_HEADERS, ['TET', 'RIGHT', 'PM One', '5.6.0', '2025-04-01', '2027-03-01', 13614, 2340]]],
    ]);
    const result = forecastExcelService.validateAndParse(wb);
    expect(result.records.find(r => r.program_name === 'DMS')).toBeUndefined();
    expect(result.records.find(r => r.program_name === 'RIGHT')).toBeDefined();
  });
});
