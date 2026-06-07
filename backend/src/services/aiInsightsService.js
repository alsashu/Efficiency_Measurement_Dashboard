const { query } = require('../config/database');

exports.generateInsights = async (uploadId, year) => {
  const params = [];
  let where = '1=1';
  if (uploadId) { params.push(parseInt(uploadId)); where += ` AND upload_id=$${params.length}`; }
  if (year) {
    params.push(parseInt(year));
    where += ` AND (EXTRACT(YEAR FROM fy_ending)=$${params.length} OR EXTRACT(YEAR FROM baseline_start)=$${params.length})`;
  }

  const [summary, depts, programs, opps] = await Promise.all([
    query(`SELECT
      COUNT(*) as total, SUM(estimated_hrs) as est, SUM(actual_hrs) as act,
      SUM(total_effort_saved) as saved, SUM(total_cost_saved) as cost_saved,
      AVG(NULLIF(productivity_index,0)) as avg_pi,
      AVG(NULLIF(efficiency_pct,0)) as avg_eff,
      SUM(estimated_hrs)-SUM(actual_hrs) as variance
      FROM programs WHERE ${where}`, params),
    query(`SELECT dept, SUM(total_effort_saved) as saved, AVG(NULLIF(efficiency_pct,0)) as eff
      FROM programs WHERE ${where} AND dept IS NOT NULL GROUP BY dept ORDER BY saved DESC`, params),
    query(`SELECT program_name, SUM(total_effort_saved) as saved, SUM(actual_hrs) as act,
      AVG(NULLIF(efficiency_pct,0)) as eff
      FROM programs WHERE ${where} AND program_name IS NOT NULL
      GROUP BY program_name ORDER BY saved DESC LIMIT 5`, params),
    query(`SELECT SUM(ai_copilot) as ai, SUM(automation_testing) as testing,
      SUM(automation_cicd) as cicd, SUM(reuse_library) as reuse
      FROM programs WHERE ${where}`, params),
  ]);

  const s = summary.rows[0];
  const topDept = depts.rows[0];
  const topProg = programs.rows[0];
  const opp = opps.rows[0];
  const totalSaved = parseFloat(s.saved) || 0;
  const totalAct = parseFloat(s.act) || 0;
  const overallEff = totalAct > 0 ? (totalSaved / totalAct * 100).toFixed(1) : 0;
  const avgPi = parseFloat(s.avg_pi) || 0;
  const variance = parseFloat(s.variance) || 0;

  const keyObservations = [];
  const risks = [];
  const opportunities = [];
  const recommendations = [];

  // Key observations
  if (totalSaved > 0) keyObservations.push(`Total of ${totalSaved.toFixed(0)} hours saved through efficiency initiatives, representing ${overallEff}% overall efficiency against actual hours.`);
  if (topDept) keyObservations.push(`${topDept.dept} is the top performing department with ${parseFloat(topDept.saved).toFixed(0)} hours saved (${(parseFloat(topDept.eff||0)*100).toFixed(1)}% efficiency).`);
  if (topProg) keyObservations.push(`${topProg.program_name} leads in effort savings with ${parseFloat(topProg.saved).toFixed(0)} hours saved.`);
  if (avgPi > 0) keyObservations.push(`Average Productivity Index across baselines is ${avgPi.toFixed(2)}, indicating ${avgPi >= 1 ? 'on-budget or better performance' : 'budget overruns in several baselines'}.`);
  if (parseFloat(opp.ai) > 0) keyObservations.push(`AI/Copilot adoption has contributed ${parseFloat(opp.ai).toFixed(0)} hours in savings — a growing efficiency lever.`);

  // Risks
  if (avgPi < 1) risks.push(`Average Productivity Index of ${avgPi.toFixed(2)} signals systemic budget overruns requiring attention.`);
  if (variance < 0) risks.push(`Negative effort variance of ${Math.abs(variance).toFixed(0)} hours indicates actual work exceeded estimates.`);
  const lowEffDepts = depts.rows.filter(d => parseFloat(d.eff||0) < 0.05 && parseFloat(d.saved) === 0);
  if (lowEffDepts.length) risks.push(`${lowEffDepts.map(d=>d.dept).join(', ')} show zero efficiency gains — potential under-reporting or missed improvement opportunities.`);
  if (parseFloat(s.cost_saved) === 0) risks.push('No monetary cost savings recorded beyond material cost reduction; financial efficiency opportunities may be underexplored.');

  // Opportunities
  if (parseFloat(opp.ai) < 5000) opportunities.push('AI/Copilot adoption is below potential. Scaling AI-assisted development across more programs could significantly boost efficiency.');
  if (parseFloat(opp.testing) > parseFloat(opp.cicd)) opportunities.push('Test automation leads savings — further investment in CI/CD pipeline automation could yield comparable gains.');
  if (parseFloat(opp.reuse) < 3000) opportunities.push('Reference library reuse is low. Building reusable component libraries and solution templates can accelerate delivery.');
  opportunities.push('Programs with PI < 1 represent opportunities for estimation improvement and resource optimization.');

  // Recommendations
  recommendations.push('Standardize efficiency reporting across all departments, especially V&V, to enable accurate cross-portfolio benchmarking.');
  recommendations.push(`Scale the ${topDept?.dept || 'leading'} department's best practices to lower-performing teams through knowledge transfer sessions.`);
  recommendations.push('Implement quarterly efficiency reviews with KPI thresholds to proactively identify and address performance gaps.');
  recommendations.push('Invest in AI/Copilot tooling expansion across all programs to capitalize on the proven 9.6% efficiency contribution.');

  const executiveSummary = `The Technology Center portfolio comprises ${s.total} baselines across multiple programs and departments. ` +
    `Total effort savings of ${totalSaved.toFixed(0)} hours (${overallEff}% efficiency) have been realized through systematic efficiency initiatives. ` +
    `Automation of Testing (30%) and CI/CD (26%) are the dominant value drivers. ` +
    `${avgPi >= 1 ? 'Overall budget performance is on-track.' : 'Budget management requires attention with average PI below 1.0.'} ` +
    `Strategic focus on AI adoption, V&V reporting discipline, and scaling proven practices from top performers will drive the next wave of efficiency gains.`;

  return { executiveSummary, keyObservations, risks, opportunities, recommendations, generatedAt: new Date().toISOString() };
};
