import React, { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { MaterialReactTable, useMaterialReactTable } from 'material-react-table';
import { ThemeProvider, createTheme, Tooltip as MuiTooltip, StyledEngineProvider } from '@mui/material';
import { programsApi, uploadsApi, yearsApi } from '../../services/api';
import { useThemeStore } from '../../store/useStore';
import { exportToExcel, exportToCSV, exportToPDF, formatNumber } from '../../utils/exportUtils';
import { Download, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';

const tip = (short, full) => ({
  Header: () => (
    <MuiTooltip title={full} placement="top" arrow>
      <span style={{ cursor: 'help', borderBottom: '1px dotted currentColor' }}>{short}</span>
    </MuiTooltip>
  ),
});

const truncCell = (maxW = 160) => ({
  Cell: ({ cell }) => {
    const v = cell.getValue();
    return (
      <span title={v || ''} style={{ display: 'block', maxWidth: maxW, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {v || '—'}
      </span>
    );
  },
});

const numCell = (v) => <span>{formatNumber(v)}</span>;

const COLUMNS = [
  { accessorKey: 'dept', header: 'Dept', size: 80, ...tip('Dept', 'Department — the organisational unit responsible for this program') },
  { accessorKey: 'program_name', header: 'Program Name', size: 160,
    ...tip('Program Name', 'Full program name as registered in the Technology Center'),
    ...truncCell(150) },
  { accessorKey: 'pm_responsible', header: 'PM Responsible', size: 150,
    ...tip('PM Responsible', 'Project / Program Manager accountable for this baseline delivery'),
    ...truncCell(140) },
  { accessorKey: 'program_code', header: 'Program Code', size: 110,
    ...tip('Program Code', 'Internal TC program reference code (PGA / PE / SU prefix)') },
  { accessorKey: 'baseline', header: 'Baseline', size: 100,
    ...tip('Baseline', 'Baseline version identifier (e.g. 1.5, 4.2.0, Baseline 1)') },
  { accessorKey: 'baseline_start', header: 'BL Start', size: 100,
    ...tip('BL Start', 'Baseline start date — when work on this version began'),
    Cell: ({ cell }) => cell.getValue()?.split('T')[0] || '—' },
  { accessorKey: 'baseline_end', header: 'BL End', size: 100,
    ...tip('BL End', 'Baseline end date — planned completion date for this version'),
    Cell: ({ cell }) => cell.getValue()?.split('T')[0] || '—' },
  { accessorKey: 'funding_source', header: 'Funding', size: 110,
    ...tip('Funding', 'Funding source category: R&D, Sustenance, Project, or GPO') },
  { accessorKey: 'approved_budget_ke', header: 'Appr. Budget (KE)', size: 135,
    ...tip('Appr. Budget (KE)', 'Approved budget in kilo-Euros (1 KE = €1,000). This is the authorised spend limit.'),
    Cell: ({ cell }) => numCell(cell.getValue()) },
  { accessorKey: 'actual_budget_ke', header: 'Actual Budget (KE)', size: 130,
    ...tip('Actual Budget (KE)', 'Actual spend in kilo-Euros at end of baseline. Compare with Approved Budget for cost variance.'),
    Cell: ({ cell }) => numCell(cell.getValue()) },
  { accessorKey: 'estimated_hrs', header: 'Est. Hours', size: 105,
    ...tip('Est. Hours', 'Estimated (planned) effort in person-hours for this baseline. Represents the capacity allocation.'),
    Cell: ({ cell }) => numCell(cell.getValue()) },
  { accessorKey: 'actual_hrs', header: 'Actual Hours', size: 105,
    ...tip('Actual Hours', 'Actual effort delivered in person-hours. Used with Estimated Hours to compute Effort Variance and PI.'),
    Cell: ({ cell }) => numCell(cell.getValue()) },
  { accessorKey: 'effort_variance', header: 'Effort Variance', size: 120,
    ...tip('Effort Variance', 'Estimated Hours − Actual Hours. Positive = delivered under budget (hours saved). Negative = overrun.'),
    Cell: ({ cell }) => {
      const v = cell.getValue();
      return <span className={v >= 0 ? 'text-green-600' : 'text-red-500'}>{formatNumber(v)}</span>;
    } },
  { accessorKey: 'productivity_index', header: 'PI', size: 70,
    ...tip('PI', 'Productivity Index = Estimated Hours ÷ Actual Hours. PI ≥ 1.0 means on/under budget; PI < 1.0 means over budget. Higher is better.'),
    Cell: ({ cell }) => {
      const v = parseFloat(cell.getValue() || 0);
      return <span className={v >= 1 ? 'text-green-600' : v > 0 ? 'text-red-500' : 'text-gray-400'}>{v.toFixed(2)}</span>;
    } },
  { accessorKey: 'total_effort_saved', header: 'Effort Saved (Hrs)', size: 130,
    ...tip('Effort Saved (Hrs)', 'Total hours saved via all opportunity categories: AI/Copilot, automation, SDLC improvements, reuse libraries, tooling, etc.'),
    Cell: ({ cell }) => numCell(cell.getValue()) },
  { accessorKey: 'total_cost_saved', header: 'Cost Saved (€)', size: 115,
    ...tip('Cost Saved (€)', 'Total monetary savings in Euros from material cost reductions and other cost categories (licensing, infrastructure, tooling).'),
    Cell: ({ cell }) => numCell(cell.getValue()) },
  { accessorKey: 'ai_copilot', header: 'AI/Copilot Hrs', size: 115,
    ...tip('AI/Copilot Hrs', 'Hours saved using AI-assisted coding and review tools (e.g. GitHub Copilot, AI test generation). Subset of total Effort Saved.'),
    Cell: ({ cell }) => numCell(cell.getValue()) },
  { accessorKey: 'automation_testing', header: 'Test Auto. Hrs', size: 125,
    ...tip('Test Auto. Hrs', 'Hours saved by automating test execution, regression suites, and test case generation.'),
    Cell: ({ cell }) => numCell(cell.getValue()) },
  { accessorKey: 'automation_cicd', header: 'CI/CD Hrs', size: 95,
    ...tip('CI/CD Hrs', 'Hours saved by automating build pipelines, continuous integration, and deployment processes.'),
    Cell: ({ cell }) => numCell(cell.getValue()) },
  { accessorKey: 'efficiency_pct', header: '% Efficiency', size: 105,
    ...tip('% Efficiency', 'Efficiency % = (Effort Saved ÷ Estimated Hours) × 100. Shows what fraction of planned effort was recovered through opportunities.'),
    Cell: ({ cell }) => {
      const v = parseFloat(cell.getValue() || 0) * 100;
      return `${v.toFixed(1)}%`;
    } },
  { accessorKey: 'fy_ending', header: 'FY Ending', size: 95,
    ...tip('FY Ending', 'Fiscal year end date for this program baseline. Used for FY-based filtering and reporting.'),
    Cell: ({ cell }) => cell.getValue()?.split('T')[0] || '—' },
  { accessorKey: 'remarks', header: 'Remarks', size: 200,
    ...tip('Remarks', 'Free-text notes, observations, or context notes entered by the PM or data owner.'),
    ...truncCell(190) },
];

export default function DataViewer() {
  const { theme } = useThemeStore();
  const qc = useQueryClient();
  const [selectedYear, setSelectedYear] = useState('');
  const [selectedUpload, setSelectedUpload] = useState('');

  const { data: years } = useQuery({ queryKey: ['years'], queryFn: () => yearsApi.getAll(), select: r => r.data });
  const { data: uploads } = useQuery({
    queryKey: ['uploads', selectedYear],
    queryFn: () => uploadsApi.getAll({ year: selectedYear || undefined }),
    select: r => r.data,
    enabled: true,
  });

  const { data: programData, isLoading, refetch } = useQuery({
    queryKey: ['programs', selectedUpload, selectedYear],
    queryFn: () => programsApi.getAll({
      uploadId: selectedUpload || undefined,
      limit: 1000,
    }),
    select: r => r.data,
  });

  const isDark = theme === 'dark';

  const muiTheme = useMemo(() => createTheme({
    palette: {
      mode: isDark ? 'dark' : 'light',
      ...(isDark && {
        background: { default: '#111827', paper: '#1f2937' },
        text: { primary: '#f9fafb', secondary: '#9ca3af' },
        divider: '#374151',
      }),
    },
    components: isDark ? {
      MuiPaper: { styleOverrides: { root: { backgroundImage: 'none', backgroundColor: '#1f2937' } } },
      MuiTableCell: { styleOverrides: {
        root: { borderBottomColor: '#374151', color: '#f9fafb' },
        head: { backgroundColor: '#111827', color: '#d1d5db', fontWeight: 600 },
        stickyHeader: { backgroundColor: '#111827' },
      }},
      MuiTableRow: { styleOverrides: { root: {
        '&:hover td': { backgroundColor: 'rgba(255,255,255,0.05)' },
      }}},
      MuiToolbar: { styleOverrides: { root: { backgroundColor: '#1f2937', color: '#f9fafb' } } },
      MuiIconButton: { styleOverrides: { root: { color: '#9ca3af', '&:hover': { backgroundColor: 'rgba(255,255,255,0.08)' } } } },
      MuiInputBase: { styleOverrides: { root: { color: '#f9fafb' } } },
      MuiSelect: { styleOverrides: { icon: { color: '#9ca3af' } } },
      MuiCheckbox: { styleOverrides: { root: { color: '#6b7280', '&.Mui-checked': { color: '#60a5fa' } } } },
      MuiTablePagination: { styleOverrides: { root: { color: '#9ca3af' }, select: { color: '#f9fafb' } } },
      MuiMenuItem: { styleOverrides: { root: { color: '#f9fafb', '&:hover': { backgroundColor: '#374151' } } } },
    } : {},
  }), [isDark]);

  const table = useMaterialReactTable({
    columns: COLUMNS,
    data: programData || [],
    enableColumnResizing: true,
    enableColumnOrdering: true,
    enableStickyHeader: true,
    enableGrouping: true,
    enablePinning: true,
    enableColumnFilterModes: true,
    enableGlobalFilter: true,
    enableRowSelection: true,
    enableColumnHiding: true,
    initialState: {
      density: 'compact',
      pagination: { pageSize: 10 },
      columnVisibility: { remarks: false },
    },
    muiTableContainerProps: { sx: { maxHeight: '60vh', ...(isDark && { backgroundColor: '#1f2937' }) } },
    muiTablePaperProps: { sx: isDark ? { backgroundColor: '#1f2937', backgroundImage: 'none', color: '#f9fafb' } : {} },
    muiTopToolbarProps: { sx: isDark ? { backgroundColor: '#1f2937', color: '#f9fafb' } : {} },
    muiBottomToolbarProps: { sx: isDark ? { backgroundColor: '#1f2937', color: '#f9fafb' } : {} },
    muiTableHeadCellProps: { sx: isDark ? { backgroundColor: '#111827', color: '#d1d5db', borderBottomColor: '#374151', fontWeight: 600 } : {} },
    muiTableBodyCellProps: { sx: isDark ? { color: '#f9fafb', borderBottomColor: '#374151', backgroundColor: 'transparent' } : {} },
    muiTableBodyRowProps: { sx: isDark ? { '&:hover td': { backgroundColor: 'rgba(255,255,255,0.05) !important' } } : {} },
    renderTopToolbarCustomActions: ({ table }) => {
      const selected = table.getSelectedRowModel().rows.map(r => r.original);
      const exportData = selected.length ? selected : (programData || []);
      return (
        <div className="flex items-center gap-2 p-1">
          <button onClick={() => exportToExcel(exportData, 'tc_programs')} className="btn-secondary text-xs" title="Export to Excel (.xlsx)">
            <Download size={12} /> Excel
          </button>
          <button onClick={() => exportToCSV(exportData, 'tc_programs')} className="btn-secondary text-xs" title="Export to CSV">
            <Download size={12} /> CSV
          </button>
          <button onClick={() => exportToPDF(exportData, COLUMNS, 'TC Programs Report', 'tc_programs')} className="btn-secondary text-xs" title="Export to PDF">
            <Download size={12} /> PDF
          </button>
        </div>
      );
    },
    state: { isLoading },
  });

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="label" title="Filter records by fiscal year">Year</label>
          <select value={selectedYear} onChange={e => { setSelectedYear(e.target.value); setSelectedUpload(''); }} className="input-field w-28">
            <option value="">All Years</option>
            {years?.map(y => <option key={y.year} value={y.year}>{y.year}</option>)}
          </select>
        </div>
        <div>
          <label className="label" title="Filter by a specific uploaded dataset version">Upload Version</label>
          <select value={selectedUpload} onChange={e => setSelectedUpload(e.target.value)} className="input-field w-52">
            <option value="">All Uploads</option>
            {uploads?.map(u => <option key={u.id} value={u.id}>v{u.upload_version} — {u.dataset_name || u.original_name}</option>)}
          </select>
        </div>
        <button onClick={() => refetch()} className="btn-secondary mb-0" title="Reload data from server">
          <RefreshCw size={14} /> Refresh
        </button>
        <div className="ml-auto">
          <p className="text-sm text-gray-500" title="Total records matching current filters">{formatNumber(programData?.length)} records</p>
        </div>
      </div>

      <div className="card overflow-hidden">
        <StyledEngineProvider injectFirst>
          <ThemeProvider theme={muiTheme}>
            <MaterialReactTable table={table} />
          </ThemeProvider>
        </StyledEngineProvider>
      </div>
    </div>
  );
}
