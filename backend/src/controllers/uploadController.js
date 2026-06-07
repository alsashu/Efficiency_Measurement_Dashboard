const path = require('path');
const fs = require('fs');
const { query } = require('../config/database');
const logger = require('../config/logger');
const { logAudit } = require('../middleware/auditLogger');
const excelService = require('../services/excelService');

exports.upload = async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });

    const { year, datasetName, notes } = req.body;
    if (!year) return res.status(400).json({ success: false, message: 'Year is required' });

    // Ensure year record exists
    let yearResult = await query('SELECT id FROM upload_years WHERE year=$1', [parseInt(year)]);
    if (!yearResult.rows.length) {
      yearResult = await query('INSERT INTO upload_years (year) VALUES ($1) RETURNING id', [parseInt(year)]);
    }
    const yearId = yearResult.rows[0].id;

    // Determine version
    const versionResult = await query(
      'SELECT COALESCE(MAX(upload_version),0)+1 AS next_version FROM uploaded_files WHERE year_id=$1',
      [yearId]
    );
    const version = versionResult.rows[0].next_version;

    // Parse Excel
    const filePath = req.file.path;
    const { records, recordCount } = await excelService.parseExcel(filePath);

    // Create upload record
    const uploadResult = await query(
      `INSERT INTO uploaded_files (year_id, file_name, original_name, file_path, file_size,
        upload_version, dataset_name, uploaded_by, record_count, status, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'completed',$10) RETURNING *`,
      [yearId, req.file.filename, req.file.originalname, filePath, req.file.size,
       version, datasetName || req.file.originalname, req.user.id, recordCount, notes || null]
    );
    const upload = uploadResult.rows[0];

    // Insert program records
    if (records.length) {
      await excelService.insertRecords(upload.id, records);
    }

    await logAudit(req.user.id, 'UPLOAD', 'uploaded_files', upload.id,
      { fileName: req.file.originalname, year, version, recordCount }, req.ip);

    logger.info('File uploaded', { uploadId: upload.id, fileName: req.file.originalname, userId: req.user.id });

    res.status(201).json({
      success: true,
      message: `File uploaded successfully. ${recordCount} records imported.`,
      data: { ...upload, record_count: recordCount },
    });
  } catch (err) {
    if (req.file?.path && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    next(err);
  }
};

exports.getUploads = async (req, res, next) => {
  try {
    const { year, page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let sql = `
      SELECT uf.*, uy.year, u.username as uploaded_by_name
      FROM uploaded_files uf
      JOIN upload_years uy ON uf.year_id = uy.id
      LEFT JOIN users u ON uf.uploaded_by = u.id
    `;
    const params = [];
    if (year) {
      params.push(parseInt(year));
      sql += ` WHERE uy.year = $${params.length}`;
    }
    sql += ` ORDER BY uf.created_at DESC LIMIT $${params.length+1} OFFSET $${params.length+2}`;
    params.push(parseInt(limit), offset);

    const result = await query(sql, params);

    let countSql = 'SELECT COUNT(*) FROM uploaded_files uf JOIN upload_years uy ON uf.year_id=uy.id';
    const countParams = [];
    if (year) { countParams.push(parseInt(year)); countSql += ` WHERE uy.year=$1`; }
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
      `SELECT uf.*, uy.year, u.username as uploaded_by_name
       FROM uploaded_files uf
       JOIN upload_years uy ON uf.year_id = uy.id
       LEFT JOIN users u ON uf.uploaded_by = u.id
       WHERE uf.id = $1`, [req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ success: false, message: 'Upload not found' });
    res.json({ success: true, data: result.rows[0] });
  } catch (err) { next(err); }
};

exports.deleteUpload = async (req, res, next) => {
  try {
    const result = await query('SELECT * FROM uploaded_files WHERE id=$1', [req.params.id]);
    if (!result.rows.length) return res.status(404).json({ success: false, message: 'Upload not found' });
    const upload = result.rows[0];
    if (upload.file_path && fs.existsSync(upload.file_path)) fs.unlinkSync(upload.file_path);
    await query('DELETE FROM programs WHERE upload_id=$1', [req.params.id]);
    await query('DELETE FROM uploaded_files WHERE id=$1', [req.params.id]);
    await logAudit(req.user.id, 'DELETE_UPLOAD', 'uploaded_files', parseInt(req.params.id),
      { fileName: upload.original_name }, req.ip);
    res.json({ success: true, message: 'Upload deleted successfully' });
  } catch (err) { next(err); }
};

exports.getYears = async (req, res, next) => {
  try {
    const result = await query(
      `SELECT uy.*, COUNT(uf.id) as upload_count
       FROM upload_years uy
       LEFT JOIN uploaded_files uf ON uy.id = uf.year_id
       GROUP BY uy.id ORDER BY uy.year DESC`
    );
    res.json({ success: true, data: result.rows });
  } catch (err) { next(err); }
};

exports.compareUploads = async (req, res, next) => {
  try {
    const { upload1, upload2 } = req.query;
    if (!upload1 || !upload2) return res.status(400).json({ success: false, message: 'Both upload IDs required' });

    const id1 = parseInt(upload1, 10);
    const id2 = parseInt(upload2, 10);
    if (isNaN(id1) || isNaN(id2)) return res.status(400).json({ success: false, message: 'Upload IDs must be integers' });

    const [r1, r2] = await Promise.all([
      query('SELECT * FROM programs WHERE upload_id=$1::integer ORDER BY row_number', [id1]),
      query('SELECT * FROM programs WHERE upload_id=$1::integer ORDER BY row_number', [id2]),
    ]);

    const map1 = new Map(r1.rows.map(r => [`${r.program_code}-${r.baseline}`, r]));
    const map2 = new Map(r2.rows.map(r => [`${r.program_code}-${r.baseline}`, r]));

    const added = [], removed = [], modified = [];
    const numFields = ['estimated_hrs','actual_hrs','effort_variance','productivity_index',
      'total_effort_saved','total_cost_saved','efficiency_pct'];

    for (const [key, row] of map2) {
      if (!map1.has(key)) { added.push(row); continue; }
      const old = map1.get(key);
      const changes = {};
      for (const f of numFields) {
        const v1 = parseFloat(old[f]) || 0, v2 = parseFloat(row[f]) || 0;
        if (v1 !== v2) changes[f] = { from: v1, to: v2, delta: v2 - v1 };
      }
      if (Object.keys(changes).length) modified.push({ ...row, changes });
    }
    for (const [key, row] of map1) {
      if (!map2.has(key)) removed.push(row);
    }

    res.json({ success: true, data: { added, removed, modified, summary: { added: added.length, removed: removed.length, modified: modified.length } } });
  } catch (err) { next(err); }
};
