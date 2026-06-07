const { query } = require('../config/database');
const analyticsService = require('../services/analyticsService');
const aiInsightsService = require('../services/aiInsightsService');

const buildWhereClause = (params, uploadId, year, dept) => {
  const conditions = ['1=1'];
  if (uploadId) { params.push(parseInt(uploadId)); conditions.push(`p.upload_id=$${params.length}`); }
  if (year) {
    params.push(parseInt(year));
    conditions.push(`EXTRACT(YEAR FROM p.fy_ending)=$${params.length} OR EXTRACT(YEAR FROM p.baseline_start)=$${params.length} OR EXTRACT(YEAR FROM p.baseline_end)=$${params.length}`);
  }
  if (dept) { params.push(dept); conditions.push(`p.dept=$${params.length}`); }
  return conditions.join(' AND ');
};

exports.getSummary = async (req, res, next) => {
  try {
    const { uploadId, year } = req.query;
    const params = [];
    const where = buildWhereClause(params, uploadId, year, null);

    const result = await query(`
      SELECT
        COUNT(*) as total_baselines,
        COUNT(DISTINCT program_name) as total_programs,
        COUNT(DISTINCT dept) as total_departments,
        COALESCE(SUM(estimated_hrs),0) as total_estimated_hrs,
        COALESCE(SUM(actual_hrs),0) as total_actual_hrs,
        COALESCE(SUM(estimated_hrs)-SUM(actual_hrs),0) as total_effort_variance,
        COALESCE(AVG(NULLIF(productivity_index,0)),0) as avg_productivity_index,
        COALESCE(SUM(total_effort_saved),0) as total_effort_saved,
        COALESCE(SUM(total_cost_saved),0) as total_cost_saved,
        COALESCE(SUM(approved_budget_ke),0) as total_approved_budget_ke,
        COALESCE(SUM(actual_budget_ke),0) as total_actual_budget_ke,
        COALESCE(AVG(NULLIF(efficiency_pct,0))*100,0) as avg_efficiency_pct,
        COALESCE(SUM(ai_copilot),0) as total_ai_hrs,
        COALESCE(SUM(automation_testing),0) as total_test_automation_hrs,
        COALESCE(SUM(automation_cicd),0) as total_cicd_hrs,
        COUNT(CASE WHEN productivity_index < 1 THEN 1 END) as overbudget_count,
        COUNT(CASE WHEN productivity_index >= 1 THEN 1 END) as onbudget_count
      FROM programs p WHERE ${where}`, params);

    res.json({ success: true, data: result.rows[0] });
  } catch (err) { next(err); }
};

exports.getByDepartment = async (req, res, next) => {
  try {
    const { uploadId, year } = req.query;
    const params = [];
    const where = buildWhereClause(params, uploadId, year, null);

    const result = await query(`
      SELECT dept,
        COUNT(*) as baselines,
        COUNT(DISTINCT program_name) as programs,
        COALESCE(SUM(estimated_hrs),0) as estimated_hrs,
        COALESCE(SUM(actual_hrs),0) as actual_hrs,
        COALESCE(SUM(estimated_hrs)-SUM(actual_hrs),0) as effort_variance,
        COALESCE(AVG(NULLIF(productivity_index,0)),0) as avg_pi,
        COALESCE(SUM(total_effort_saved),0) as effort_saved,
        COALESCE(SUM(total_cost_saved),0) as cost_saved,
        COALESCE(AVG(NULLIF(efficiency_pct,0))*100,0) as avg_efficiency,
        COALESCE(SUM(approved_budget_ke),0) as approved_budget,
        COALESCE(SUM(actual_budget_ke),0) as actual_budget
      FROM programs p WHERE ${where} AND dept IS NOT NULL
      GROUP BY dept ORDER BY effort_saved DESC`, params);

    res.json({ success: true, data: result.rows });
  } catch (err) { next(err); }
};

exports.getByProgram = async (req, res, next) => {
  try {
    const { uploadId, year, dept } = req.query;
    const params = [];
    const where = buildWhereClause(params, uploadId, year, dept);

    const result = await query(`
      SELECT program_name, dept, program_code,
        COUNT(*) as baselines,
        COALESCE(SUM(estimated_hrs),0) as estimated_hrs,
        COALESCE(SUM(actual_hrs),0) as actual_hrs,
        COALESCE(SUM(total_effort_saved),0) as effort_saved,
        COALESCE(SUM(total_cost_saved),0) as cost_saved,
        COALESCE(AVG(NULLIF(productivity_index,0)),0) as avg_pi,
        COALESCE(MAX(efficiency_pct)*100,0) as max_efficiency,
        COALESCE(SUM(efficiency_pct)*100/NULLIF(COUNT(*),0),0) as avg_efficiency,
        MIN(baseline_start) as first_start, MAX(baseline_end) as last_end
      FROM programs p WHERE ${where} AND program_name IS NOT NULL
      GROUP BY program_name, dept, program_code ORDER BY effort_saved DESC`, params);

    res.json({ success: true, data: result.rows });
  } catch (err) { next(err); }
};

exports.getOpportunities = async (req, res, next) => {
  try {
    const { uploadId, year } = req.query;
    const params = [];
    const where = buildWhereClause(params, uploadId, year, null);

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
      FROM programs p WHERE ${where}`, params);

    const row = result.rows[0];
    const categories = [
      { name: 'Automation of Testing', key: 'automation_testing', value: parseFloat(row.automation_testing) },
      { name: 'CI/CD & Build/Release', key: 'automation_cicd', value: parseFloat(row.automation_cicd) },
      { name: 'Automation - Others', key: 'automation_others', value: parseFloat(row.automation_others) },
      { name: 'AI Assisted / Copilot', key: 'ai_copilot', value: parseFloat(row.ai_copilot) },
      { name: 'Simulators / Tools', key: 'simulators_tools', value: parseFloat(row.simulators_tools) },
      { name: 'SDLC Improvement', key: 'sdlc_improvement', value: parseFloat(row.sdlc_improvement) },
      { name: 'Reference Library Reuse', key: 'reuse_library', value: parseFloat(row.reuse_library) },
      { name: 'Tech Competency', key: 'tech_competency', value: parseFloat(row.tech_competency) },
      { name: 'Automation of Reviews', key: 'automation_reviews', value: parseFloat(row.automation_reviews) },
      { name: 'Reducing Inefficiency', key: 'inefficiency_reduction', value: parseFloat(row.inefficiency_reduction) },
    ].sort((a, b) => b.value - a.value);

    const total = categories.reduce((s, c) => s + c.value, 0);
    res.json({
      success: true,
      data: categories.map(c => ({ ...c, percentage: total > 0 ? (c.value / total * 100).toFixed(1) : 0 })),
    });
  } catch (err) { next(err); }
};

exports.getTrends = async (req, res, next) => {
  try {
    const { uploadId, year } = req.query;
    const params = [];
    const conditions = ['baseline_start IS NOT NULL'];

    if (uploadId) {
      params.push(parseInt(uploadId));
      conditions.push(`p.upload_id=$${params.length}`);
    }
    if (year) {
      params.push(parseInt(year));
      conditions.push(`(EXTRACT(YEAR FROM p.fy_ending)=$${params.length} OR EXTRACT(YEAR FROM p.baseline_start)=$${params.length} OR EXTRACT(YEAR FROM p.baseline_end)=$${params.length})`);
    }
    const where = `WHERE ${conditions.join(' AND ')}`;

    const quarterly = await query(`
      SELECT
        EXTRACT(YEAR FROM baseline_start)::integer as year,
        EXTRACT(QUARTER FROM baseline_start)::integer as quarter,
        COUNT(*) as baselines,
        COALESCE(SUM(estimated_hrs),0) as estimated_hrs,
        COALESCE(SUM(actual_hrs),0) as actual_hrs,
        COALESCE(SUM(total_effort_saved),0) as effort_saved,
        COALESCE(AVG(NULLIF(efficiency_pct,0))*100,0) as avg_efficiency
      FROM programs p ${where}
      GROUP BY EXTRACT(YEAR FROM baseline_start), EXTRACT(QUARTER FROM baseline_start)
      ORDER BY EXTRACT(YEAR FROM baseline_start), EXTRACT(QUARTER FROM baseline_start)`, params);

    const yearly = await query(`
      SELECT
        EXTRACT(YEAR FROM baseline_start)::integer as year,
        COUNT(*) as baselines,
        COALESCE(SUM(estimated_hrs),0) as estimated_hrs,
        COALESCE(SUM(actual_hrs),0) as actual_hrs,
        COALESCE(SUM(total_effort_saved),0) as effort_saved,
        COALESCE(SUM(total_cost_saved),0) as cost_saved
      FROM programs p ${where}
      GROUP BY EXTRACT(YEAR FROM baseline_start)
      ORDER BY EXTRACT(YEAR FROM baseline_start)`, params);

    res.json({ success: true, data: { quarterly: quarterly.rows, yearly: yearly.rows } });
  } catch (err) { next(err); }
};

exports.getProductivityHeatmap = async (req, res, next) => {
  try {
    const { uploadId, year } = req.query;
    const params = [];
    const conditions = ['baseline_start IS NOT NULL', 'program_name IS NOT NULL'];

    if (uploadId) {
      params.push(parseInt(uploadId));
      conditions.push(`upload_id=$${params.length}`);
    }
    if (year) {
      params.push(parseInt(year));
      conditions.push(`(EXTRACT(YEAR FROM fy_ending)=$${params.length} OR EXTRACT(YEAR FROM baseline_start)=$${params.length} OR EXTRACT(YEAR FROM baseline_end)=$${params.length})`);
    }
    const where = `WHERE ${conditions.join(' AND ')}`;

    const result = await query(`
      SELECT program_name, dept,
        EXTRACT(YEAR FROM baseline_start)::integer as year,
        EXTRACT(QUARTER FROM baseline_start)::integer as quarter,
        AVG(NULLIF(productivity_index,0)) as avg_pi,
        AVG(NULLIF(efficiency_pct,0))*100 as avg_efficiency
      FROM programs ${where}
      GROUP BY program_name, dept, EXTRACT(YEAR FROM baseline_start), EXTRACT(QUARTER FROM baseline_start)
      ORDER BY EXTRACT(YEAR FROM baseline_start), EXTRACT(QUARTER FROM baseline_start)`, params);

    res.json({ success: true, data: result.rows });
  } catch (err) { next(err); }
};

exports.getAiInsights = async (req, res, next) => {
  try {
    const { uploadId, year } = req.query;
    const insights = await aiInsightsService.generateInsights(uploadId, year);
    res.json({ success: true, data: insights });
  } catch (err) { next(err); }
};

exports.getTopPrograms = async (req, res, next) => {
  try {
    const { uploadId, year, metric = 'effort_saved', limit = 10 } = req.query;
    const params = [];
    const where = buildWhereClause(params, uploadId, year, null);
    const metricMap = {
      effort_saved: 'SUM(total_effort_saved)',
      efficiency: 'AVG(efficiency_pct)*100',
      cost_saved: 'SUM(total_cost_saved)',
      actual_hrs: 'SUM(actual_hrs)',
    };
    const metricSql = metricMap[metric] || metricMap.effort_saved;

    const top = await query(`
      SELECT program_name, dept, ${metricSql} as metric_value, SUM(actual_hrs) as actual_hrs
      FROM programs p WHERE ${where} AND program_name IS NOT NULL
      GROUP BY program_name, dept ORDER BY metric_value DESC LIMIT $${params.length+1}`,
      [...params, parseInt(limit)]);

    const bottom = await query(`
      SELECT program_name, dept, ${metricSql} as metric_value, SUM(actual_hrs) as actual_hrs
      FROM programs p WHERE ${where} AND program_name IS NOT NULL
      GROUP BY program_name, dept ORDER BY metric_value ASC LIMIT $${params.length+1}`,
      [...params, parseInt(limit)]);

    res.json({ success: true, data: { top: top.rows, bottom: bottom.rows } });
  } catch (err) { next(err); }
};
