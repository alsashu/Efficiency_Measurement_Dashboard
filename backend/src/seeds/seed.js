require('dotenv').config();
const path = require('path');
const bcrypt = require('bcryptjs');
const XLSX = require('xlsx');
const { pool } = require('../config/database');

// ── Inline Excel parsing (mirrors excelService fixes) ──────────────────────
const parseDate = (val) => {
  if (!val) return null;
  if (val instanceof Date) return val.toISOString().split('T')[0];
  if (typeof val === 'number') {
    const d = XLSX.SSF.parse_date_code(val);
    if (d) return `${d.y}-${String(d.m).padStart(2,'0')}-${String(d.d).padStart(2,'0')}`;
  }
  if (typeof val === 'string') {
    const d = new Date(val);
    if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
  }
  return null;
};
const parseNum = (val) => {
  if (val === null || val === undefined || val === '') return null;
  const n = parseFloat(val);
  return isNaN(n) ? null : n;
};
const parseStr = (val) => {
  if (val === null || val === undefined) return null;
  const s = String(val).trim();
  return s === '' ? null : s;
};

const parseExcelRecords = (filePath) => {
  const wb = XLSX.readFile(filePath, { cellDates: false });
  const ws = wb.Sheets['Sheet2'];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true });

  // Header row is row index 3 (Excel row 4)
  const headers = rows[3];
  const records = [];

  const get = (row, keywords) => {
    const idx = headers.findIndex(h => h && keywords.some(k => String(h).toLowerCase().includes(k.toLowerCase())));
    return idx >= 0 ? row[idx] : null;
  };

  for (let i = 4; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.every(v => v === null || v === '')) continue;

    const dept = parseStr(get(row, ['dept']));
    const programName = parseStr(get(row, ['program name', 'program']));
    if (!dept && !programName) continue;

    records.push({
      dept,
      program_name: programName,
      pm_responsible: parseStr(get(row, ['pm responsible', 'pm', 'responsible'])),
      program_code: parseStr(get(row, ['program code', 'code'])),
      baseline: parseStr(get(row, ['baseline'])),
      baseline_start: parseDate(get(row, ['baseline start', 'start'])),
      baseline_end: parseDate(get(row, ['baseline end', 'end'])),
      funding_source: parseStr(get(row, ['funding source (', 'funding source'])),
      funding_source_ref: parseStr(get(row, ['funding source ref'])),
      approved_budget_ke: parseNum(get(row, ['approved budget', 'approved'])),
      actual_budget_ke: parseNum(get(row, ['actual budget', 'actual budget'])),
      estimated_hrs: parseNum(get(row, ['estimated hrs', 'estimated h'])),
      actual_hrs: parseNum(get(row, ['actual hrs', 'actual h'])),
      effort_variance: parseNum(get(row, ['effort variance', 'variance'])),
      productivity_index: parseNum(get(row, ['productivity index', 'productivity'])),
      total_effort_saved: parseNum(get(row, ['total effort saved', 'effort saved'])),
      total_cost_saved: parseNum(get(row, ['total cost saved', 'cost saved'])),
      reuse_library: parseNum(get(row, ['reuse of reference', 'reuse'])),
      tech_competency: parseNum(get(row, ['technical competency', 'competency'])),
      ai_copilot: parseNum(get(row, ['ai assisted', 'copilot', 'ai '])),
      automation_testing: parseNum(get(row, ['automation of testing', 'testing'])),
      automation_reviews: parseNum(get(row, ['automation of reviews', 'reviews'])),
      automation_cicd: parseNum(get(row, ['automation of build', 'ci/cd', 'cicd'])),
      automation_others: parseNum(get(row, ['automation - others', 'automation other'])),
      simulators_tools: parseNum(get(row, ['simulators', 'tools / infra'])),
      sdlc_improvement: parseNum(get(row, ['sdlc', 'process improvement', 'leaner'])),
      inefficiency_reduction: parseNum(get(row, ['inefficiency', 'reducing inefficiency'])),
      material_cost_reduction: parseNum(get(row, ['material cost', 'hardware, license'])),
      other_cost_savings: parseNum(get(row, ['others cost', 'other cost'])),
      // Column 29 has a null header (merged cell) — access by fixed position
      opportunities_outcomes: parseStr(row[29]),
      remarks: parseStr(get(row, ['remarks'])),
      fy_ending: parseDate(get(row, ['fy ending', 'fy end'])),
      efficiency_pct: parseNum(get(row, ['% efficiency', 'efficiency w.r.t'])),
      row_number: i - 3,
    });
  }
  return records;
};
// ──────────────────────────────────────────────────────────────────────────

const seedData = async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Roles
    await client.query(`
      INSERT INTO roles (name, description, permissions) VALUES
      ('admin', 'Full system access', '["all"]'),
      ('manager', 'View and edit access', '["read","write","upload"]'),
      ('viewer', 'Read-only access', '["read"]')
      ON CONFLICT (name) DO NOTHING
    `);

    const adminPw = await bcrypt.hash(process.env.ADMIN_PASSWORD || 'Admin@123456', 12);
    const adminRole = await client.query("SELECT id FROM roles WHERE name='admin'");
    const managerRole = await client.query("SELECT id FROM roles WHERE name='manager'");
    const viewerRole = await client.query("SELECT id FROM roles WHERE name='viewer'");

    await client.query(`
      INSERT INTO users (username, email, password_hash, role_id, first_name, last_name) VALUES
      ($1, $2, $3, $4, 'System', 'Admin')
      ON CONFLICT (username) DO NOTHING`,
      ['admin', process.env.ADMIN_EMAIL || 'admin@tc-efficiency.com', adminPw, adminRole.rows[0].id]
    );

    const mgPw = await bcrypt.hash('Manager@123', 12);
    await client.query(`
      INSERT INTO users (username, email, password_hash, role_id, first_name, last_name) VALUES
      ('manager', 'manager@tc-efficiency.com', $1, $2, 'Program', 'Manager')
      ON CONFLICT (username) DO NOTHING`, [mgPw, managerRole.rows[0].id]);

    const vwPw = await bcrypt.hash('Viewer@123', 12);
    await client.query(`
      INSERT INTO users (username, email, password_hash, role_id, first_name, last_name) VALUES
      ('viewer', 'viewer@tc-efficiency.com', $1, $2, 'Report', 'Viewer')
      ON CONFLICT (username) DO NOTHING`, [vwPw, viewerRole.rows[0].id]);

    await client.query(`
      INSERT INTO system_settings (key, value, description) VALUES
      ('app_name', '"TC Efficiency Measurement Dashboard"', 'Application name'),
      ('default_page_size', '10', 'Default rows per page'),
      ('max_upload_size', '52428800', 'Max file upload size in bytes')
      ON CONFLICT (key) DO NOTHING
    `);

    await client.query(`
      INSERT INTO kpi_thresholds (name, metric_key, operator, threshold_value, alert_type) VALUES
      ('Low Productivity Index', 'productivity_index', '<', 0.85, 'warning'),
      ('High Effort Variance', 'effort_variance_pct', '>', 15, 'danger'),
      ('Low Efficiency', 'efficiency_pct', '<', 5, 'warning'),
      ('Budget Overrun', 'budget_variance_pct', '>', 10, 'danger')
      ON CONFLICT DO NOTHING
    `);

    await client.query(`
      INSERT INTO upload_years (year) VALUES (2024), (2025), (2026)
      ON CONFLICT (year) DO NOTHING
    `);

    const adminUser = await client.query("SELECT id FROM users WHERE username='admin'");
    const adminId = adminUser.rows[0].id;
    const year2026 = await client.query("SELECT id FROM upload_years WHERE year=2026");
    const yearId = year2026.rows[0].id;

    const existingUpload = await client.query(
      "SELECT id FROM uploaded_files WHERE dataset_name='Initial Seed Data'"
    );
    let uploadId;
    if (!existingUpload.rows.length) {
      const uploadRes = await client.query(`
        INSERT INTO uploaded_files (year_id, file_name, original_name, upload_version, dataset_name, uploaded_by, record_count, status, notes)
        VALUES ($1, 'seed_data.xlsx', 'TC_Efficiency_Measurement_Dashboard.xlsx', 1, 'Initial Seed Data', $2, 0, 'completed', 'Auto-seeded from Excel analysis')
        RETURNING id`, [yearId, adminId]);
      uploadId = uploadRes.rows[0].id;
    } else {
      uploadId = existingUpload.rows[0].id;
    }

    // Parse Excel and clear/re-seed programs
    const excelPath = path.resolve(__dirname, '../../../TC_Efficiency_Measurement_Dashboard.xlsx');
    const records = parseExcelRecords(excelPath);

    await client.query('DELETE FROM programs WHERE upload_id=$1', [uploadId]);

    for (const r of records) {
      await client.query(`
        INSERT INTO programs (upload_id,dept,program_name,pm_responsible,program_code,baseline,
          baseline_start,baseline_end,funding_source,funding_source_ref,approved_budget_ke,
          actual_budget_ke,estimated_hrs,actual_hrs,effort_variance,productivity_index,
          total_effort_saved,total_cost_saved,reuse_library,tech_competency,ai_copilot,
          automation_testing,automation_reviews,automation_cicd,automation_others,
          simulators_tools,sdlc_improvement,inefficiency_reduction,material_cost_reduction,
          other_cost_savings,opportunities_outcomes,remarks,fy_ending,efficiency_pct,row_number)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
                $21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35)`,
        [uploadId, r.dept, r.program_name, r.pm_responsible, r.program_code, r.baseline,
         r.baseline_start, r.baseline_end, r.funding_source, r.funding_source_ref,
         r.approved_budget_ke, r.actual_budget_ke, r.estimated_hrs, r.actual_hrs,
         r.effort_variance, r.productivity_index, r.total_effort_saved, r.total_cost_saved,
         r.reuse_library, r.tech_competency, r.ai_copilot, r.automation_testing,
         r.automation_reviews, r.automation_cicd, r.automation_others, r.simulators_tools,
         r.sdlc_improvement, r.inefficiency_reduction, r.material_cost_reduction,
         r.other_cost_savings, r.opportunities_outcomes, r.remarks, r.fy_ending,
         r.efficiency_pct, r.row_number]
      );
    }

    await client.query('UPDATE uploaded_files SET record_count=$1 WHERE id=$2', [records.length, uploadId]);
    console.log(`Seeded ${records.length} program records from Excel.`);

    await client.query('COMMIT');
    console.log('Seed completed successfully.');
    console.log('\nDefault Credentials:');
    console.log('  Admin   : admin / Admin@123456');
    console.log('  Manager : manager / Manager@123');
    console.log('  Viewer  : viewer / Viewer@123');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Seed failed:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
};

seedData();
