const XLSX = require('xlsx');
const { query } = require('../config/database');
const logger = require('../config/logger');

// Exact required columns matching TC_Efficiency-Clean.xlsx reference file
// Col 9 has a double space before "(Hours)"; cols 12-14 use lowercase "opportunities"
const CORE_COLUMNS = [
  'Dept',
  'Program Name',
  'PM Responsible',
  'Program Code',
  'Baseline',
  'Baseline Start',
  'Baseline End',
  'Estimated Hrs (Hours)',
  'Actual Hrs  (Hours)',
  'Effort Variance (Hours)',
  'Productivity Index (Hours)',
  'Total Effort Saved from opportunities (Hours)',
  'Total Effort Saved from opportunities (Euros)',
  'Total Cost Saved from opportunities (Euros)',
];

// Opportunity-category breakdown — new columns (Req 1/2). Validated for type/order
// when present, but NOT fatal if missing so older 14-column files keep importing.
const OPPORTUNITY_COLUMNS = [
  'Reuse of Reference Library / Solutions (Hours)',
  'Technical Competency Improvement (Hours)',
  'AI Assisted / Copilot Usage (Hours)',
  'Automation of Testing (Unit / Component / System) (Hours)',
  'Automation of Reviews (Hours)',
  'Automation of Build & Release Process (CI/CD / DevX) (Hours)',
  'Automation - Others (if any) (Hours)',
  'Usage of Simulators / Tools / Infrastructure (Hours)',
  'Software Development Life Cycle (SDLC) Process Improvement / Lean Process (Hours)',
  'Opportunities Realized in Reducing Inefficiency (Hours)',
];

const REQUIRED_COLUMNS = [...CORE_COLUMNS, ...OPPORTUNITY_COLUMNS];

const COLUMN_COUNT = REQUIRED_COLUMNS.length;

const DATE_COLUMNS = new Set(['Baseline Start', 'Baseline End']);
const NUMERIC_COLUMNS = new Set([
  'Estimated Hrs (Hours)',
  'Actual Hrs  (Hours)',
  'Effort Variance (Hours)',
  'Productivity Index (Hours)',
  'Total Effort Saved from opportunities (Hours)',
  'Total Effort Saved from opportunities (Euros)',
  'Total Cost Saved from opportunities (Euros)',
  ...OPPORTUNITY_COLUMNS,
]);
const REQUIRED_FIELDS = new Set(['Dept', 'Program Name']);

// Trim only — preserves exact whitespace for display/comparison
const normalizeHeader = (h) => (h ? String(h).trim() : '');

// Normalized for fuzzy matching: collapse all whitespace, lowercase
const normalizeForCompare = (h) => String(h || '').trim().replace(/\s+/g, ' ').toLowerCase();

const parseDate = (val) => {
  if (!val && val !== 0) return null;
  if (val instanceof Date) return val.toISOString().split('T')[0];
  if (typeof val === 'number') {
    const d = XLSX.SSF.parse_date_code(val);
    if (d) return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
  }
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (!trimmed) return null;
    const d = new Date(trimmed);
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

const isValidDate = (val) => {
  if (!val && val !== 0) return true;
  if (typeof val === 'number') return !!XLSX.SSF.parse_date_code(val);
  if (typeof val === 'string') {
    if (!val.trim()) return true;
    return !isNaN(new Date(val.trim()).getTime());
  }
  if (val instanceof Date) return !isNaN(val.getTime());
  return false;
};

/**
 * Validates and parses a Plan Data Excel file.
 * Returns { valid, errors, warnings, headers, records, recordCount, validationReport }
 *
 * Column matching uses two passes:
 *   1. Exact match — perfect
 *   2. Normalized match (collapsed whitespace, case-insensitive) — accepted with warning
 * This allows the file to pass even with minor formatting variations while still
 * reporting the discrepancy clearly.
 */
exports.validateAndParse = async (filePath) => {
  const errors = [];
  const warnings = [];
  const rowErrors = [];

  let wb;
  try {
    wb = XLSX.readFile(filePath, { cellDates: false });
  } catch (err) {
    const msg = `Cannot read Excel file: ${err.message}`;
    return {
      valid: false, errors: [msg], warnings: [], headers: [], records: [], recordCount: 0,
      validationReport: { passed: false, errors: [msg], warnings: [], rowErrors: [], columnsSummary: [], headersDiagnostic: [] },
    };
  }

  const sheetName = wb.SheetNames[0];
  if (!sheetName) {
    const msg = 'Excel file has no sheets';
    return {
      valid: false, errors: [msg], warnings: [], headers: [], records: [], recordCount: 0,
      validationReport: { passed: false, errors: [msg], warnings: [], rowErrors: [], columnsSummary: [], headersDiagnostic: [] },
    };
  }
  if (wb.SheetNames.length > 1) {
    warnings.push(`File has ${wb.SheetNames.length} sheets. Using first sheet: "${sheetName}".`);
  }

  const ws = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true });

  if (!rows || rows.length === 0) {
    const msg = 'Excel sheet is empty';
    return {
      valid: false, errors: [msg], warnings, headers: [], records: [], recordCount: 0,
      validationReport: { passed: false, errors: [msg], warnings, rowErrors: [], columnsSummary: [], headersDiagnostic: [] },
    };
  }

  // Find header row — first row within first 10 where first non-null cell normalizes to 'dept'
  let headerRowIdx = -1;
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const row = rows[i];
    if (!row) continue;
    const firstCell = row.find(c => c !== null && c !== undefined && String(c).trim() !== '');
    if (firstCell && normalizeForCompare(firstCell) === 'dept') {
      headerRowIdx = i;
      break;
    }
  }

  if (headerRowIdx === -1) {
    const msg = 'Header row not found. Expected first column to be "Dept" in one of the first 10 rows.';
    return {
      valid: false, errors: [msg], warnings, headers: [], records: [], recordCount: 0,
      validationReport: {
        passed: false, errors: [msg], warnings, rowErrors: [],
        columnsSummary: [], headersDiagnostic: [],
      },
    };
  }

  const rawHeaders = rows[headerRowIdx].map(normalizeHeader);

  // Build a normalized-to-index lookup for fuzzy matching
  const normalizedActualMap = new Map(); // normalized → { rawHeader, index }
  rawHeaders.forEach((h, i) => {
    if (h !== '') normalizedActualMap.set(normalizeForCompare(h), { rawHeader: h, index: i });
  });

  // --- Column matching (exact first, then normalized fallback) ---
  const missingColumns = [];
  const presentColumns = new Map(); // canonicalColName → index in rawHeaders
  const headersDiagnostic = []; // per-column detailed match info

  for (let ci = 0; ci < REQUIRED_COLUMNS.length; ci++) {
    const col = REQUIRED_COLUMNS[ci];
    const exactIdx = rawHeaders.findIndex(h => h === col);

    if (exactIdx !== -1) {
      presentColumns.set(col, exactIdx);
      headersDiagnostic.push({
        position: ci + 1,
        expected: col,
        foundAt: exactIdx + 1,
        rawHeader: rawHeaders[exactIdx],
        matchType: 'exact',
        found: true,
      });
    } else {
      // Try normalized match
      const normalizedLookup = normalizeForCompare(col);
      const fuzzy = normalizedActualMap.get(normalizedLookup);
      if (fuzzy) {
        presentColumns.set(col, fuzzy.index);
        warnings.push(
          `Column ${ci + 1} header mismatch — Expected: "${col}" | Found: "${fuzzy.rawHeader}" ` +
          `(whitespace or case difference). Column accepted; consider fixing the header in your file.`
        );
        headersDiagnostic.push({
          position: ci + 1,
          expected: col,
          foundAt: fuzzy.index + 1,
          rawHeader: fuzzy.rawHeader,
          matchType: 'normalized',
          found: true,
        });
      } else {
        missingColumns.push(col);
        headersDiagnostic.push({
          position: ci + 1,
          expected: col,
          foundAt: null,
          rawHeader: null,
          matchType: 'missing',
          found: false,
        });
      }
    }
  }

  const missingCoreColumns = missingColumns.filter(c => CORE_COLUMNS.includes(c));
  const missingOpportunityColumns = missingColumns.filter(c => OPPORTUNITY_COLUMNS.includes(c));

  if (missingCoreColumns.length > 0) {
    // Provide actionable detail: show what headers ARE in the file for comparison
    const availableHeaders = rawHeaders.filter(h => h !== '').join(', ');
    errors.push(
      `Missing ${missingCoreColumns.length} required column(s): ${missingCoreColumns.map(c => `"${c}"`).join(', ')}. ` +
      `Headers found in file: ${availableHeaders}`
    );
  }

  if (missingOpportunityColumns.length > 0) {
    warnings.push(
      `Missing ${missingOpportunityColumns.length} optional opportunity-category column(s): ` +
      `${missingOpportunityColumns.map(c => `"${c}"`).join(', ')}. These are backward-compatible — ` +
      `the file will still import, with these values left blank.`
    );
  }

  // --- Column order check (only for columns that were found) ---
  const presentOrdered = REQUIRED_COLUMNS.filter(c => presentColumns.has(c));
  const actualIndices = presentOrdered.map(c => presentColumns.get(c));
  const orderErrors = [];
  for (let i = 1; i < actualIndices.length; i++) {
    if (actualIndices[i] <= actualIndices[i - 1]) {
      orderErrors.push(
        `"${presentOrdered[i]}" (file position ${actualIndices[i] + 1}) ` +
        `must come after "${presentOrdered[i - 1]}" (file position ${actualIndices[i - 1] + 1})`
      );
    }
  }
  if (orderErrors.length > 0) {
    errors.push(`Column order violations: ${orderErrors.join('; ')}`);
  }

  // Extra column warning
  const nonNullHeaders = rawHeaders.filter(h => h !== '');
  if (nonNullHeaders.length > COLUMN_COUNT) {
    warnings.push(`File has ${nonNullHeaders.length} columns; expected exactly ${COLUMN_COUNT}. Extra columns will be ignored.`);
  }

  // If ALL core columns are missing, stop before row parsing
  if (missingCoreColumns.length === CORE_COLUMNS.length) {
    return {
      valid: false, errors, warnings, headers: rawHeaders, records: [], recordCount: 0,
      validationReport: {
        passed: false, sheetUsed: sheetName, totalRows: 0, validRows: 0,
        errors, warnings, rowErrors: [], columnsSummary: buildColumnsSummary(presentColumns), headersDiagnostic,
      },
    };
  }

  // --- Row-level validation ---
  const records = [];

  for (let i = headerRowIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.every(v => v === null || v === '')) continue;

    const rowNum = i - headerRowIdx; // 1-based data row number

    const getCol = (colName) => {
      const idx = presentColumns.get(colName);
      return idx !== undefined ? row[idx] : null;
    };

    const rowErrs = [];

    // Required field check
    for (const field of REQUIRED_FIELDS) {
      const val = getCol(field);
      if (!val || String(val).trim() === '') {
        rowErrs.push(`Row ${rowNum}: "${field}" is required but empty`);
      }
    }

    // Numeric column validation
    for (const col of NUMERIC_COLUMNS) {
      if (!presentColumns.has(col)) continue;
      const val = getCol(col);
      if (val !== null && val !== undefined && val !== '') {
        if (isNaN(parseFloat(val))) {
          rowErrs.push(`Row ${rowNum}: "${col}" must be a number, got "${val}"`);
        }
      }
    }

    // Date column validation
    for (const col of DATE_COLUMNS) {
      if (!presentColumns.has(col)) continue;
      const val = getCol(col);
      if (val !== null && val !== undefined && val !== '') {
        if (!isValidDate(val)) {
          rowErrs.push(`Row ${rowNum}: "${col}" has invalid date format "${val}"`);
        }
      }
    }

    if (rowErrs.length > 0) rowErrors.push(...rowErrs);

    const dept = parseStr(getCol('Dept'));
    const programName = parseStr(getCol('Program Name'));
    if (!dept && !programName) continue;

    records.push({
      dept,
      program_name: programName,
      pm_responsible: parseStr(getCol('PM Responsible')),
      program_code: parseStr(getCol('Program Code')),
      baseline: parseStr(getCol('Baseline')),
      baseline_start: parseDate(getCol('Baseline Start')),
      baseline_end: parseDate(getCol('Baseline End')),
      estimated_hrs: parseNum(getCol('Estimated Hrs (Hours)')),
      actual_hrs: parseNum(getCol('Actual Hrs  (Hours)')),
      effort_variance: parseNum(getCol('Effort Variance (Hours)')),
      productivity_index: parseNum(getCol('Productivity Index (Hours)')),
      total_effort_saved_hrs: parseNum(getCol('Total Effort Saved from opportunities (Hours)')),
      total_effort_saved_euros: parseNum(getCol('Total Effort Saved from opportunities (Euros)')),
      total_cost_saved_euros: parseNum(getCol('Total Cost Saved from opportunities (Euros)')),
      reuse_library: parseNum(getCol('Reuse of Reference Library / Solutions (Hours)')),
      tech_competency: parseNum(getCol('Technical Competency Improvement (Hours)')),
      ai_copilot: parseNum(getCol('AI Assisted / Copilot Usage (Hours)')),
      automation_testing: parseNum(getCol('Automation of Testing (Unit / Component / System) (Hours)')),
      automation_reviews: parseNum(getCol('Automation of Reviews (Hours)')),
      automation_cicd: parseNum(getCol('Automation of Build & Release Process (CI/CD / DevX) (Hours)')),
      automation_others: parseNum(getCol('Automation - Others (if any) (Hours)')),
      simulators_tools: parseNum(getCol('Usage of Simulators / Tools / Infrastructure (Hours)')),
      sdlc_improvement: parseNum(getCol('Software Development Life Cycle (SDLC) Process Improvement / Lean Process (Hours)')),
      inefficiency_reduction: parseNum(getCol('Opportunities Realized in Reducing Inefficiency (Hours)')),
      row_number: rowNum,
    });
  }

  if (records.length === 0 && errors.length === 0) {
    warnings.push('No data rows found after the header row.');
  }

  const hasFatalErrors = missingCoreColumns.length > 0 || orderErrors.length > 0;
  const valid = !hasFatalErrors;

  const validationReport = {
    passed: valid,
    sheetUsed: sheetName,
    totalRows: rows.length - headerRowIdx - 1,
    validRows: records.length,
    errors,
    warnings,
    rowErrors,
    columnsSummary: buildColumnsSummary(presentColumns),
    headersDiagnostic,
  };

  logger.info(`Plan Excel validation: ${valid ? 'PASSED' : 'FAILED'}, file=${filePath}, records=${records.length}`, {
    sheetName,
    missingCoreColumns,
    missingOpportunityColumns,
    orderErrors: orderErrors.length,
    warnings: warnings.length,
    rowErrors: rowErrors.length,
    headersDiagnostic: headersDiagnostic.filter(d => d.matchType !== 'exact'),
  });

  return { valid, errors, warnings, headers: rawHeaders, records, recordCount: records.length, validationReport };
};

function buildColumnsSummary(presentColumns) {
  return REQUIRED_COLUMNS.map((col, expectedIdx) => ({
    expectedPosition: expectedIdx + 1,
    name: col,
    found: presentColumns.has(col),
    actualPosition: presentColumns.has(col) ? presentColumns.get(col) + 1 : null,
  }));
}

exports.insertPlanRecords = async (uploadId, records) => {
  const client = await require('../config/database').getClient();
  try {
    await client.query('BEGIN');
    for (const r of records) {
      await client.query(
        `INSERT INTO plan_programs (
          upload_id, dept, program_name, pm_responsible, program_code, baseline,
          baseline_start, baseline_end, estimated_hrs, actual_hrs, effort_variance,
          productivity_index, total_effort_saved_hrs, total_effort_saved_euros,
          total_cost_saved_euros, reuse_library, tech_competency, ai_copilot,
          automation_testing, automation_reviews, automation_cicd, automation_others,
          simulators_tools, sdlc_improvement, inefficiency_reduction, row_number
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26)`,
        [
          uploadId, r.dept, r.program_name, r.pm_responsible, r.program_code, r.baseline,
          r.baseline_start, r.baseline_end, r.estimated_hrs, r.actual_hrs, r.effort_variance,
          r.productivity_index, r.total_effort_saved_hrs, r.total_effort_saved_euros,
          r.total_cost_saved_euros, r.reuse_library, r.tech_competency, r.ai_copilot,
          r.automation_testing, r.automation_reviews, r.automation_cicd, r.automation_others,
          r.simulators_tools, r.sdlc_improvement, r.inefficiency_reduction, r.row_number,
        ]
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

exports.REQUIRED_COLUMNS = REQUIRED_COLUMNS;
exports.CORE_COLUMNS = CORE_COLUMNS;
exports.OPPORTUNITY_COLUMNS = OPPORTUNITY_COLUMNS;
