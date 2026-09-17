const mockQuery = jest.fn();

jest.mock('../src/config/database', () => ({ query: mockQuery }));
jest.mock('../src/config/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));

const forecastCtrl = require('../src/controllers/forecastController');

function mockRes() {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
}
const mockNext = jest.fn();

beforeEach(() => { jest.clearAllMocks(); });

describe('forecastController.getFilterOptions', () => {
  it('unions dept/program pairs and groups programs by department', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        { dept: 'TET', program_name: 'CIXL' },
        { dept: 'TET', program_name: 'RIGHT' },
        { dept: 'DTech', program_name: 'MOON' },
      ],
    });
    const req = {};
    const res = mockRes();
    await forecastCtrl.getFilterOptions(req, res, mockNext);
    const body = res.json.mock.calls[0][0];
    expect(body.success).toBe(true);
    expect(body.data.depts).toEqual(['DTech', 'TET']);
    expect(body.data.programsByDept.TET).toEqual(['CIXL', 'RIGHT']);
    expect(body.data.programsByDept.DTech).toEqual(['MOON']);
  });
});

describe('forecastController.getTimeline', () => {
  it('groups plan and forecast records per (dept, program_name) and computes efficiency_pct', async () => {
    mockQuery
      .mockResolvedValueOnce({ // plan_programs
        rows: [
          { id: 1, dept: 'TET', program_name: 'RIGHT', baseline: '5.0.0', baseline_start: '2025-04-01', baseline_end: '2025-06-30', estimated_hrs: '19614', actual_hrs: '17326', effort_variance: '2288', total_effort_saved_hrs: '7573' },
        ],
      })
      .mockResolvedValueOnce({ // forecast_programs
        rows: [
          { id: 1, dept: 'TET', program_name: 'RIGHT', baseline: '5.6.0', baseline_start: '2025-04-01', baseline_end: '2027-03-01', estimated_hrs: '13614', savings_hrs: '2340' },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ savings_hrs: '7573', estimated_hrs: '19614' }] }); // overall (plan-only)

    const req = { query: {} };
    const res = mockRes();
    await forecastCtrl.getTimeline(req, res, mockNext);

    const body = res.json.mock.calls[0][0];
    expect(body.success).toBe(true);
    expect(body.data.programs).toHaveLength(1);
    const prog = body.data.programs[0];
    expect(prog.dept).toBe('TET');
    expect(prog.program_name).toBe('RIGHT');
    expect(prog.planRecords).toHaveLength(1);
    expect(prog.planRecords[0].efficiency_pct).toBeCloseTo(38.6, 1); // 7573/19614*100
    expect(prog.forecastRecords).toHaveLength(1);
    expect(prog.forecastRecords[0].efficiency_pct).toBeCloseTo(17.2, 1); // 2340/13614*100
    expect(prog.forecastRecords[0].actual_hrs).toBeUndefined();
    expect(prog.forecastRecords[0].effort_variance).toBeUndefined();
  });

  it('computes Overall Savings from Efficiency Plan only, ignoring forecast rows', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] }) // plan_programs
      .mockResolvedValueOnce({ rows: [] }) // forecast_programs
      .mockResolvedValueOnce({ rows: [{ savings_hrs: '15240', estimated_hrs: '50000' }] }); // overall

    const req = { query: {} };
    const res = mockRes();
    await forecastCtrl.getTimeline(req, res, mockNext);

    const body = res.json.mock.calls[0][0];
    expect(body.data.overall).toEqual({ savingsHrs: 15240, estimatedHrs: 50000, savingsPct: 30.5 });
  });

  it('returns savingsPct:0 when estimated hours are zero (avoids divide-by-zero)', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ savings_hrs: '0', estimated_hrs: '0' }] });

    const req = { query: {} };
    const res = mockRes();
    await forecastCtrl.getTimeline(req, res, mockNext);

    const body = res.json.mock.calls[0][0];
    expect(body.data.overall.savingsPct).toBe(0);
  });

  it('applies multi-select dept/program filters via ANY($n)', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ savings_hrs: '0', estimated_hrs: '0' }] });

    const req = { query: { dept: ['TET', 'DTech'], program: ['RIGHT'] } };
    const res = mockRes();
    await forecastCtrl.getTimeline(req, res, mockNext);

    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toContain('dept = ANY($1)');
    expect(sql).toContain('program_name = ANY($2)');
    expect(params[0]).toEqual(['TET', 'DTech']);
    expect(params[1]).toEqual(['RIGHT']);
  });

  it('a program present only in Forecasting still appears with empty planRecords (req. 17, reversed)', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] }) // no plan_programs
      .mockResolvedValueOnce({ rows: [{ id: 1, dept: 'Sssys', program_name: 'DMS', baseline: '1.0.0', baseline_start: '2025-04-01', baseline_end: '2025-12-31', estimated_hrs: '1000', savings_hrs: '100' }] })
      .mockResolvedValueOnce({ rows: [{ savings_hrs: '0', estimated_hrs: '0' }] });

    const req = { query: {} };
    const res = mockRes();
    await forecastCtrl.getTimeline(req, res, mockNext);

    const body = res.json.mock.calls[0][0];
    expect(body.data.programs).toHaveLength(1);
    expect(body.data.programs[0].planRecords).toEqual([]);
    expect(body.data.programs[0].forecastRecords).toHaveLength(1);
  });
});
