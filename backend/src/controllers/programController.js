const { query, getClient } = require('../config/database');
const { logAudit } = require('../middleware/auditLogger');

const PROGRAM_FIELDS = [
  'dept','program_name','pm_responsible','program_code','baseline',
  'baseline_start','baseline_end','funding_source','funding_source_ref',
  'approved_budget_ke','actual_budget_ke','estimated_hrs','actual_hrs',
  'effort_variance','productivity_index','total_effort_saved','total_cost_saved',
  'reuse_library','tech_competency','ai_copilot','automation_testing',
  'automation_reviews','automation_cicd','automation_others','simulators_tools',
  'sdlc_improvement','inefficiency_reduction','material_cost_reduction',
  'other_cost_savings','opportunities_outcomes','remarks','fy_ending','efficiency_pct'
];

exports.getPrograms = async (req, res, next) => {
  try {
    const { uploadId, page = 1, limit = 10, search = '', sort = 'row_number', order = 'asc',
            dept, fundingSource, fyYear } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const params = [];
    const conditions = [];

    if (uploadId) { params.push(parseInt(uploadId)); conditions.push(`p.upload_id = $${params.length}`); }
    if (search) {
      params.push(`%${search}%`);
      conditions.push(`(p.program_name ILIKE $${params.length} OR p.dept ILIKE $${params.length} OR p.pm_responsible ILIKE $${params.length} OR p.program_code ILIKE $${params.length})`);
    }
    if (dept) { params.push(dept); conditions.push(`p.dept = $${params.length}`); }
    if (fundingSource) { params.push(fundingSource); conditions.push(`p.funding_source = $${params.length}`); }
    if (fyYear) { params.push(`${fyYear}%`); conditions.push(`p.fy_ending::text LIKE $${params.length}`); }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const allowedSorts = ['row_number','dept','program_name','estimated_hrs','actual_hrs','efficiency_pct','productivity_index','baseline_start'];
    const sortCol = allowedSorts.includes(sort) ? sort : 'row_number';
    const sortDir = order === 'desc' ? 'DESC' : 'ASC';

    const dataParams = [...params, parseInt(limit), offset];
    const result = await query(
      `SELECT p.*, uf.dataset_name, uy.year FROM programs p
       LEFT JOIN uploaded_files uf ON p.upload_id = uf.id
       LEFT JOIN upload_years uy ON uf.year_id = uy.id
       ${where} ORDER BY p.${sortCol} ${sortDir} LIMIT $${dataParams.length - 1} OFFSET $${dataParams.length}`,
      dataParams
    );
    const countResult = await query(`SELECT COUNT(*) FROM programs p ${where}`, params);

    res.json({
      success: true,
      data: result.rows,
      pagination: {
        page: parseInt(page), limit: parseInt(limit),
        total: parseInt(countResult.rows[0].count),
        pages: Math.ceil(parseInt(countResult.rows[0].count) / parseInt(limit)),
      },
    });
  } catch (err) { next(err); }
};

exports.getProgramById = async (req, res, next) => {
  try {
    const result = await query('SELECT * FROM programs WHERE id=$1', [req.params.id]);
    if (!result.rows.length) return res.status(404).json({ success: false, message: 'Program not found' });
    res.json({ success: true, data: result.rows[0] });
  } catch (err) { next(err); }
};

exports.createProgram = async (req, res, next) => {
  try {
    const { uploadId, ...fields } = req.body;
    if (!uploadId) return res.status(400).json({ success: false, message: 'uploadId is required' });

    const cols = PROGRAM_FIELDS.filter(f => fields[f] !== undefined);
    const vals = cols.map(f => fields[f] === '' ? null : fields[f]);
    const placeholders = vals.map((_, i) => `$${i + 2}`);

    const result = await query(
      `INSERT INTO programs (upload_id, is_manual, ${cols.join(',')})
       VALUES ($1, true, ${placeholders.join(',')}) RETURNING *`,
      [uploadId, ...vals]
    );
    await logAudit(req.user.id, 'CREATE_PROGRAM', 'programs', result.rows[0].id, fields, req.ip);
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) { next(err); }
};

exports.updateProgram = async (req, res, next) => {
  try {
    const existing = await query('SELECT id FROM programs WHERE id=$1', [req.params.id]);
    if (!existing.rows.length) return res.status(404).json({ success: false, message: 'Program not found' });

    const fields = req.body;
    const cols = PROGRAM_FIELDS.filter(f => fields[f] !== undefined);
    const vals = cols.map(f => fields[f] === '' ? null : fields[f]);
    const sets = cols.map((c, i) => `${c}=$${i + 1}`);

    const result = await query(
      `UPDATE programs SET ${sets.join(',')}, updated_at=NOW() WHERE id=$${vals.length + 1} RETURNING *`,
      [...vals, req.params.id]
    );
    await logAudit(req.user.id, 'UPDATE_PROGRAM', 'programs', parseInt(req.params.id), fields, req.ip);
    res.json({ success: true, data: result.rows[0] });
  } catch (err) { next(err); }
};

exports.deleteProgram = async (req, res, next) => {
  try {
    const result = await query('DELETE FROM programs WHERE id=$1 RETURNING id', [req.params.id]);
    if (!result.rows.length) return res.status(404).json({ success: false, message: 'Program not found' });
    await logAudit(req.user.id, 'DELETE_PROGRAM', 'programs', parseInt(req.params.id), {}, req.ip);
    res.json({ success: true, message: 'Program deleted' });
  } catch (err) { next(err); }
};

exports.bulkDelete = async (req, res, next) => {
  try {
    const { ids } = req.body;
    if (!ids?.length) return res.status(400).json({ success: false, message: 'No IDs provided' });
    await query('DELETE FROM programs WHERE id = ANY($1)', [ids]);
    await logAudit(req.user.id, 'BULK_DELETE_PROGRAMS', 'programs', null, { ids }, req.ip);
    res.json({ success: true, message: `${ids.length} programs deleted` });
  } catch (err) { next(err); }
};

exports.getFilterOptions = async (req, res, next) => {
  try {
    const [depts, funding, fys] = await Promise.all([
      query('SELECT DISTINCT dept FROM programs WHERE dept IS NOT NULL ORDER BY dept'),
      query('SELECT DISTINCT funding_source FROM programs WHERE funding_source IS NOT NULL ORDER BY funding_source'),
      query("SELECT DISTINCT EXTRACT(YEAR FROM fy_ending) as fy FROM programs WHERE fy_ending IS NOT NULL ORDER BY fy"),
    ]);
    res.json({
      success: true,
      data: {
        departments: depts.rows.map(r => r.dept),
        fundingSources: funding.rows.map(r => r.funding_source),
        fyYears: fys.rows.map(r => r.fy),
      },
    });
  } catch (err) { next(err); }
};
