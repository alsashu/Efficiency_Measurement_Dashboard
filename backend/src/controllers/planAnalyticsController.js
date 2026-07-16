const { query } = require('../config/database');

/**
 * Builds WHERE clause for plan_programs queries.
 * periodType: 'calendar' | 'financial'
 * periodYear: e.g. 2026
 * uploadId: optional
 */
const buildPlanWhereClause = (params, { uploadId, periodType, periodYear, dept }) => {
  const conditions = ['1=1'];

  if (uploadId) {
    params.push(parseInt(uploadId));
    conditions.push(`p.upload_id=$${params.length}`);
  }

  if (periodYear) {
    const yr = parseInt(periodYear);
    let startDate, endDate;

    if (periodType === 'financial') {
      // Financial Year: April 1 to March 31
      startDate = `${yr}-04-01`;
      endDate = `${yr + 1}-03-31`;
    } else {
      // Calendar Year: Jan 1 to Dec 31
      startDate = `${yr}-01-01`;
      endDate = `${yr}-12-31`;
    }

    params.push(startDate, endDate);
    const sIdx = params.length - 1;
    const eIdx = params.length;
    // Include records whose baseline period overlaps with the selected year period
    conditions.push(
      `(p.baseline_start BETWEEN $${sIdx} AND $${eIdx} OR p.baseline_end BETWEEN $${sIdx} AND $${eIdx} OR (p.baseline_start <= $${sIdx} AND p.baseline_end >= $${eIdx}))`
    );
  }

  if (dept) {
    params.push(dept);
    conditions.push(`p.dept=$${params.length}`);
  }

  return conditions.join(' AND ');
};

exports.getSummary = async (req, res, next) => {
  try {
    const { uploadId, periodType = 'calendar', periodYear, dept } = req.query;
    const params = [];
    const where = buildPlanWhereClause(params, { uploadId, periodType, periodYear, dept });

    const result = await query(`
      SELECT
        COUNT(*) as total_baselines,
        COUNT(DISTINCT program_name) as total_programs,
        COUNT(DISTINCT dept) as total_departments,
        COALESCE(SUM(estimated_hrs),0) as total_estimated_hrs,
        COALESCE(SUM(actual_hrs),0) as total_actual_hrs,
        COALESCE(SUM(effort_variance),0) as total_effort_variance,
        COALESCE(AVG(NULLIF(productivity_index,0)),0) as avg_productivity_index,
        COALESCE(SUM(total_effort_saved_hrs),0) as total_effort_saved_hrs,
        COALESCE(SUM(total_effort_saved_euros),0) as total_effort_saved_euros,
        COALESCE(SUM(total_cost_saved_euros),0) as total_cost_saved_euros,
        COUNT(CASE WHEN productivity_index < 1 THEN 1 END) as overbudget_count,
        COUNT(CASE WHEN productivity_index >= 1 THEN 1 END) as onbudget_count,
        MIN(baseline_start) as earliest_start,
        MAX(baseline_end) as latest_end
      FROM plan_programs p WHERE ${where}`, params);

    res.json({ success: true, data: result.rows[0] });
  } catch (err) { next(err); }
};

exports.getByDepartment = async (req, res, next) => {
  try {
    const { uploadId, periodType = 'calendar', periodYear, dept } = req.query;
    const params = [];
    const where = buildPlanWhereClause(params, { uploadId, periodType, periodYear, dept });

    const result = await query(`
      SELECT dept,
        COUNT(*) as baselines,
        COUNT(DISTINCT program_name) as programs,
        COALESCE(SUM(estimated_hrs),0) as estimated_hrs,
        COALESCE(SUM(actual_hrs),0) as actual_hrs,
        COALESCE(SUM(effort_variance),0) as effort_variance,
        COALESCE(AVG(NULLIF(productivity_index,0)),0) as avg_pi,
        COALESCE(SUM(total_effort_saved_hrs),0) as effort_saved_hrs,
        COALESCE(SUM(total_effort_saved_euros),0) as effort_saved_euros,
        COALESCE(SUM(total_cost_saved_euros),0) as cost_saved_euros
      FROM plan_programs p WHERE ${where} AND dept IS NOT NULL
      GROUP BY dept ORDER BY effort_saved_hrs DESC`, params);

    res.json({ success: true, data: result.rows });
  } catch (err) { next(err); }
};

exports.getByProgram = async (req, res, next) => {
  try {
    const { uploadId, periodType = 'calendar', periodYear, dept } = req.query;
    const params = [];
    const where = buildPlanWhereClause(params, { uploadId, periodType, periodYear, dept });

    const result = await query(`
      SELECT program_name, dept, program_code,
        COUNT(*) as baselines,
        COALESCE(SUM(estimated_hrs),0) as estimated_hrs,
        COALESCE(SUM(actual_hrs),0) as actual_hrs,
        COALESCE(SUM(effort_variance),0) as effort_variance,
        COALESCE(AVG(NULLIF(productivity_index,0)),0) as avg_pi,
        COALESCE(SUM(total_effort_saved_hrs),0) as effort_saved_hrs,
        COALESCE(SUM(total_effort_saved_euros),0) as effort_saved_euros,
        COALESCE(SUM(total_cost_saved_euros),0) as cost_saved_euros,
        MIN(baseline_start) as first_start,
        MAX(baseline_end) as last_end
      FROM plan_programs p WHERE ${where} AND program_name IS NOT NULL
      GROUP BY program_name, dept, program_code
      ORDER BY effort_saved_hrs DESC`, params);

    res.json({ success: true, data: result.rows });
  } catch (err) { next(err); }
};

exports.getTrends = async (req, res, next) => {
  try {
    const { uploadId, periodType = 'calendar', periodYear } = req.query;
    const params = [];
    const where = buildPlanWhereClause(params, { uploadId, periodType, periodYear });
    const baselineCondition = where.replace('1=1 AND', '').replace('1=1', '') || '';
    const fullWhere = `baseline_start IS NOT NULL${baselineCondition ? ' AND ' + baselineCondition.replace(/^AND /,'') : ''}`;

    const quarterly = await query(`
      SELECT
        EXTRACT(YEAR FROM baseline_start)::integer as year,
        EXTRACT(QUARTER FROM baseline_start)::integer as quarter,
        COUNT(*) as baselines,
        COALESCE(SUM(estimated_hrs),0) as estimated_hrs,
        COALESCE(SUM(actual_hrs),0) as actual_hrs,
        COALESCE(SUM(total_effort_saved_hrs),0) as effort_saved_hrs
      FROM plan_programs p WHERE ${where.includes('baseline_start') ? where : where + ' AND baseline_start IS NOT NULL'}
      GROUP BY EXTRACT(YEAR FROM baseline_start), EXTRACT(QUARTER FROM baseline_start)
      ORDER BY year, quarter`, params);

    const yearly = await query(`
      SELECT
        EXTRACT(YEAR FROM baseline_start)::integer as year,
        COUNT(*) as baselines,
        COALESCE(SUM(estimated_hrs),0) as estimated_hrs,
        COALESCE(SUM(actual_hrs),0) as actual_hrs,
        COALESCE(SUM(total_effort_saved_hrs),0) as effort_saved_hrs,
        COALESCE(SUM(total_cost_saved_euros),0) as cost_saved_euros
      FROM plan_programs p WHERE ${where.includes('baseline_start') ? where : where + ' AND baseline_start IS NOT NULL'}
      GROUP BY EXTRACT(YEAR FROM baseline_start)
      ORDER BY year`, params);

    res.json({ success: true, data: { quarterly: quarterly.rows, yearly: yearly.rows } });
  } catch (err) { next(err); }
};

exports.getTopPrograms = async (req, res, next) => {
  try {
    const { uploadId, periodType = 'calendar', periodYear, metric = 'effort_saved', limit = 10 } = req.query;
    const params = [];
    const where = buildPlanWhereClause(params, { uploadId, periodType, periodYear });

    const metricMap = {
      effort_saved: 'SUM(total_effort_saved_hrs)',
      effort_saved_euros: 'SUM(total_effort_saved_euros)',
      cost_saved: 'SUM(total_cost_saved_euros)',
      actual_hrs: 'SUM(actual_hrs)',
    };
    const metricSql = metricMap[metric] || metricMap.effort_saved;

    const top = await query(`
      SELECT program_name, dept, program_code,
        ${metricSql} as metric_value,
        SUM(estimated_hrs) as estimated_hrs,
        SUM(actual_hrs) as actual_hrs
      FROM plan_programs p WHERE ${where} AND program_name IS NOT NULL
      GROUP BY program_name, dept, program_code
      ORDER BY metric_value DESC NULLS LAST LIMIT $${params.length + 1}`,
      [...params, parseInt(limit)]);

    res.json({ success: true, data: { top: top.rows } });
  } catch (err) { next(err); }
};

exports.getKpiDetail = async (req, res, next) => {
  try {
    const { uploadId, periodType = 'calendar', periodYear, dept } = req.query;
    const params = [];
    const where = buildPlanWhereClause(params, { uploadId, periodType, periodYear, dept });

    // Per-program breakdown — STRING_AGG to collect distinct PMs per program group
    const programsResult = await query(`
      SELECT
        program_name,
        dept,
        program_code,
        STRING_AGG(DISTINCT pm_responsible, ', ') as pm_responsible,
        COUNT(*) as baselines,
        COALESCE(SUM(estimated_hrs),0) as estimated_hrs,
        COALESCE(SUM(actual_hrs),0) as actual_hrs,
        COALESCE(SUM(effort_variance),0) as effort_variance,
        COALESCE(AVG(NULLIF(productivity_index,0)),0) as avg_pi,
        COALESCE(SUM(total_effort_saved_hrs),0) as effort_saved_hrs,
        COALESCE(SUM(total_effort_saved_euros),0) as effort_saved_euros,
        COALESCE(SUM(total_cost_saved_euros),0) as cost_saved_euros
      FROM plan_programs p
      WHERE ${where} AND program_name IS NOT NULL
      GROUP BY program_name, dept, program_code
      ORDER BY program_name`, params);

    // Per-department breakdown
    const deptsResult = await query(`
      SELECT
        dept,
        COUNT(DISTINCT program_name)::integer as program_count,
        COALESCE(SUM(estimated_hrs),0) as estimated_hrs,
        COALESCE(SUM(actual_hrs),0) as actual_hrs,
        COALESCE(SUM(effort_variance),0) as effort_variance,
        COALESCE(AVG(NULLIF(productivity_index,0)),0) as avg_pi,
        COALESCE(SUM(total_effort_saved_hrs),0) as effort_saved_hrs,
        COALESCE(SUM(total_effort_saved_euros),0) as effort_saved_euros,
        COALESCE(SUM(total_cost_saved_euros),0) as cost_saved_euros
      FROM plan_programs p
      WHERE ${where} AND dept IS NOT NULL
      GROUP BY dept
      ORDER BY dept`, params);

    res.json({
      success: true,
      data: {
        programs: programsResult.rows,
        departments: deptsResult.rows,
      },
    });
  } catch (err) { next(err); }
};

exports.getOpportunityBreakdown = async (req, res, next) => {
  try {
    const { uploadId, periodType = 'calendar', periodYear, dept } = req.query;
    const params = [];
    const where = buildPlanWhereClause(params, { uploadId, periodType, periodYear, dept });

    const result = await query(`
      SELECT
        COALESCE(SUM(reuse_library),0) as reuse_library,
        COALESCE(SUM(tech_competency),0) as tech_competency,
        COALESCE(SUM(ai_copilot),0) as ai_copilot,
        COALESCE(SUM(automation_testing),0) as automation_testing,
        COALESCE(SUM(automation_reviews),0) as automation_reviews,
        COALESCE(SUM(automation_cicd),0) as automation_cicd,
        COALESCE(SUM(automation_others),0) as automation_others,
        COALESCE(SUM(simulators_tools),0) as simulators_tools,
        COALESCE(SUM(sdlc_improvement),0) as sdlc_improvement,
        COALESCE(SUM(inefficiency_reduction),0) as inefficiency_reduction
      FROM plan_programs p WHERE ${where}`, params);

    const row = result.rows[0];
    const categories = [
      { name: 'Reuse of Reference Library / Solutions', key: 'reuse_library', value: parseFloat(row.reuse_library) },
      { name: 'Technical Competency Improvement', key: 'tech_competency', value: parseFloat(row.tech_competency) },
      { name: 'AI Assisted / Copilot Usage', key: 'ai_copilot', value: parseFloat(row.ai_copilot) },
      { name: 'Automation of Testing (Unit / Component / System)', key: 'automation_testing', value: parseFloat(row.automation_testing) },
      { name: 'Automation of Reviews', key: 'automation_reviews', value: parseFloat(row.automation_reviews) },
      { name: 'Automation of Build & Release Process (CI/CD / DevX)', key: 'automation_cicd', value: parseFloat(row.automation_cicd) },
      { name: 'Automation - Others (if any)', key: 'automation_others', value: parseFloat(row.automation_others) },
      { name: 'Usage of Simulators / Tools / Infrastructure', key: 'simulators_tools', value: parseFloat(row.simulators_tools) },
      { name: 'SDLC Process Improvement / Lean Process', key: 'sdlc_improvement', value: parseFloat(row.sdlc_improvement) },
      { name: 'Opportunities Realized in Reducing Inefficiency', key: 'inefficiency_reduction', value: parseFloat(row.inefficiency_reduction) },
    ].sort((a, b) => b.value - a.value);

    const total = categories.reduce((s, c) => s + c.value, 0);
    res.json({
      success: true,
      data: categories.map(c => ({ ...c, percentage: total > 0 ? parseFloat((c.value / total * 100).toFixed(1)) : 0 })),
    });
  } catch (err) { next(err); }
};

exports.getPeriodOptions = async (req, res, next) => {
  try {
    // Return available years from the data so the frontend can populate year dropdowns
    const result = await query(`
      SELECT
        EXTRACT(YEAR FROM baseline_start)::integer as year
      FROM plan_programs
      WHERE baseline_start IS NOT NULL
      GROUP BY EXTRACT(YEAR FROM baseline_start)
      UNION
      SELECT
        EXTRACT(YEAR FROM baseline_end)::integer as year
      FROM plan_programs
      WHERE baseline_end IS NOT NULL
      GROUP BY EXTRACT(YEAR FROM baseline_end)
      ORDER BY year DESC`);

    const years = result.rows.map(r => r.year).filter(Boolean);

    // Build financial year options (FY spans two calendar years, label as "FY 2025-26")
    const fySet = new Set();
    for (const y of years) {
      // If year has data in Apr-Dec, it can be start of a FY
      fySet.add(y);
      // If year has data in Jan-Mar, previous year started the FY
      fySet.add(y - 1);
    }
    const fyYears = [...fySet].filter(y => y > 0).sort((a, b) => b - a);

    res.json({
      success: true,
      data: {
        calendarYears: years,
        financialYears: fyYears.map(y => ({ value: y, label: `FY ${y}-${String(y + 1).slice(-2)}` })),
      },
    });
  } catch (err) { next(err); }
};
