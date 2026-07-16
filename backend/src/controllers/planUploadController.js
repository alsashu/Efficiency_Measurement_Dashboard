const path = require('path');
const fs = require('fs');
const { query } = require('../config/database');
const logger = require('../config/logger');
const { logAudit } = require('../middleware/auditLogger');
const planExcelService = require('../services/planExcelService');

// PostgreSQL error codes of interest
const PG_ERRORS = {
  '42P01': { label: 'undefined_table', userLabel: 'Table/Relation not found' },
  '42703': { label: 'undefined_column', userLabel: 'Column not found in table' },
  '23505': { label: 'unique_violation', userLabel: 'Duplicate record' },
  '23503': { label: 'foreign_key_violation', userLabel: 'Foreign key constraint violated' },
  '08006': { label: 'connection_failure', userLabel: 'Database connection failure' },
  '08001': { label: 'unable_to_connect', userLabel: 'Unable to connect to database' },
  '3D000': { label: 'invalid_catalog_name', userLabel: 'Database does not exist' },
  '28P01': { label: 'invalid_password', userLabel: 'Database authentication failed' },
  '57P01': { label: 'admin_shutdown', userLabel: 'Database server shut down' },
};

function classifyDbError(err) {
  const pgInfo = PG_ERRORS[err.code];

  if (err.code === '42P01') {
    const tableMatch = err.message.match(/relation "([^"]+)" does not exist/i);
    const tableName = tableMatch?.[1] || 'unknown';
    return {
      errorType: 'Database Error',
      component: 'Database',
      pgCode: err.code,
      databaseObject: tableName,
      issue: `Table "${tableName}" does not exist`,
      techDetail: `PostgreSQL error ${err.code} (${pgInfo.label}): ${err.message}`,
      expectedAction: 'The database migration has not been run. Execute: npm run migrate in the backend directory.',
      uploadStatus: 'Failed',
      userMessage: `Database error: Table "${tableName}" does not exist. The database schema needs to be created. Run: npm run migrate`,
    };
  }

  if (err.code === '28P01' || err.code === '08006' || err.code === '08001') {
    return {
      errorType: 'Database Error',
      component: 'Database',
      pgCode: err.code,
      databaseObject: null,
      issue: pgInfo?.userLabel || 'Database connection failed',
      techDetail: `PostgreSQL error ${err.code}: ${err.message}`,
      expectedAction: 'Verify that PostgreSQL is running and check the DATABASE_URL / DB credentials in the .env file.',
      uploadStatus: 'Failed',
      userMessage: 'Database connection failed. Check that PostgreSQL is running and credentials are correct.',
    };
  }

  return {
    errorType: 'Database Error',
    component: 'Database',
    pgCode: err.code || null,
    databaseObject: null,
    issue: err.message,
    techDetail: err.stack || err.message,
    expectedAction: 'Check the backend logs for a full stack trace.',
    uploadStatus: 'Failed',
    userMessage: `Database error: ${err.message}`,
  };
}

function buildExcelSteps(fileName, ext, validationReport, errors, recordCount) {
  const missingCols = validationReport?.columnsSummary?.filter(c => !c.found) || [];
  const missingCoreCols = missingCols.filter(c => planExcelService.CORE_COLUMNS.includes(c.name));
  const missingOptionalCols = missingCols.filter(c => !planExcelService.CORE_COLUMNS.includes(c.name));
  const totalColumns = planExcelService.REQUIRED_COLUMNS.length;
  const coreColumnCount = planExcelService.CORE_COLUMNS.length;
  const hasOrderError = errors.some(e => e.toLowerCase().includes('order'));
  const rowErrorCount = validationReport?.rowErrors?.length || 0;

  let columnStatus = 'passed';
  let columnDetails = `All ${totalColumns} columns present (${coreColumnCount} required + ${totalColumns - coreColumnCount} opportunity-category)`;
  if (missingCoreCols.length > 0) {
    columnStatus = 'failed';
    columnDetails = `${missingCoreCols.length} missing required column(s): ${missingCoreCols.map(c => c.name).join(', ')}`;
  } else if (missingOptionalCols.length > 0) {
    columnStatus = 'warning';
    columnDetails = `All ${coreColumnCount} required columns present. ${missingOptionalCols.length} optional opportunity-category column(s) missing: ${missingOptionalCols.map(c => c.name).join(', ')}`;
  }

  return [
    {
      step: 'File Selected',
      status: 'passed',
      details: fileName,
    },
    {
      step: 'File Format Validation',
      status: 'passed',
      details: `Valid ${ext} file`,
    },
    {
      step: 'Sheet Validation',
      status: validationReport?.sheetUsed ? 'passed' : 'failed',
      details: validationReport?.sheetUsed
        ? `Sheet "${validationReport.sheetUsed}" found`
        : 'No valid sheet found',
    },
    {
      step: 'Column Validation',
      status: columnStatus,
      details: columnDetails,
    },
    {
      step: 'Column Order Validation',
      status: hasOrderError ? 'failed' : 'passed',
      details: hasOrderError ? 'Column order violation detected' : 'Correct column sequence',
    },
    {
      step: 'Data Validation',
      status: rowErrorCount === 0 ? 'passed' : 'warning',
      details: rowErrorCount === 0
        ? `${recordCount} rows validated — no issues`
        : `${rowErrorCount} row-level issue(s) found`,
    },
  ];
}

exports.validateExcel = async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });
    const filePath = req.file.path;
    const result = await planExcelService.validateAndParse(filePath);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    res.json({
      success: true,
      data: {
        valid: result.valid,
        recordCount: result.recordCount,
        validationReport: result.validationReport,
      },
    });
  } catch (err) {
    if (req.file?.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    next(err);
  }
};

exports.upload = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }

    const { year, datasetName, notes } = req.body;
    if (!year) {
      return res.status(400).json({ success: false, message: 'Year is required' });
    }

    const fileName = req.file.originalname;
    const ext = path.extname(fileName).toLowerCase();
    const filePath = req.file.path;

    // ── Step 1-6: Excel validation ────────────────────────────────────────────
    const { valid, errors, records, recordCount, validationReport } =
      await planExcelService.validateAndParse(filePath);

    const excelSteps = buildExcelSteps(fileName, ext, validationReport, errors, recordCount);

    if (!valid) {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

      return res.status(422).json({
        success: false,
        message: 'Excel validation failed. Please fix the errors and re-upload.',
        errorType: 'VALIDATION_ERROR',
        component: 'Excel Validation',
        uploadSteps: [
          ...excelSteps,
          { step: 'Database Connection', status: 'skipped', details: 'Skipped — validation failed' },
          { step: 'Table Validation', status: 'skipped', details: 'Skipped — validation failed' },
          { step: 'Data Import', status: 'skipped', details: 'Import stopped due to validation failure' },
        ],
        validationReport,
      });
    }

    // ── Step 7-9: Database operations ─────────────────────────────────────────
    try {
      // Year lookup / insert
      let yearResult = await query(
        'SELECT id FROM plan_upload_years WHERE year=$1',
        [parseInt(year)]
      );
      if (!yearResult.rows.length) {
        yearResult = await query(
          'INSERT INTO plan_upload_years (year) VALUES ($1) RETURNING id',
          [parseInt(year)]
        );
      }
      const yearId = yearResult.rows[0].id;

      // Version
      const versionResult = await query(
        'SELECT COALESCE(MAX(upload_version),0)+1 AS next_version FROM plan_uploaded_files WHERE year_id=$1',
        [yearId]
      );
      const version = versionResult.rows[0].next_version;

      // Create upload record
      const uploadResult = await query(
        `INSERT INTO plan_uploaded_files (year_id, file_name, original_name, file_path, file_size,
          upload_version, dataset_name, uploaded_by, record_count, status, notes, validation_report)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'completed',$10,$11) RETURNING *`,
        [
          yearId, req.file.filename, fileName, filePath, req.file.size,
          version, datasetName || fileName, req.user.id, recordCount,
          notes || null, JSON.stringify(validationReport),
        ]
      );
      const upload = uploadResult.rows[0];

      if (records.length) {
        await planExcelService.insertPlanRecords(upload.id, records);
      }

      await logAudit(
        req.user.id, 'PLAN_UPLOAD', 'plan_uploaded_files', upload.id,
        { fileName, year, version, recordCount }, req.ip
      );

      logger.info('Plan file uploaded successfully', {
        uploadId: upload.id, fileName, userId: req.user.id, recordCount,
      });

      const uploadSteps = [
        ...excelSteps,
        { step: 'Database Connection', status: 'passed', details: 'Connected to PostgreSQL' },
        { step: 'Table Validation', status: 'passed', details: 'Tables plan_upload_years, plan_uploaded_files, plan_programs verified' },
        { step: 'Data Import', status: 'passed', details: `${recordCount} records imported (version v${version})` },
      ];

      return res.status(201).json({
        success: true,
        message: `File uploaded successfully. ${recordCount} records imported.`,
        uploadSteps,
        data: { ...upload, record_count: recordCount, validationReport },
      });

    } catch (dbErr) {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

      const errorDetail = classifyDbError(dbErr);

      logger.error('Plan upload database error', {
        pgCode: dbErr.code,
        message: dbErr.message,
        stack: dbErr.stack,
        fileName,
        userId: req.user?.id,
      });

      // Build DB-phase steps
      const dbSteps = [];
      if (dbErr.code === '08006' || dbErr.code === '08001' || dbErr.code === '28P01' || dbErr.code === '57P01') {
        dbSteps.push({ step: 'Database Connection', status: 'failed', details: errorDetail.issue });
        dbSteps.push({ step: 'Table Validation', status: 'skipped', details: 'Skipped — connection failed' });
      } else {
        dbSteps.push({ step: 'Database Connection', status: 'passed', details: 'Connected to PostgreSQL' });
        dbSteps.push({ step: 'Table Validation', status: 'failed', details: errorDetail.issue });
      }
      dbSteps.push({ step: 'Data Import', status: 'skipped', details: 'Import stopped due to database error' });

      return res.status(500).json({
        success: false,
        message: errorDetail.userMessage,
        errorType: 'DATABASE_ERROR',
        component: 'Database',
        errorDetail,
        uploadSteps: [...excelSteps, ...dbSteps],
        validationReport,
      });
    }

  } catch (err) {
    if (req.file?.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    next(err);
  }
};

exports.getUploads = async (req, res, next) => {
  try {
    const { year, page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let sql = `
      SELECT puf.*, puy.year, u.username as uploaded_by_name
      FROM plan_uploaded_files puf
      JOIN plan_upload_years puy ON puf.year_id = puy.id
      LEFT JOIN users u ON puf.uploaded_by = u.id
    `;
    const params = [];
    if (year) {
      params.push(parseInt(year));
      sql += ` WHERE puy.year = $${params.length}`;
    }
    sql += ` ORDER BY puf.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(parseInt(limit), offset);

    const result = await query(sql, params);

    let countSql = 'SELECT COUNT(*) FROM plan_uploaded_files puf JOIN plan_upload_years puy ON puf.year_id=puy.id';
    const countParams = [];
    if (year) { countParams.push(parseInt(year)); countSql += ` WHERE puy.year=$1`; }
    const countResult = await query(countSql, countParams);

    res.json({
      success: true,
      data: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(countResult.rows[0].count),
        pages: Math.ceil(parseInt(countResult.rows[0].count) / parseInt(limit)),
      },
    });
  } catch (err) { next(err); }
};

exports.getUploadById = async (req, res, next) => {
  try {
    const result = await query(
      `SELECT puf.*, puy.year, u.username as uploaded_by_name
       FROM plan_uploaded_files puf
       JOIN plan_upload_years puy ON puf.year_id = puy.id
       LEFT JOIN users u ON puf.uploaded_by = u.id
       WHERE puf.id = $1`, [req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ success: false, message: 'Upload not found' });
    res.json({ success: true, data: result.rows[0] });
  } catch (err) { next(err); }
};

exports.deleteUpload = async (req, res, next) => {
  try {
    const result = await query('SELECT * FROM plan_uploaded_files WHERE id=$1', [req.params.id]);
    if (!result.rows.length) return res.status(404).json({ success: false, message: 'Upload not found' });
    const upload = result.rows[0];
    if (upload.file_path && fs.existsSync(upload.file_path)) fs.unlinkSync(upload.file_path);
    await query('DELETE FROM plan_programs WHERE upload_id=$1', [req.params.id]);
    await query('DELETE FROM plan_uploaded_files WHERE id=$1', [req.params.id]);
    await logAudit(req.user.id, 'PLAN_DELETE_UPLOAD', 'plan_uploaded_files', parseInt(req.params.id),
      { fileName: upload.original_name }, req.ip);
    res.json({ success: true, message: 'Upload deleted successfully' });
  } catch (err) { next(err); }
};

exports.getYears = async (req, res, next) => {
  try {
    const result = await query(
      `SELECT puy.*, COUNT(puf.id) as upload_count
       FROM plan_upload_years puy
       LEFT JOIN plan_uploaded_files puf ON puy.id = puf.year_id
       GROUP BY puy.id ORDER BY puy.year DESC`
    );
    res.json({ success: true, data: result.rows });
  } catch (err) { next(err); }
};
