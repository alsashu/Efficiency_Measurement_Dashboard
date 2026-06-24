const mockQuery = jest.fn();

jest.mock('../src/config/database', () => ({ query: mockQuery }));
jest.mock('../src/config/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));

const planAnalyticsCtrl = require('../src/controllers/planAnalyticsController');

function mockRes() {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
}
const mockNext = jest.fn();

beforeEach(() => { jest.clearAllMocks(); });

describe('planAnalyticsController.getSummary', () => {
  const summaryRow = {
    total_baselines: '10', total_programs: '5', total_departments: '3',
    total_estimated_hrs: '1000', total_actual_hrs: '900', total_effort_variance: '100',
    avg_productivity_index: '1.1', total_effort_saved_hrs: '50',
    total_effort_saved_euros: '5000', total_cost_saved_euros: '2000',
    overbudget_count: '1', onbudget_count: '9',
    earliest_start: '2025-01-01', latest_end: '2025-12-31',
  };

  it('returns summary for all data (no period filter)', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [summaryRow] });
    const req = { query: {} };
    const res = mockRes();
    await planAnalyticsCtrl.getSummary(req, res, mockNext);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, data: summaryRow }));
  });

  it('applies calendar year filter', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [summaryRow] });
    const req = { query: { periodType: 'calendar', periodYear: '2025' } };
    const res = mockRes();
    await planAnalyticsCtrl.getSummary(req, res, mockNext);
    const [sql, params] = mockQuery.mock.calls[0];
    expect(params).toContain('2025-01-01');
    expect(params).toContain('2025-12-31');
  });

  it('applies financial year filter (FY 2025 = Apr 2025 - Mar 2026)', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [summaryRow] });
    const req = { query: { periodType: 'financial', periodYear: '2025' } };
    const res = mockRes();
    await planAnalyticsCtrl.getSummary(req, res, mockNext);
    const [, params] = mockQuery.mock.calls[0];
    expect(params).toContain('2025-04-01');
    expect(params).toContain('2026-03-31');
  });

  it('applies upload ID filter', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [summaryRow] });
    const req = { query: { uploadId: '42' } };
    const res = mockRes();
    await planAnalyticsCtrl.getSummary(req, res, mockNext);
    const [sql, params] = mockQuery.mock.calls[0];
    expect(params).toContain(42);
  });

  it('calls next on error', async () => {
    const err = new Error('DB error');
    mockQuery.mockRejectedValueOnce(err);
    const req = { query: {} };
    const res = mockRes();
    await planAnalyticsCtrl.getSummary(req, res, mockNext);
    expect(mockNext).toHaveBeenCalledWith(err);
  });
});

describe('planAnalyticsController.getByDepartment', () => {
  it('returns department data sorted by effort saved', async () => {
    const deptRows = [
      { dept: 'TET', baselines: '5', estimated_hrs: '500', effort_saved_hrs: '100' },
      { dept: 'V&V', baselines: '3', estimated_hrs: '300', effort_saved_hrs: '0' },
    ];
    mockQuery.mockResolvedValueOnce({ rows: deptRows });
    const req = { query: { periodType: 'calendar', periodYear: '2025' } };
    const res = mockRes();
    await planAnalyticsCtrl.getByDepartment(req, res, mockNext);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, data: deptRows }));
  });
});

describe('planAnalyticsController.getByProgram', () => {
  it('returns program data', async () => {
    const progRows = [
      { program_name: 'RIGHT', dept: 'TET', effort_saved_hrs: '200' },
    ];
    mockQuery.mockResolvedValueOnce({ rows: progRows });
    const req = { query: {} };
    const res = mockRes();
    await planAnalyticsCtrl.getByProgram(req, res, mockNext);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, data: progRows }));
  });
});

describe('planAnalyticsController.getTrends', () => {
  it('returns quarterly and yearly trend data', async () => {
    const qRows = [{ year: 2025, quarter: 1, estimated_hrs: '100' }];
    const yRows = [{ year: 2025, estimated_hrs: '400' }];
    mockQuery
      .mockResolvedValueOnce({ rows: qRows })
      .mockResolvedValueOnce({ rows: yRows });
    const req = { query: {} };
    const res = mockRes();
    await planAnalyticsCtrl.getTrends(req, res, mockNext);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      data: expect.objectContaining({ quarterly: qRows, yearly: yRows }),
    }));
  });
});

describe('planAnalyticsController.getTopPrograms', () => {
  it('returns top programs sorted by metric', async () => {
    const topRows = [{ program_name: 'RIGHT', metric_value: '5000' }];
    mockQuery.mockResolvedValueOnce({ rows: topRows });
    const req = { query: { metric: 'effort_saved', limit: '5' } };
    const res = mockRes();
    await planAnalyticsCtrl.getTopPrograms(req, res, mockNext);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      data: expect.objectContaining({ top: topRows }),
    }));
  });

  it('uses default metric when not specified', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const req = { query: {} };
    const res = mockRes();
    await planAnalyticsCtrl.getTopPrograms(req, res, mockNext);
    const [sql] = mockQuery.mock.calls[0];
    expect(sql).toContain('total_effort_saved_hrs');
  });
});

describe('planAnalyticsController.getPeriodOptions', () => {
  it('returns calendar years and financial year options', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ year: 2025 }, { year: 2026 }] });
    const req = { query: {} };
    const res = mockRes();
    await planAnalyticsCtrl.getPeriodOptions(req, res, mockNext);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      data: expect.objectContaining({
        calendarYears: expect.any(Array),
        financialYears: expect.any(Array),
      }),
    }));
    const data = res.json.mock.calls[0][0].data;
    expect(data.financialYears[0]).toHaveProperty('label');
    expect(data.financialYears[0]).toHaveProperty('value');
  });
});

describe('Financial Year date range calculation', () => {
  it('FY 2025 covers Apr 2025 to Mar 2026', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ total_baselines: '0' }] });
    const req = { query: { periodType: 'financial', periodYear: '2025' } };
    const res = mockRes();
    await planAnalyticsCtrl.getSummary(req, res, mockNext);
    const [, params] = mockQuery.mock.calls[0];
    expect(params).toContain('2025-04-01');
    expect(params).toContain('2026-03-31');
  });

  it('FY 2024 covers Apr 2024 to Mar 2025', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ total_baselines: '0' }] });
    const req = { query: { periodType: 'financial', periodYear: '2024' } };
    const res = mockRes();
    await planAnalyticsCtrl.getSummary(req, res, mockNext);
    const [, params] = mockQuery.mock.calls[0];
    expect(params).toContain('2024-04-01');
    expect(params).toContain('2025-03-31');
  });

  it('CY 2025 covers Jan 2025 to Dec 2025', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ total_baselines: '0' }] });
    const req = { query: { periodType: 'calendar', periodYear: '2025' } };
    const res = mockRes();
    await planAnalyticsCtrl.getSummary(req, res, mockNext);
    const [, params] = mockQuery.mock.calls[0];
    expect(params).toContain('2025-01-01');
    expect(params).toContain('2025-12-31');
  });
});

describe('planAnalyticsController.getKpiDetail', () => {
  const programRows = [
    { program_name: 'Alpha', dept: 'TET', program_code: 'PGA001', pm_responsible: 'John',
      baselines: '2', estimated_hrs: '1000', actual_hrs: '900', effort_variance: '100',
      avg_pi: '1.1', effort_saved_hrs: '50', effort_saved_euros: '1000', cost_saved_euros: '500' },
    { program_name: 'Beta', dept: 'DTech', program_code: 'PGB002', pm_responsible: 'Jane',
      baselines: '1', estimated_hrs: '500', actual_hrs: '520', effort_variance: '-20',
      avg_pi: '0.96', effort_saved_hrs: '10', effort_saved_euros: '200', cost_saved_euros: '100' },
  ];
  const deptRows = [
    { dept: 'TET', program_count: 1, estimated_hrs: '1000', actual_hrs: '900', effort_variance: '100',
      avg_pi: '1.1', effort_saved_hrs: '50', effort_saved_euros: '1000', cost_saved_euros: '500' },
    { dept: 'DTech', program_count: 1, estimated_hrs: '500', actual_hrs: '520', effort_variance: '-20',
      avg_pi: '0.96', effort_saved_hrs: '10', effort_saved_euros: '200', cost_saved_euros: '100' },
  ];

  it('returns programs and departments arrays', async () => {
    mockQuery.mockResolvedValueOnce({ rows: programRows });
    mockQuery.mockResolvedValueOnce({ rows: deptRows });
    const req = { query: {} };
    const res = mockRes();
    await planAnalyticsCtrl.getKpiDetail(req, res, mockNext);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      data: expect.objectContaining({
        programs: programRows,
        departments: deptRows,
      }),
    }));
  });

  it('programs include pm_responsible from STRING_AGG', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ ...programRows[0], pm_responsible: 'John, Alice' }] });
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const req = { query: {} };
    const res = mockRes();
    await planAnalyticsCtrl.getKpiDetail(req, res, mockNext);
    const body = res.json.mock.calls[0][0];
    expect(body.data.programs[0].pm_responsible).toBe('John, Alice');
  });

  it('applies period filter to both queries', async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    const req = { query: { periodType: 'calendar', periodYear: '2025' } };
    const res = mockRes();
    await planAnalyticsCtrl.getKpiDetail(req, res, mockNext);
    expect(mockQuery).toHaveBeenCalledTimes(2);
    // Both queries should receive the same date params
    const [, p1] = mockQuery.mock.calls[0];
    const [, p2] = mockQuery.mock.calls[1];
    expect(p1).toContain('2025-01-01');
    expect(p2).toContain('2025-01-01');
  });

  it('propagates database errors via next()', async () => {
    const dbErr = new Error('DB failure');
    mockQuery.mockRejectedValueOnce(dbErr);
    const req = { query: {} };
    const res = mockRes();
    await planAnalyticsCtrl.getKpiDetail(req, res, mockNext);
    expect(mockNext).toHaveBeenCalledWith(dbErr);
  });
});
