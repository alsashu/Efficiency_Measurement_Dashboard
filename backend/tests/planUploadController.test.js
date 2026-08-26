const mockQuery = jest.fn();
const mockLogAudit = jest.fn();
const mockValidateAndParse = jest.fn();
const mockInsertPlanRecords = jest.fn();

jest.mock('../src/config/database', () => ({
  query: mockQuery,
  getClient: jest.fn(),
}));

jest.mock('../src/config/logger', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(),
}));

jest.mock('../src/middleware/auditLogger', () => ({
  logAudit: mockLogAudit,
}));

jest.mock('../src/services/planExcelService', () => ({
  ...jest.requireActual('../src/services/planExcelService'),
  validateAndParse: mockValidateAndParse,
  insertPlanRecords: mockInsertPlanRecords,
}));

const fs = require('fs');
jest.mock('fs', () => ({ ...jest.requireActual('fs'), existsSync: jest.fn(() => false), unlinkSync: jest.fn() }));

const planUploadCtrl = require('../src/controllers/planUploadController');

function mockRes() {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
}

const mockNext = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
});

describe('planUploadController.validateExcel', () => {
  it('returns 400 when no file uploaded', async () => {
    const req = { file: null };
    const res = mockRes();
    await planUploadCtrl.validateExcel(req, res, mockNext);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
  });

  it('returns validation result when file is present', async () => {
    mockValidateAndParse.mockResolvedValue({
      valid: true, errors: [], warnings: [], records: [], recordCount: 0,
      validationReport: { passed: true, errors: [], warnings: [], rowErrors: [] },
    });
    const req = { file: { path: '/tmp/test.xlsx' } };
    const res = mockRes();
    await planUploadCtrl.validateExcel(req, res, mockNext);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      data: expect.objectContaining({ valid: true }),
    }));
  });
});

describe('planUploadController.upload', () => {
  it('returns 400 when no file', async () => {
    const req = { file: null, body: { year: '2026' } };
    const res = mockRes();
    await planUploadCtrl.upload(req, res, mockNext);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 400 when year is missing', async () => {
    const req = { file: { path: '/tmp/test.xlsx' }, body: {} };
    const res = mockRes();
    await planUploadCtrl.upload(req, res, mockNext);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: 'Year is required' }));
  });

  it('returns 422 when Excel validation fails — response includes uploadSteps and errorType', async () => {
    mockValidateAndParse.mockResolvedValue({
      valid: false,
      errors: ['Missing required columns: "Dept"'],
      records: [], recordCount: 0,
      validationReport: {
        passed: false, sheetUsed: 'Sheet1', totalRows: 0, validRows: 0,
        errors: ['Missing required columns: "Dept"'], warnings: [], rowErrors: [],
        columnsSummary: [], headersDiagnostic: [],
      },
    });
    const req = {
      file: { path: '/tmp/test.xlsx', filename: 'test.xlsx', originalname: 'test.xlsx', size: 1000 },
      body: { year: '2026' },
      user: { id: 1 }, ip: '127.0.0.1',
    };
    const res = mockRes();
    await planUploadCtrl.upload(req, res, mockNext);
    expect(res.status).toHaveBeenCalledWith(422);
    const body = res.json.mock.calls[0][0];
    expect(body.success).toBe(false);
    expect(body.errorType).toBe('VALIDATION_ERROR');
    expect(body.component).toBe('Excel Validation');
    expect(body.validationReport).toBeDefined();
    expect(Array.isArray(body.uploadSteps)).toBe(true);
    // Skipped DB steps should be present
    expect(body.uploadSteps.some(s => s.step === 'Database Connection' && s.status === 'skipped')).toBe(true);
    expect(body.uploadSteps.some(s => s.step === 'Data Import' && s.status === 'skipped')).toBe(true);
  });

  it('returns 500 with structured DB error when table does not exist (42P01)', async () => {
    const fakeRecords = [{ dept: 'TET', program_name: 'Prog A' }];
    mockValidateAndParse.mockResolvedValue({
      valid: true, errors: [], records: fakeRecords, recordCount: 1,
      validationReport: {
        passed: true, sheetUsed: 'Sheet1', totalRows: 1, validRows: 1,
        errors: [], warnings: [], rowErrors: [],
        columnsSummary: Array(14).fill({ found: true, expectedPosition: 1, actualPosition: 1, name: 'x' }),
        headersDiagnostic: [],
      },
    });
    const dbErr = new Error('relation "plan_upload_years" does not exist');
    dbErr.code = '42P01';
    mockQuery.mockRejectedValueOnce(dbErr);

    const req = {
      file: { path: '/tmp/test.xlsx', filename: 'test.xlsx', originalname: 'test.xlsx', size: 1000 },
      body: { year: '2026', datasetName: 'Test' },
      user: { id: 1 }, ip: '127.0.0.1',
    };
    const res = mockRes();
    await planUploadCtrl.upload(req, res, mockNext);
    expect(res.status).toHaveBeenCalledWith(500);
    const body = res.json.mock.calls[0][0];
    expect(body.success).toBe(false);
    expect(body.errorType).toBe('DATABASE_ERROR');
    expect(body.component).toBe('Database');
    expect(body.errorDetail).toBeDefined();
    expect(body.errorDetail.pgCode).toBe('42P01');
    expect(body.errorDetail.databaseObject).toBe('plan_upload_years');
    expect(body.errorDetail.issue).toContain('plan_upload_years');
    expect(body.errorDetail.expectedAction).toContain('npm run migrate');
    expect(Array.isArray(body.uploadSteps)).toBe(true);
    // Excel steps should be passed
    expect(body.uploadSteps.some(s => s.step === 'Column Validation' && s.status === 'passed')).toBe(true);
    // DB step should be failed
    expect(body.uploadSteps.some(s => s.step === 'Table Validation' && s.status === 'failed')).toBe(true);
    // Import should be skipped
    expect(body.uploadSteps.some(s => s.step === 'Data Import' && s.status === 'skipped')).toBe(true);
  });

  it('successfully uploads valid Excel and returns uploadSteps in success response', async () => {
    const fakeRecords = [{ dept: 'TET', program_name: 'Prog A' }];
    mockValidateAndParse.mockResolvedValue({
      valid: true, errors: [], records: fakeRecords, recordCount: 1,
      validationReport: {
        passed: true, sheetUsed: 'Sheet1', totalRows: 1, validRows: 1,
        errors: [], warnings: [], rowErrors: [],
        columnsSummary: Array(14).fill({ found: true, expectedPosition: 1, actualPosition: 1, name: 'x' }),
        headersDiagnostic: [],
      },
    });
    mockQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 5 }] })
      .mockResolvedValueOnce({ rows: [{ next_version: 1 }] })
      .mockResolvedValueOnce({ rows: [{ id: 10, file_name: 'test.xlsx', original_name: 'test.xlsx', file_size: 1000, upload_version: 1, record_count: 1, status: 'completed', created_at: new Date() }] });
    mockInsertPlanRecords.mockResolvedValue(undefined);
    mockLogAudit.mockResolvedValue(undefined);

    const req = {
      file: { path: '/tmp/test.xlsx', filename: 'test.xlsx', originalname: 'test.xlsx', size: 1000 },
      body: { year: '2026', datasetName: 'Test Dataset' },
      user: { id: 1 }, ip: '127.0.0.1',
    };
    const res = mockRes();
    await planUploadCtrl.upload(req, res, mockNext);
    expect(res.status).toHaveBeenCalledWith(201);
    const body = res.json.mock.calls[0][0];
    expect(body.success).toBe(true);
    expect(Array.isArray(body.uploadSteps)).toBe(true);
    expect(body.uploadSteps.some(s => s.step === 'Data Import' && s.status === 'passed')).toBe(true);
    expect(mockInsertPlanRecords).toHaveBeenCalledWith(10, fakeRecords);
  });
});

describe('planUploadController.getUploads', () => {
  it('returns paginated uploads', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 1, original_name: 'test.xlsx' }] })
      .mockResolvedValueOnce({ rows: [{ count: '1' }] });
    const req = { query: { page: 1, limit: 20 } };
    const res = mockRes();
    await planUploadCtrl.getUploads(req, res, mockNext);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      pagination: expect.objectContaining({ total: 1 }),
    }));
  });
});

describe('planUploadController.deleteUpload', () => {
  it('returns 404 when upload not found', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const req = { params: { id: '999' }, user: { id: 1 }, ip: '127.0.0.1' };
    const res = mockRes();
    await planUploadCtrl.deleteUpload(req, res, mockNext);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('deletes upload and associated programs', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 1, original_name: 'test.xlsx', file_path: null }] })
      .mockResolvedValueOnce({ rows: [] }) // DELETE programs
      .mockResolvedValueOnce({ rows: [] }); // DELETE uploaded_files
    mockLogAudit.mockResolvedValue(undefined);
    const req = { params: { id: '1' }, user: { id: 1 }, ip: '127.0.0.1' };
    const res = mockRes();
    await planUploadCtrl.deleteUpload(req, res, mockNext);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });
});

describe('planUploadController.getYears', () => {
  it('returns available years', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 1, year: 2026, upload_count: '3' }] });
    const req = { query: {} };
    const res = mockRes();
    await planUploadCtrl.getYears(req, res, mockNext);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, data: expect.any(Array) }));
  });
});
