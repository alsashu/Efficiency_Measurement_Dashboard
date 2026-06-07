const XLSX = require('xlsx');
const { query } = require('../config/database');
const logger = require('../config/logger');

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

exports.parseExcel = async (filePath) => {
  try {
    const wb = XLSX.readFile(filePath, { cellDates: false });

    let targetSheet = wb.SheetNames.find(n => n.toLowerCase().includes('sheet2') || n.toLowerCase().includes('data'));
    if (!targetSheet) targetSheet = wb.SheetNames[wb.SheetNames.length > 1 ? 1 : 0];

    const ws = wb.Sheets[targetSheet];
    // raw:true returns numeric values for %, dates as serial numbers — both handled by parseNum/parseDate
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true });

    // Find the header row (look for 'Dept' as first real column)
    let headerRowIdx = -1;
    for (let i = 0; i < Math.min(rows.length, 10); i++) {
      if (rows[i] && rows[i].some(c => typeof c === 'string' && c.toLowerCase().includes('dept'))) {
        headerRowIdx = i;
        break;
      }
    }

    if (headerRowIdx === -1) {
      logger.warn('Could not find header row in Excel, assuming row 3 (0-indexed)');
      headerRowIdx = 3;
    }

    const headers = rows[headerRowIdx];
    const records = [];

    for (let i = headerRowIdx + 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.every(v => v === null || v === '')) continue;

      const get = (keywords) => {
        const idx = headers.findIndex(h => h && keywords.some(k => String(h).toLowerCase().includes(k.toLowerCase())));
        return idx >= 0 ? row[idx] : null;
      };

      const dept = parseStr(get(['dept']));
      const programName = parseStr(get(['program name', 'program']));
      if (!dept && !programName) continue;

      records.push({
        dept,
        program_name: programName,
        pm_responsible: parseStr(get(['pm responsible', 'pm', 'responsible'])),
        program_code: parseStr(get(['program code', 'code'])),
        baseline: parseStr(get(['baseline'])),
        baseline_start: parseDate(get(['baseline start', 'start'])),
        baseline_end: parseDate(get(['baseline end', 'end'])),
        funding_source: parseStr(get(['funding source (', 'funding source'])),
        funding_source_ref: parseStr(get(['funding source ref', 'ref'])),
        approved_budget_ke: parseNum(get(['approved budget', 'approved'])),
        actual_budget_ke: parseNum(get(['actual budget', 'actual budget'])),
        estimated_hrs: parseNum(get(['estimated hrs', 'estimated h'])),
        actual_hrs: parseNum(get(['actual hrs', 'actual h'])),
        effort_variance: parseNum(get(['effort variance', 'variance'])),
        productivity_index: parseNum(get(['productivity index', 'productivity'])),
        total_effort_saved: parseNum(get(['total effort saved', 'effort saved'])),
        total_cost_saved: parseNum(get(['total cost saved', 'cost saved'])),
        reuse_library: parseNum(get(['reuse of reference', 'reuse'])),
        tech_competency: parseNum(get(['technical competency', 'competency'])),
        ai_copilot: parseNum(get(['ai assisted', 'copilot', 'ai '])),
        automation_testing: parseNum(get(['automation of testing', 'testing'])),
        automation_reviews: parseNum(get(['automation of reviews', 'reviews'])),
        automation_cicd: parseNum(get(['automation of build', 'ci/cd', 'cicd'])),
        automation_others: parseNum(get(['automation - others', 'automation other'])),
        simulators_tools: parseNum(get(['simulators', 'tools / infra'])),
        sdlc_improvement: parseNum(get(['sdlc', 'process improvement', 'leaner'])),
        inefficiency_reduction: parseNum(get(['inefficiency', 'reducing inefficiency'])),
        material_cost_reduction: parseNum(get(['material cost', 'hardware, license'])),
        other_cost_savings: parseNum(get(['others cost', 'other cost'])),
        // Column 29 has a null header (merged cell) — must access by fixed position
        opportunities_outcomes: parseStr(row[29]),
        remarks: parseStr(get(['remarks'])),
        fy_ending: parseDate(get(['fy ending', 'fy end'])),
        efficiency_pct: parseNum(get(['% efficiency', 'efficiency w.r.t'])),
        row_number: i - headerRowIdx,
      });
    }

    logger.info(`Parsed ${records.length} records from Excel sheet: ${targetSheet}`);
    return { records, recordCount: records.length };
  } catch (err) {
    logger.error('Excel parse error', { error: err.message });
    throw new Error(`Failed to parse Excel file: ${err.message}`);
  }
};

exports.insertRecords = async (uploadId, records) => {
  const client = await require('../config/database').getClient();
  try {
    await client.query('BEGIN');
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
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};
