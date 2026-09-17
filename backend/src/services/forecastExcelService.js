const XLSX = require('xlsx');
const logger = require('../config/logger');
const { findSheetByName } = require('./planExcelService');

// Exact required columns matching the "Forecasting" sheet of
// TC_Efficiency_Plan_Template_with_forecast.xlsx. Kept verbatim, typos and
// all ("Infrastruture", "Leaner Process") — normalized fallback below only
// tolerates whitespace/case drift, not spelling fixes, matching the same
// tolerance level as planExcelService.
const CORE_COLUMNS = [
  'Dept',
  'Program Name',
  'PM Responsible',
  'Baseline',
  'Baseline Start',
  'Baseline End',
  'Estimated Hrs',
];

const SAVINGS_COLUMNS = [
  'Total Cost Saved from opportunities in Hrs',
  'Total Cost Saved from opportunities in Euros',
];

const OPPORTUNITY_COLUMNS = [
  'Reuse of Reference Library / Solutions in Hrs',
  'Technical Competency Improvement in Hrs',
  'AI Assisted / Copilot usage in Hrs',
  'Automation of Testing - Unit / Component / System in Hrs',
  'Automation of Reviews in Hrs',
  'Automation of Build & Release Process - CI/CD/DevX in Hrs',
  'Automation - Others, if any in Hrs',
  'Usage of Simulators / Tools / Infrastruture in Hrs',
  'Sw Development Life cycle Process Improvement / Leaner Process in Hrs',
  'Any opportunities realised in reducing inefficiency in Hrs',
];

const REQUIRED_COLUMNS = [...CORE_COLUMNS, ...SAVINGS_COLUMNS, ...OPPORTUNITY_COLUMNS];

const DATE_COLUMNS = new Set(['Baseline Start', 'Baseline End']);
const NUMERIC_COLUMNS = new Set([
  'Estimated Hrs',
  ...SAVINGS_COLUMNS,
  ...OPPORTUNITY_COLUMNS,
]);
const REQUIRED_FIELDS = new Set(['Dept', 'Program Name']);

const normalizeHeader = (h) => (h ? String(h).trim() : '');
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
 * Validates and parses the "Forecasting" sheet of an already-loaded workbook.
 * Unlike planExcelService, a missing sheet or validation failure here is
 * NEVER fatal to the overall upload — Forecasting is additive/optional
 * (req. 3, 17, 20). Callers should treat `errors` as warnings to surface,
 * not as a reason to reject the upload.
 *
 * Returns { found, valid, errors, warnings, records, recordCount, validationReport }
 */
exports.validateAndParse = (wb) => {
  const notFound = {
    found: false, valid: true, errors: [], warnings: [], headers: [], records: [], recordCount: 0,
    validationReport: null,
  };

  if (!wb || !wb.SheetNames || wb.SheetNames.length === 0) return notFound;

  const sheetName = findSheetByName(wb, 'Forecasting');
  if (!sheetName) return notFound;

  const errors = [];
  const warnings = [];
  const rowErrors = [];

  const ws = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true });

  if (!rows || rows.length === 0) {
    return {
      found: true, valid: true, errors: [], warnings: ['Forecasting sheet is empty.'], headers: [], records: [], recordCount: 0,
      validationReport: { passed: true, sheetUsed: sheetName, totalRows: 0, validRows: 0, errors: [], warnings: ['Forecasting sheet is empty.'], rowErrors: [], columnsSummary: [], headersDiagnostic: [] },
    };
  }

  // Header row = first row within first 10 whose first non-null cell normalizes to 'dept'
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
    const msg = 'Forecasting sheet: header row not found (expected first column "Dept" in one of the first 10 rows). Forecast data was not imported.';
    return {
      found: true, valid: true, errors: [msg], warnings: [], headers: [], records: [], recordCount: 0,
      validationReport: { passed: false, sheetUsed: sheetName, totalRows: 0, validRows: 0, errors: [msg], warnings: [], rowErrors: [], columnsSummary: [], headersDiagnostic: [] },
    };
  }

  const rawHeaders = rows[headerRowIdx].map(normalizeHeader);
  const normalizedActualMap = new Map();
  rawHeaders.forEach((h, i) => {
    if (h !== '') normalizedActualMap.set(normalizeForCompare(h), { rawHeader: h, index: i });
  });

  const missingColumns = [];
  const presentColumns = new Map();
  const headersDiagnostic = [];

  for (let ci = 0; ci < REQUIRED_COLUMNS.length; ci++) {
    const col = REQUIRED_COLUMNS[ci];
    const exactIdx = rawHeaders.findIndex(h => h === col);

    if (exactIdx !== -1) {
      presentColumns.set(col, exactIdx);
      headersDiagnostic.push({ position: ci + 1, expected: col, foundAt: exactIdx + 1, rawHeader: rawHeaders[exactIdx], matchType: 'exact', found: true });
    } else {
      const fuzzy = normalizedActualMap.get(normalizeForCompare(col));
      if (fuzzy) {
        presentColumns.set(col, fuzzy.index);
        warnings.push(`Forecasting column ${ci + 1} header mismatch — Expected: "${col}" | Found: "${fuzzy.rawHeader}" (whitespace or case difference). Column accepted.`);
        headersDiagnostic.push({ position: ci + 1, expected: col, foundAt: fuzzy.index + 1, rawHeader: fuzzy.rawHeader, matchType: 'normalized', found: true });
      } else {
        missingColumns.push(col);
        headersDiagnostic.push({ position: ci + 1, expected: col, foundAt: null, rawHeader: null, matchType: 'missing', found: false });
      }
    }
  }

  const missingCoreColumns = missingColumns.filter(c => CORE_COLUMNS.includes(c));
  if (missingCoreColumns.length > 0) {
    const availableHeaders = rawHeaders.filter(h => h !== '').join(', ');
    errors.push(
      `Forecasting sheet missing ${missingCoreColumns.length} required column(s): ${missingCoreColumns.map(c => `"${c}"`).join(', ')}. ` +
      `Headers found: ${availableHeaders}. Forecast data was not imported.`
    );
  }
  const missingOptionalColumns = missingColumns.filter(c => !CORE_COLUMNS.includes(c));
  if (missingOptionalColumns.length > 0) {
    warnings.push(`Forecasting sheet missing ${missingOptionalColumns.length} optional column(s): ${missingOptionalColumns.map(c => `"${c}"`).join(', ')}. These will be left blank.`);
  }

  const hasFatalErrors = missingCoreColumns.length > 0;

  if (hasFatalErrors) {
    return {
      found: true, valid: true, errors, warnings, headers: rawHeaders, records: [], recordCount: 0,
      validationReport: { passed: false, sheetUsed: sheetName, totalRows: 0, validRows: 0, errors, warnings, rowErrors: [], columnsSummary: buildColumnsSummary(presentColumns), headersDiagnostic },
    };
  }

  const records = [];
  for (let i = headerRowIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.every(v => v === null || v === '')) continue;

    const rowNum = i - headerRowIdx;
    const getCol = (colName) => {
      const idx = presentColumns.get(colName);
      return idx !== undefined ? row[idx] : null;
    };

    const rowErrs = [];
    for (const field of REQUIRED_FIELDS) {
      const val = getCol(field);
      if (!val || String(val).trim() === '') rowErrs.push(`Row ${rowNum}: "${field}" is required but empty`);
    }
    for (const col of NUMERIC_COLUMNS) {
      if (!presentColumns.has(col)) continue;
      const val = getCol(col);
      if (val !== null && val !== undefined && val !== '' && isNaN(parseFloat(val))) {
        rowErrs.push(`Row ${rowNum}: "${col}" must be a number, got "${val}"`);
      }
    }
    // Missing/invalid dates are logged but never drop the row (req. 18) — the
    // record still carries other forecast data; the timeline simply skips
    // plotting it if start/end end up null.
    for (const col of DATE_COLUMNS) {
      if (!presentColumns.has(col)) continue;
      const val = getCol(col);
      if (val !== null && val !== undefined && val !== '' && !isValidDate(val)) {
        rowErrs.push(`Row ${rowNum}: "${col}" has invalid date format "${val}" — record will be imported without a plottable date`);
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
      baseline: parseStr(getCol('Baseline')),
      baseline_start: parseDate(getCol('Baseline Start')),
      baseline_end: parseDate(getCol('Baseline End')),
      estimated_hrs: parseNum(getCol('Estimated Hrs')),
      savings_hrs: parseNum(getCol('Total Cost Saved from opportunities in Hrs')),
      savings_euros: parseNum(getCol('Total Cost Saved from opportunities in Euros')),
      reuse_library: parseNum(getCol('Reuse of Reference Library / Solutions in Hrs')),
      tech_competency: parseNum(getCol('Technical Competency Improvement in Hrs')),
      ai_copilot: parseNum(getCol('AI Assisted / Copilot usage in Hrs')),
      automation_testing: parseNum(getCol('Automation of Testing - Unit / Component / System in Hrs')),
      automation_reviews: parseNum(getCol('Automation of Reviews in Hrs')),
      automation_cicd: parseNum(getCol('Automation of Build & Release Process - CI/CD/DevX in Hrs')),
      automation_others: parseNum(getCol('Automation - Others, if any in Hrs')),
      simulators_tools: parseNum(getCol('Usage of Simulators / Tools / Infrastruture in Hrs')),
      sdlc_improvement: parseNum(getCol('Sw Development Life cycle Process Improvement / Leaner Process in Hrs')),
      inefficiency_reduction: parseNum(getCol('Any opportunities realised in reducing inefficiency in Hrs')),
      row_number: rowNum,
    });
  }

  if (records.length === 0 && errors.length === 0) {
    warnings.push('Forecasting sheet: no data rows found after the header row.');
  }

  const validationReport = {
    passed: true,
    sheetUsed: sheetName,
    totalRows: rows.length - headerRowIdx - 1,
    validRows: records.length,
    errors, warnings, rowErrors,
    columnsSummary: buildColumnsSummary(presentColumns),
    headersDiagnostic,
  };

  logger.info(`Forecasting sheet parsed: records=${records.length}`, {
    sheetName, missingOptionalColumns, warnings: warnings.length, rowErrors: rowErrors.length,
  });

  return { found: true, valid: true, errors, warnings, headers: rawHeaders, records, recordCount: records.length, validationReport };
};

function buildColumnsSummary(presentColumns) {
  return REQUIRED_COLUMNS.map((col, expectedIdx) => ({
    expectedPosition: expectedIdx + 1,
    name: col,
    found: presentColumns.has(col),
    actualPosition: presentColumns.has(col) ? presentColumns.get(col) + 1 : null,
  }));
}

exports.insertForecastRecords = async (uploadId, records) => {
  const client = await require('../config/database').getClient();
  try {
    await client.query('BEGIN');
    for (const r of records) {
      await client.query(
        `INSERT INTO forecast_programs (
          upload_id, dept, program_name, pm_responsible, baseline,
          baseline_start, baseline_end, estimated_hrs, savings_hrs, savings_euros,
          reuse_library, tech_competency, ai_copilot, automation_testing,
          automation_reviews, automation_cicd, automation_others,
          simulators_tools, sdlc_improvement, inefficiency_reduction, row_number
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)`,
        [
          uploadId, r.dept, r.program_name, r.pm_responsible, r.baseline,
          r.baseline_start, r.baseline_end, r.estimated_hrs, r.savings_hrs, r.savings_euros,
          r.reuse_library, r.tech_competency, r.ai_copilot, r.automation_testing,
          r.automation_reviews, r.automation_cicd, r.automation_others,
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
exports.SAVINGS_COLUMNS = SAVINGS_COLUMNS;
exports.OPPORTUNITY_COLUMNS = OPPORTUNITY_COLUMNS;
