import React, { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { planUploadsApi, planYearsApi } from '../../services/planApi';
import {
  Upload, FileSpreadsheet, Trash2, Clock, CheckCircle, AlertCircle,
  XCircle, Info, ChevronDown, ChevronUp, Database, AlertTriangle,
  Download, Loader2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { formatNumber } from '../../utils/exportUtils';
import { format } from 'date-fns';

// Must match planExcelService.js CORE_COLUMNS exactly (source: TC_Efficiency-Clean.xlsx)
// — fatal if missing.
const REQUIRED_COLUMNS = [
  'Dept', 'Program Name', 'PM Responsible', 'Program Code', 'Baseline',
  'Baseline Start', 'Baseline End', 'Estimated Hrs (Hours)', 'Actual Hrs  (Hours)',
  'Effort Variance (Hours)', 'Productivity Index (Hours)',
  'Total Effort Saved from opportunities (Hours)',
  'Total Effort Saved from opportunities (Euros)',
  'Total Cost Saved from opportunities (Euros)',
];

// Must match planExcelService.js OPPORTUNITY_COLUMNS exactly — validated when present,
// but backward-compatible: missing ones only produce a warning, not a failed upload.
const OPTIONAL_COLUMNS = [
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

// ─── Upload Step Status Icons ────────────────────────────────────────────────
function StepIcon({ status }) {
  if (status === 'passed') return <CheckCircle size={14} className="text-greenline flex-shrink-0" />;
  if (status === 'failed') return <XCircle size={14} className="text-vibrant flex-shrink-0" />;
  if (status === 'warning') return <AlertTriangle size={14} className="text-gold flex-shrink-0" />;
  return <div className="w-3.5 h-3.5 rounded-full border border-gray-300 dark:border-gray-600 flex-shrink-0" />;
}

const STEP_STATUS_BADGE = {
  passed:  'bg-greenline/10 text-greenline border border-greenline/20',
  failed:  'bg-vibrant/10 text-vibrant border border-vibrant/20',
  warning: 'bg-gold/10 text-gold border border-gold/20',
  skipped: 'bg-gray-100 dark:bg-gray-800 text-gray-400 border border-gray-200 dark:border-gray-700',
};

// ─── Upload Summary Table ────────────────────────────────────────────────────
function UploadSummaryTable({ steps }) {
  if (!steps?.length) return null;
  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400">
            <th className="px-3 py-2 text-left font-medium border-b border-gray-200 dark:border-gray-700 w-6" />
            <th className="px-3 py-2 text-left font-medium border-b border-gray-200 dark:border-gray-700">Validation Step</th>
            <th className="px-3 py-2 text-left font-medium border-b border-gray-200 dark:border-gray-700 w-28">Status</th>
            <th className="px-3 py-2 text-left font-medium border-b border-gray-200 dark:border-gray-700">Details</th>
          </tr>
        </thead>
        <tbody>
          {steps.map((row, i) => (
            <tr key={i} className={`border-b border-gray-100 dark:border-gray-800 last:border-0 ${row.status === 'failed' ? 'bg-vibrant/5' : row.status === 'warning' ? 'bg-gold/5' : ''}`}>
              <td className="px-3 py-2 text-center">
                <StepIcon status={row.status} />
              </td>
              <td className="px-3 py-2 font-medium text-gray-900 dark:text-white whitespace-nowrap">{row.step}</td>
              <td className="px-3 py-2">
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide ${STEP_STATUS_BADGE[row.status] || STEP_STATUS_BADGE.skipped}`}>
                  {row.status === 'passed' ? '✓ Passed'
                    : row.status === 'failed' ? '✗ Failed'
                    : row.status === 'warning' ? '⚠ Warning'
                    : '— Skipped'}
                </span>
              </td>
              <td className="px-3 py-2 text-gray-600 dark:text-gray-300 break-words max-w-xs">{row.details}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Technical Error Details ─────────────────────────────────────────────────
function TechnicalErrorDetails({ errorDetail }) {
  const [expanded, setExpanded] = useState(true);
  if (!errorDetail) return null;

  const rows = [
    { label: 'Error Type', value: errorDetail.errorType },
    { label: 'Component', value: errorDetail.component },
    errorDetail.pgCode && { label: 'PostgreSQL Error Code', value: errorDetail.pgCode },
    errorDetail.databaseObject && { label: 'Database Object', value: errorDetail.databaseObject },
    { label: 'Issue', value: errorDetail.issue },
    { label: 'Expected Action', value: errorDetail.expectedAction, highlight: true },
    { label: 'Upload Status', value: errorDetail.uploadStatus },
  ].filter(Boolean);

  return (
    <div className="rounded-lg border border-vibrant/20 bg-vibrant/5 overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-vibrant/10 transition-colors"
      >
        <Database size={14} className="text-vibrant flex-shrink-0" />
        <span className="text-sm font-semibold text-vibrant">Technical Error Details</span>
        <span className="ml-auto">{expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</span>
      </button>
      {expanded && (
        <div className="border-t border-vibrant/20 overflow-x-auto">
          <table className="w-full text-xs">
            <tbody>
              {rows.map((row, i) => (
                <tr key={i} className={`border-b border-vibrant/10 last:border-0 ${row.highlight ? 'bg-gold/10' : ''}`}>
                  <td className="px-4 py-2 font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap w-44">{row.label}</td>
                  <td className={`px-4 py-2 font-mono ${row.highlight ? 'text-gold font-semibold' : 'text-gray-900 dark:text-white'}`}>{row.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Validation Report (Excel-specific) ─────────────────────────────────────
const MATCH_TYPE_LABEL = {
  exact:      { label: 'Exact',      cls: 'bg-greenline/10 text-greenline' },
  normalized: { label: 'Near-match', cls: 'bg-gold/10 text-gold' },
  missing:    { label: 'Missing',    cls: 'bg-vibrant/10 text-vibrant' },
};

function ValidationReport({ report }) {
  const [showRows, setShowRows] = useState(false);
  const [showDiag, setShowDiag] = useState(false);
  if (!report) return null;

  const hasDiag   = report.headersDiagnostic?.length > 0;
  const hasNearMiss = report.headersDiagnostic?.some(d => d.matchType === 'normalized');
  const hasMissing  = report.headersDiagnostic?.some(d => d.matchType === 'missing');

  return (
    <div className={`card p-4 space-y-3 border ${report.passed ? 'border-greenline/30 bg-greenline/5' : 'border-vibrant/30 bg-vibrant/5'}`}>
      <div className="flex items-center gap-2">
        {report.passed
          ? <CheckCircle size={16} className="text-greenline" />
          : <XCircle size={16} className="text-vibrant" />}
        <p className={`font-semibold text-sm ${report.passed ? 'text-greenline' : 'text-vibrant'}`}>
          Excel Validation {report.passed ? 'Passed' : 'Failed'}
        </p>
        {report.sheetUsed && <span className="text-xs text-gray-500 ml-auto">Sheet: &quot;{report.sheetUsed}&quot;</span>}
      </div>

      <div className="grid grid-cols-3 gap-2 text-center text-xs">
        <div className="bg-white dark:bg-gray-900 rounded p-2">
          <p className="font-bold text-base text-gray-900 dark:text-white">{report.totalRows || 0}</p>
          <p className="text-gray-500">Total rows</p>
        </div>
        <div className="bg-white dark:bg-gray-900 rounded p-2">
          <p className="font-bold text-base text-greenline">{report.validRows || 0}</p>
          <p className="text-gray-500">Valid rows</p>
        </div>
        <div className="bg-white dark:bg-gray-900 rounded p-2">
          <p className="font-bold text-base text-vibrant">{(report.errors?.length || 0) + (report.rowErrors?.length || 0)}</p>
          <p className="text-gray-500">Issues</p>
        </div>
      </div>

      {/* Column chips */}
      <div>
        <p className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Column Validation</p>
        <div className="grid grid-cols-2 gap-1 max-h-40 overflow-y-auto">
          {report.columnsSummary?.map((col, i) => (
            <div key={i} className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded ${col.found ? 'bg-greenline/10 text-greenline' : 'bg-vibrant/10 text-vibrant'}`}>
              {col.found ? <CheckCircle size={10} /> : <XCircle size={10} />}
              <span className="truncate" title={col.name}>{col.name}</span>
              {col.found && col.actualPosition !== col.expectedPosition && (
                <span className="ml-auto text-gold text-[10px]">pos {col.actualPosition}</span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Header diagnostics — only when there are mismatches */}
      {hasDiag && (hasMissing || hasNearMiss) && (
        <div>
          <button
            onClick={() => setShowDiag(!showDiag)}
            className="flex items-center gap-1 text-xs font-semibold text-carbon dark:text-blue-300 hover:opacity-80 transition-opacity"
          >
            {showDiag ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            Header Diagnostics — Expected vs Found in File
          </button>
          {showDiag && (
            <div className="mt-2 overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400">
                    <th className="px-2 py-1 text-left font-medium border-b border-gray-200 dark:border-gray-700 w-8">#</th>
                    <th className="px-2 py-1 text-left font-medium border-b border-gray-200 dark:border-gray-700">Expected Column Name</th>
                    <th className="px-2 py-1 text-left font-medium border-b border-gray-200 dark:border-gray-700">Found in File</th>
                    <th className="px-2 py-1 text-left font-medium border-b border-gray-200 dark:border-gray-700 w-24">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {report.headersDiagnostic.map((d, i) => {
                    const style = MATCH_TYPE_LABEL[d.matchType] || MATCH_TYPE_LABEL.missing;
                    return (
                      <tr key={i} className={`border-b border-gray-100 dark:border-gray-800 ${d.matchType !== 'exact' ? 'bg-yellow-50/30 dark:bg-yellow-900/10' : ''}`}>
                        <td className="px-2 py-1 text-gray-400">{d.position}</td>
                        <td className="px-2 py-1 font-mono text-gray-900 dark:text-white whitespace-pre">{d.expected}</td>
                        <td className={`px-2 py-1 font-mono whitespace-pre ${d.matchType === 'missing' ? 'text-vibrant italic' : 'text-gray-600 dark:text-gray-300'}`}>
                          {d.rawHeader ?? '—'}
                        </td>
                        <td className="px-2 py-1">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${style.cls}`}>{style.label}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {report.errors?.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-vibrant mb-1">Errors ({report.errors.length})</p>
          <div className="space-y-1">
            {report.errors.map((e, i) => (
              <div key={i} className="flex items-start gap-1.5 text-xs text-vibrant bg-vibrant/5 rounded p-2">
                <AlertCircle size={10} className="mt-0.5 flex-shrink-0" /> <span className="break-words">{e}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {report.warnings?.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gold mb-1">Warnings ({report.warnings.length})</p>
          <div className="space-y-1">
            {report.warnings.map((w, i) => (
              <div key={i} className="flex items-start gap-1.5 text-xs text-gold bg-gold/5 rounded p-2">
                <Info size={10} className="mt-0.5 flex-shrink-0" /> {w}
              </div>
            ))}
          </div>
        </div>
      )}

      {report.rowErrors?.length > 0 && (
        <div>
          <button
            onClick={() => setShowRows(!showRows)}
            className="flex items-center gap-1 text-xs font-semibold text-gold hover:text-gold/80 transition-colors"
          >
            {showRows ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            Row-level issues ({report.rowErrors.length})
          </button>
          {showRows && (
            <div className="mt-1 space-y-0.5 max-h-40 overflow-y-auto">
              {report.rowErrors.map((e, i) => (
                <div key={i} className="flex items-start gap-1.5 text-xs text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 rounded p-1.5">
                  <Info size={10} className="mt-0.5 flex-shrink-0 text-gold" /> {e}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Error Banner ─────────────────────────────────────────────────────────────
function ErrorBanner({ errorType, message, component }) {
  if (!errorType) return null;
  const isDb = errorType === 'DATABASE_ERROR';
  return (
    <div className={`rounded-lg border p-4 flex gap-3 ${isDb ? 'border-vibrant/30 bg-vibrant/5' : 'border-gold/30 bg-gold/5'}`}>
      <div className={`mt-0.5 flex-shrink-0 ${isDb ? 'text-vibrant' : 'text-gold'}`}>
        {isDb ? <Database size={16} /> : <AlertTriangle size={16} />}
      </div>
      <div className="space-y-1">
        <p className={`text-sm font-semibold ${isDb ? 'text-vibrant' : 'text-gold'}`}>
          {isDb ? 'Database Error' : 'Validation Error'} in {component}
        </p>
        <p className="text-xs text-gray-700 dark:text-gray-300">{message}</p>
        {isDb && (
          <p className="text-xs text-gray-500 mt-1">
            The Excel file passed all validation checks. The failure occurred during the database write phase.
            See <em>Technical Error Details</em> below for the corrective action.
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function PlanUploadPage() {
  const qc = useQueryClient();
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [datasetName, setDatasetName] = useState('');
  const [notes, setNotes] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [activeTab, setActiveTab] = useState('upload');
  const [uploadResult, setUploadResult] = useState(null); // { uploadSteps, validationReport, errorType, errorDetail, component, message }
  const [downloadingTemplate, setDownloadingTemplate] = useState(false);
  const fileRef = useRef();

  const handleDownloadTemplate = async () => {
    try {
      setDownloadingTemplate(true);
      const res = await planUploadsApi.downloadTemplate();
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.message || 'Template unavailable. Please contact your administrator.');
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'TC_Efficiency_Plan_Template.xlsx';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Could not download template. Please try again.');
    } finally {
      setDownloadingTemplate(false);
    }
  };

  const { data: uploadsData, isLoading } = useQuery({
    queryKey: ['plan-uploads', selectedYear],
    queryFn: () => planUploadsApi.getAll({ year: selectedYear }),
    select: r => r.data,
  });

  const uploadMutation = useMutation({
    mutationFn: (formData) => planUploadsApi.upload(formData),
    onSuccess: (res) => {
      toast.success(res.message || 'File uploaded successfully');
      setUploadResult({
        uploadSteps: res.uploadSteps || [],
        validationReport: res.data?.validationReport || null,
        errorType: null,
        errorDetail: null,
        component: null,
        message: res.message,
        success: true,
      });
      qc.invalidateQueries({ queryKey: ['plan-uploads'] });
      qc.invalidateQueries({ queryKey: ['plan-period-options'] });
    },
    onError: (err) => {
      const rd = err.responseData;
      toast.error(rd?.message || err.message || 'Upload failed');
      setUploadResult({
        uploadSteps: rd?.uploadSteps || [],
        validationReport: rd?.validationReport || null,
        errorType: rd?.errorType || 'UNKNOWN_ERROR',
        errorDetail: rd?.errorDetail || null,
        component: rd?.component || 'Unknown',
        message: rd?.message || err.message,
        success: false,
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => planUploadsApi.delete(id),
    onSuccess: () => {
      toast.success('Upload deleted');
      qc.invalidateQueries({ queryKey: ['plan-uploads'] });
    },
    onError: (err) => toast.error(err.message),
  });

  const handleFile = (file) => {
    if (!file) return;
    setUploadResult(null);
    const fd = new FormData();
    fd.append('file', file);
    fd.append('year', selectedYear);
    fd.append('datasetName', datasetName || file.name);
    if (notes) fd.append('notes', notes);
    uploadMutation.mutate(fd);
  };

  const handleDrop = (e) => {
    e.preventDefault(); setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const hasResult = !!uploadResult;
  const isDbError = uploadResult?.errorType === 'DATABASE_ERROR';

  return (
    <div className="space-y-6 animate-fade-in max-w-5xl">
      <div>
        <h2 className="text-base font-semibold text-gray-900 dark:text-white">Plan Data Upload</h2>
        <p className="text-xs text-gray-500">Upload an Excel file matching the Plan Data format (14 core + 10 opportunity-category columns)</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 p-1 rounded-lg w-fit">
        {['upload', 'history'].map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium capitalize transition-colors ${
              activeTab === tab ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500'
            }`}>
            {tab}
          </button>
        ))}
      </div>

      {activeTab === 'upload' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            {/* Drop zone */}
            <div
              onDrop={handleDrop}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onClick={() => fileRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-all ${
                dragOver ? 'border-carbon bg-carbon/5' : 'border-gray-200 dark:border-gray-700 hover:border-carbon/50'
              } ${uploadMutation.isPending ? 'opacity-50 pointer-events-none' : ''}`}
            >
              <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden"
                onChange={e => handleFile(e.target.files[0])} />
              <div className="flex flex-col items-center gap-3">
                <div className="w-16 h-16 bg-carbon/10 dark:bg-carbon/20 rounded-full flex items-center justify-center">
                  {uploadMutation.isPending
                    ? <div className="animate-spin w-8 h-8 border-2 border-carbon border-t-transparent rounded-full" />
                    : <FileSpreadsheet size={28} className="text-carbon dark:text-blue-400" />}
                </div>
                <div>
                  <p className="font-semibold text-gray-900 dark:text-white">
                    {uploadMutation.isPending ? 'Uploading & validating…' : 'Drop Plan Data Excel file here'}
                  </p>
                  <p className="text-sm text-gray-500 mt-1">or click to browse — .xlsx, .xls supported</p>
                </div>
              </div>
            </div>

            {/* ── Upload Result Area ──────────────────────────────────────── */}
            {hasResult && (
              <div className="space-y-4">
                {/* Error banner (only for failures) */}
                {!uploadResult.success && (
                  <ErrorBanner
                    errorType={uploadResult.errorType}
                    message={uploadResult.message}
                    component={uploadResult.component}
                  />
                )}

                {/* Step-by-step upload summary */}
                {uploadResult.uploadSteps?.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-2 uppercase tracking-wide">
                      {uploadResult.success ? 'Upload Summary' : 'Upload Failure Summary'}
                    </p>
                    <UploadSummaryTable steps={uploadResult.uploadSteps} />
                  </div>
                )}

                {/* Technical error details (DB errors only) */}
                {isDbError && uploadResult.errorDetail && (
                  <TechnicalErrorDetails errorDetail={uploadResult.errorDetail} />
                )}

                {/* Excel validation report (always shown when available) */}
                {uploadResult.validationReport && (
                  <div>
                    <p className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-2 uppercase tracking-wide">
                      Excel Validation Report
                    </p>
                    <ValidationReport report={uploadResult.validationReport} />
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Sidebar options + column reference */}
          <div className="space-y-4">
            <div className="card p-5 space-y-4">
              <h3 className="font-semibold text-gray-900 dark:text-white">Upload Options</h3>
              <div>
                <label className="label">Year *</label>
                <select value={selectedYear} onChange={e => setSelectedYear(e.target.value)} className="input-field">
                  {[2023, 2024, 2025, 2026, 2027, 2028].map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Dataset Name</label>
                <input value={datasetName} onChange={e => setDatasetName(e.target.value)}
                  className="input-field" placeholder="e.g. Plan Data Q2 2026" />
              </div>
              <div>
                <label className="label">Notes</label>
                <textarea value={notes} onChange={e => setNotes(e.target.value)}
                  className="input-field" rows={2} placeholder="Optional notes…" />
              </div>
            </div>

            <div className="card p-4 flex flex-col gap-2">
              <p className="text-xs font-semibold text-gray-900 dark:text-white">Excel Template</p>
              <p className="text-[11px] text-gray-500 leading-relaxed">
                Download the approved template with all 24 columns (14 required + 10 opportunity-category) pre-formatted for upload.
              </p>
              <button
                onClick={handleDownloadTemplate}
                disabled={downloadingTemplate}
                className="btn-secondary flex items-center justify-center gap-2 text-xs w-full"
              >
                {downloadingTemplate
                  ? <Loader2 size={13} className="animate-spin" />
                  : <Download size={13} />}
                {downloadingTemplate ? 'Downloading…' : 'Download Template'}
              </button>
            </div>

            <div className="card p-4 space-y-2">
              <p className="text-xs font-semibold text-gray-500 uppercase">Required Columns (in order)</p>
              {REQUIRED_COLUMNS.map((col, i) => (
                <div key={i} className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
                  <span className="w-5 h-5 bg-carbon/10 dark:bg-carbon/20 text-carbon dark:text-blue-300 rounded text-center flex items-center justify-center font-bold text-[10px] flex-shrink-0">{i + 1}</span>
                  <span className="font-mono">{col}</span>
                </div>
              ))}
              <div className="pt-2 mt-2 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between">
                <p className="text-xs font-semibold text-gray-500 uppercase">Opportunity Columns</p>
                <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-gold/10 text-gold">Optional</span>
              </div>
              <p className="text-[11px] text-gray-500 leading-relaxed">
                Backward-compatible — files without these still import; missing ones produce a warning, not an error.
              </p>
              {OPTIONAL_COLUMNS.map((col, i) => (
                <div key={i} className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
                  <span className="w-5 h-5 bg-gold/10 dark:bg-gold/20 text-gold rounded text-center flex items-center justify-center font-bold text-[10px] flex-shrink-0">{REQUIRED_COLUMNS.length + i + 1}</span>
                  <span className="font-mono">{col}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'history' && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <label className="label mb-0">Filter by Year:</label>
            <select value={selectedYear} onChange={e => setSelectedYear(e.target.value)} className="input-field w-32">
              {[2023, 2024, 2025, 2026, 2027, 2028].map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>

          {isLoading ? (
            <div className="space-y-2">{Array(3).fill(0).map((_, i) => (
              <div key={i} className="card p-4 animate-pulse h-16 bg-gray-100 dark:bg-gray-800" />
            ))}</div>
          ) : !uploadsData?.length ? (
            <div className="card p-12 text-center text-gray-400">
              <Upload size={32} className="mx-auto mb-3 opacity-30" />
              <p>No plan uploads found for {selectedYear}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {uploadsData.map(u => (
                <div key={u.id} className="card p-4 flex items-center gap-4 hover:shadow-md transition-shadow">
                  <div className="w-8 h-8 bg-carbon/10 dark:bg-carbon/20 rounded-lg flex items-center justify-center text-carbon dark:text-blue-400 font-bold text-sm">
                    v{u.upload_version}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 dark:text-white text-sm truncate">{u.dataset_name || u.original_name}</p>
                    <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-400">
                      <span className="flex items-center gap-1"><Clock size={10} /> {u.created_at ? format(new Date(u.created_at), 'dd MMM yyyy HH:mm') : '—'}</span>
                      <span>{formatNumber(u.record_count)} records</span>
                      <span>by {u.uploaded_by_name}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`badge ${u.status === 'completed' ? 'badge-success' : 'badge-warning'}`}>{u.status}</span>
                    <button
                      onClick={() => { if (confirm('Delete this upload and all its records?')) deleteMutation.mutate(u.id); }}
                      className="p-1.5 text-gray-400 hover:text-vibrant hover:bg-vibrant/5 rounded transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
