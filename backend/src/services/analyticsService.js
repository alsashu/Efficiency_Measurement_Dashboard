const { query } = require('../config/database');

exports.getKpiAlerts = async () => {
  const thresholds = await query('SELECT * FROM kpi_thresholds WHERE is_active=true');
  const alerts = [];

  for (const t of thresholds.rows) {
    let sql = '';
    if (t.metric_key === 'productivity_index') {
      sql = `SELECT COUNT(*) as count FROM programs WHERE productivity_index ${t.operator} $1 AND productivity_index IS NOT NULL`;
    } else if (t.metric_key === 'efficiency_pct') {
      sql = `SELECT COUNT(*) as count FROM programs WHERE efficiency_pct ${t.operator} $1 AND efficiency_pct IS NOT NULL`;
    }
    if (!sql) continue;
    const result = await query(sql, [t.threshold_value]);
    const count = parseInt(result.rows[0].count);
    if (count > 0) {
      alerts.push({ threshold: t, affectedCount: count, message: `${t.name}: ${count} baselines affected` });
    }
  }
  return alerts;
};
