const { query } = require('../config/database');
const { logAudit } = require('../middleware/auditLogger');

exports.getPrograms = async (req, res, next) => {
  try {
    const { uploadId, dept, search, page = 1, limit = 100 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const params = [];
    const conditions = ['1=1'];

    if (uploadId) { params.push(parseInt(uploadId)); conditions.push(`upload_id=$${params.length}`); }
    if (dept) { params.push(dept); conditions.push(`dept=$${params.length}`); }
    if (search) {
      params.push(`%${search}%`);
      conditions.push(`(program_name ILIKE $${params.length} OR dept ILIKE $${params.length} OR program_code ILIKE $${params.length})`);
    }

    const where = conditions.join(' AND ');
    const countResult = await query(`SELECT COUNT(*) FROM plan_programs WHERE ${where}`, params);
    const total = parseInt(countResult.rows[0].count);

    params.push(parseInt(limit), offset);
    const result = await query(
      `SELECT * FROM plan_programs WHERE ${where} ORDER BY row_number ASC, id ASC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    res.json({
      success: true,
      data: result.rows,
      pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / parseInt(limit)) },
    });
  } catch (err) { next(err); }
};

exports.getProgramById = async (req, res, next) => {
  try {
    const result = await query('SELECT * FROM plan_programs WHERE id=$1', [req.params.id]);
    if (!result.rows.length) return res.status(404).json({ success: false, message: 'Record not found' });
    res.json({ success: true, data: result.rows[0] });
  } catch (err) { next(err); }
};

exports.createProgram = async (req, res, next) => {
  try {
    const {
      uploadId, dept, program_name, pm_responsible, program_code, baseline,
      baseline_start, baseline_end, estimated_hrs, actual_hrs, effort_variance,
      productivity_index, total_effort_saved_hrs, total_effort_saved_euros,
      total_cost_saved_euros,
    } = req.body;

    if (!dept || !program_name) {
      return res.status(400).json({ success: false, message: 'dept and program_name are required' });
    }

    const result = await query(
      `INSERT INTO plan_programs (
        upload_id, dept, program_name, pm_responsible, program_code, baseline,
        baseline_start, baseline_end, estimated_hrs, actual_hrs, effort_variance,
        productivity_index, total_effort_saved_hrs, total_effort_saved_euros,
        total_cost_saved_euros, is_manual
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,TRUE) RETURNING *`,
      [
        uploadId || null, dept, program_name, pm_responsible || null, program_code || null,
        baseline || null, baseline_start || null, baseline_end || null,
        estimated_hrs || null, actual_hrs || null, effort_variance || null,
        productivity_index || null, total_effort_saved_hrs || null, total_effort_saved_euros || null,
        total_cost_saved_euros || null,
      ]
    );

    await logAudit(req.user.id, 'PLAN_CREATE', 'plan_programs', result.rows[0].id,
      { program_name, dept }, req.ip);

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) { next(err); }
};

exports.updateProgram = async (req, res, next) => {
  try {
    const existing = await query('SELECT id FROM plan_programs WHERE id=$1', [req.params.id]);
    if (!existing.rows.length) return res.status(404).json({ success: false, message: 'Record not found' });

    const {
      dept, program_name, pm_responsible, program_code, baseline,
      baseline_start, baseline_end, estimated_hrs, actual_hrs, effort_variance,
      productivity_index, total_effort_saved_hrs, total_effort_saved_euros,
      total_cost_saved_euros,
    } = req.body;

    const result = await query(
      `UPDATE plan_programs SET
        dept=COALESCE($1,dept), program_name=COALESCE($2,program_name),
        pm_responsible=COALESCE($3,pm_responsible), program_code=COALESCE($4,program_code),
        baseline=COALESCE($5,baseline), baseline_start=COALESCE($6,baseline_start),
        baseline_end=COALESCE($7,baseline_end), estimated_hrs=COALESCE($8,estimated_hrs),
        actual_hrs=COALESCE($9,actual_hrs), effort_variance=COALESCE($10,effort_variance),
        productivity_index=COALESCE($11,productivity_index),
        total_effort_saved_hrs=COALESCE($12,total_effort_saved_hrs),
        total_effort_saved_euros=COALESCE($13,total_effort_saved_euros),
        total_cost_saved_euros=COALESCE($14,total_cost_saved_euros),
        updated_at=NOW()
       WHERE id=$15 RETURNING *`,
      [
        dept, program_name, pm_responsible, program_code, baseline,
        baseline_start || null, baseline_end || null, estimated_hrs, actual_hrs,
        effort_variance, productivity_index, total_effort_saved_hrs,
        total_effort_saved_euros, total_cost_saved_euros, req.params.id,
      ]
    );

    await logAudit(req.user.id, 'PLAN_UPDATE', 'plan_programs', parseInt(req.params.id),
      req.body, req.ip);

    res.json({ success: true, data: result.rows[0] });
  } catch (err) { next(err); }
};

exports.deleteProgram = async (req, res, next) => {
  try {
    const existing = await query('SELECT id FROM plan_programs WHERE id=$1', [req.params.id]);
    if (!existing.rows.length) return res.status(404).json({ success: false, message: 'Record not found' });
    await query('DELETE FROM plan_programs WHERE id=$1', [req.params.id]);
    await logAudit(req.user.id, 'PLAN_DELETE', 'plan_programs', parseInt(req.params.id), {}, req.ip);
    res.json({ success: true, message: 'Record deleted' });
  } catch (err) { next(err); }
};

exports.getFilterOptions = async (req, res, next) => {
  try {
    const depts = await query('SELECT DISTINCT dept FROM plan_programs WHERE dept IS NOT NULL ORDER BY dept');
    const programs = await query('SELECT DISTINCT program_name FROM plan_programs WHERE program_name IS NOT NULL ORDER BY program_name');
    res.json({ success: true, data: { depts: depts.rows.map(r => r.dept), programs: programs.rows.map(r => r.program_name) } });
  } catch (err) { next(err); }
};
