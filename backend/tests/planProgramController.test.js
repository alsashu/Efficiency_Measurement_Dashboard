const mockQuery = jest.fn();
const mockLogAudit = jest.fn();

jest.mock('../src/config/database', () => ({ query: mockQuery }));
jest.mock('../src/config/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));
jest.mock('../src/middleware/auditLogger', () => ({ logAudit: mockLogAudit }));

const planProgramCtrl = require('../src/controllers/planProgramController');

function mockRes() {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
}
const mockNext = jest.fn();

beforeEach(() => { jest.clearAllMocks(); });

describe('planProgramController.getPrograms', () => {
  it('returns paginated programs', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ count: '5' }] })
      .mockResolvedValueOnce({ rows: [{ id: 1, dept: 'TET', program_name: 'Prog A' }] });
    const req = { query: { page: 1, limit: 10 } };
    const res = mockRes();
    await planProgramCtrl.getPrograms(req, res, mockNext);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      pagination: expect.objectContaining({ total: 5 }),
    }));
  });

  it('filters by uploadId when provided', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ count: '1' }] })
      .mockResolvedValueOnce({ rows: [{ id: 1 }] });
    const req = { query: { uploadId: '42', page: 1, limit: 100 } };
    const res = mockRes();
    await planProgramCtrl.getPrograms(req, res, mockNext);
    const [sql] = mockQuery.mock.calls[0];
    expect(sql).toContain('upload_id');
  });

  it('filters by dept when provided', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ count: '2' }] })
      .mockResolvedValueOnce({ rows: [] });
    const req = { query: { dept: 'TET', page: 1, limit: 100 } };
    const res = mockRes();
    await planProgramCtrl.getPrograms(req, res, mockNext);
    const [sql] = mockQuery.mock.calls[0];
    expect(sql).toContain('dept');
  });
});

describe('planProgramController.getProgramById', () => {
  it('returns 404 when not found', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const req = { params: { id: '999' } };
    const res = mockRes();
    await planProgramCtrl.getProgramById(req, res, mockNext);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('returns program when found', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 1, dept: 'TET' }] });
    const req = { params: { id: '1' } };
    const res = mockRes();
    await planProgramCtrl.getProgramById(req, res, mockNext);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });
});

describe('planProgramController.createProgram', () => {
  it('returns 400 when dept or program_name missing', async () => {
    const req = { body: { program_name: 'Prog A' }, user: { id: 1 }, ip: '127.0.0.1' };
    const res = mockRes();
    await planProgramCtrl.createProgram(req, res, mockNext);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('creates program successfully', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 1, dept: 'TET', program_name: 'Prog A' }] });
    mockLogAudit.mockResolvedValue(undefined);
    const req = {
      body: { dept: 'TET', program_name: 'Prog A', estimated_hrs: 100 },
      user: { id: 1 }, ip: '127.0.0.1',
    };
    const res = mockRes();
    await planProgramCtrl.createProgram(req, res, mockNext);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });
});

describe('planProgramController.updateProgram', () => {
  it('returns 404 when program not found', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const req = { params: { id: '99' }, body: { dept: 'TET' }, user: { id: 1 }, ip: '127.0.0.1' };
    const res = mockRes();
    await planProgramCtrl.updateProgram(req, res, mockNext);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('updates program successfully', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 1 }] })
      .mockResolvedValueOnce({ rows: [{ id: 1, dept: 'TET', program_name: 'Updated' }] });
    mockLogAudit.mockResolvedValue(undefined);
    const req = {
      params: { id: '1' },
      body: { dept: 'TET', program_name: 'Updated' },
      user: { id: 1 }, ip: '127.0.0.1',
    };
    const res = mockRes();
    await planProgramCtrl.updateProgram(req, res, mockNext);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });
});

describe('planProgramController.deleteProgram', () => {
  it('returns 404 when not found', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const req = { params: { id: '99' }, user: { id: 1 }, ip: '127.0.0.1' };
    const res = mockRes();
    await planProgramCtrl.deleteProgram(req, res, mockNext);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('deletes program successfully', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 1 }] })
      .mockResolvedValueOnce({ rows: [] });
    mockLogAudit.mockResolvedValue(undefined);
    const req = { params: { id: '1' }, user: { id: 1 }, ip: '127.0.0.1' };
    const res = mockRes();
    await planProgramCtrl.deleteProgram(req, res, mockNext);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });
});

describe('planProgramController.getFilterOptions', () => {
  it('returns depts and programs', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ dept: 'TET' }, { dept: 'SSsys' }] })
      .mockResolvedValueOnce({ rows: [{ program_name: 'RIGHT' }] });
    const req = { query: {} };
    const res = mockRes();
    await planProgramCtrl.getFilterOptions(req, res, mockNext);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      data: expect.objectContaining({
        depts: expect.arrayContaining(['TET', 'SSsys']),
        programs: expect.arrayContaining(['RIGHT']),
      }),
    }));
  });
});
