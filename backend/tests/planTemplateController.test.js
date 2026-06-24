const path = require('path');
const fs = require('fs');

jest.mock('../src/config/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

// We mock fs so tests never touch the real filesystem
jest.mock('fs');

const planTemplateCtrl = require('../src/controllers/planTemplateController');

function mockRes() {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  res.setHeader = jest.fn(() => res);
  res.pipe = jest.fn();
  return res;
}
const mockNext = jest.fn();

// Fake readable stream for createReadStream mock
function makeFakeStream(shouldError = false) {
  const stream = {
    _handlers: {},
    on(event, handler) { this._handlers[event] = handler; return this; },
    pipe(dest) {
      if (shouldError) {
        this._handlers['error']?.(new Error('stream error'));
      }
      return dest;
    },
  };
  return stream;
}

beforeEach(() => jest.clearAllMocks());

describe('planTemplateController.getTemplate', () => {
  it('returns 404 JSON when template file does not exist', () => {
    fs.existsSync.mockReturnValue(false);
    const req = { ip: '127.0.0.1' };
    const res = mockRes();
    planTemplateCtrl.getTemplate(req, res, mockNext);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      message: expect.stringMatching(/not available/i),
    }));
  });

  it('sets correct Content-Type for xlsx', () => {
    fs.existsSync.mockReturnValue(true);
    fs.statSync.mockReturnValue({ size: 12345 });
    fs.createReadStream.mockReturnValue(makeFakeStream());
    const req = { ip: '127.0.0.1' };
    const res = mockRes();
    planTemplateCtrl.getTemplate(req, res, mockNext);
    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
  });

  it('sets Content-Disposition with download filename', () => {
    fs.existsSync.mockReturnValue(true);
    fs.statSync.mockReturnValue({ size: 12345 });
    fs.createReadStream.mockReturnValue(makeFakeStream());
    const req = { ip: '127.0.0.1' };
    const res = mockRes();
    planTemplateCtrl.getTemplate(req, res, mockNext);
    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      `attachment; filename="${planTemplateCtrl.DOWNLOAD_FILENAME}"`
    );
  });

  it('sets Content-Length from file stat', () => {
    fs.existsSync.mockReturnValue(true);
    fs.statSync.mockReturnValue({ size: 98765 });
    fs.createReadStream.mockReturnValue(makeFakeStream());
    const req = { ip: '127.0.0.1' };
    const res = mockRes();
    planTemplateCtrl.getTemplate(req, res, mockNext);
    expect(res.setHeader).toHaveBeenCalledWith('Content-Length', 98765);
  });

  it('streams the file to response', () => {
    fs.existsSync.mockReturnValue(true);
    fs.statSync.mockReturnValue({ size: 100 });
    const fakeStream = makeFakeStream();
    fs.createReadStream.mockReturnValue(fakeStream);
    const req = { ip: '127.0.0.1' };
    const res = mockRes();
    planTemplateCtrl.getTemplate(req, res, mockNext);
    // stream.pipe(res) should have been called
    expect(fs.createReadStream).toHaveBeenCalledWith(expect.stringContaining('TC_Efficiency'));
  });

  it('calls next(err) when stream emits error', () => {
    fs.existsSync.mockReturnValue(true);
    fs.statSync.mockReturnValue({ size: 100 });
    const fakeStream = makeFakeStream(true); // will fire error
    fs.createReadStream.mockReturnValue(fakeStream);
    const req = { ip: '127.0.0.1' };
    const res = mockRes();
    res.headersSent = false;
    planTemplateCtrl.getTemplate(req, res, mockNext);
    expect(mockNext).toHaveBeenCalledWith(expect.objectContaining({ message: 'stream error' }));
  });

  it('calls next(err) on unexpected thrown error', () => {
    fs.existsSync.mockImplementation(() => { throw new Error('fs exploded'); });
    const req = { ip: '127.0.0.1' };
    const res = mockRes();
    planTemplateCtrl.getTemplate(req, res, mockNext);
    expect(mockNext).toHaveBeenCalledWith(expect.objectContaining({ message: 'fs exploded' }));
  });
});

describe('planTemplateController.resolveTemplatePath', () => {
  const originalEnv = process.env.PLAN_TEMPLATE_PATH;

  afterEach(() => {
    process.env.PLAN_TEMPLATE_PATH = originalEnv;
  });

  it('returns DEFAULT_TEMPLATE when env var is not set', () => {
    delete process.env.PLAN_TEMPLATE_PATH;
    const resolved = planTemplateCtrl.resolveTemplatePath();
    expect(resolved).toBe(planTemplateCtrl.DEFAULT_TEMPLATE);
    expect(resolved).toContain('TC_Efficiency-Clean.xlsx');
  });

  it('resolves absolute path from env var as-is', () => {
    process.env.PLAN_TEMPLATE_PATH = '/absolute/path/template.xlsx';
    const resolved = planTemplateCtrl.resolveTemplatePath();
    expect(resolved).toBe('/absolute/path/template.xlsx');
  });

  it('resolves relative path from env var against cwd', () => {
    process.env.PLAN_TEMPLATE_PATH = './templates/my-template.xlsx';
    const resolved = planTemplateCtrl.resolveTemplatePath();
    expect(resolved).toBe(path.resolve(process.cwd(), './templates/my-template.xlsx'));
  });

  it('DEFAULT_TEMPLATE points inside the templates directory', () => {
    expect(planTemplateCtrl.DEFAULT_TEMPLATE).toContain(path.sep + 'templates' + path.sep);
  });

  it('DOWNLOAD_FILENAME ends with .xlsx', () => {
    expect(planTemplateCtrl.DOWNLOAD_FILENAME).toMatch(/\.xlsx$/);
  });
});
