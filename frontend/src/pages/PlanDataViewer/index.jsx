import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { MaterialReactTable, useMaterialReactTable } from 'material-react-table';
import { ThemeProvider, createTheme, Tooltip as MuiTooltip, StyledEngineProvider } from '@mui/material';
import { planProgramsApi, planUploadsApi } from '../../services/planApi';
import { useThemeStore } from '../../store/useStore';
import { exportToExcel, exportToCSV, exportToPDF, formatNumber } from '../../utils/exportUtils';
import { Download, RefreshCw } from 'lucide-react';

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
  { accessorKey: 'dept', header: 'Dept', size: 80, ...tip('Dept', 'Department') },
  { accessorKey: 'program_name', header: 'Program Name', size: 160, ...tip('Program Name', 'Full program name'), ...truncCell(150) },
  { accessorKey: 'pm_responsible', header: 'PM', size: 140, ...tip('PM', 'PM Responsible'), ...truncCell(130) },
  { accessorKey: 'program_code', header: 'Code', size: 100, ...tip('Code', 'Program Code') },
  { accessorKey: 'baseline', header: 'Baseline', size: 100, ...tip('Baseline', 'Baseline identifier') },
  {
    accessorKey: 'baseline_start', header: 'BL Start', size: 100,
    ...tip('BL Start', 'Baseline Start date'),
    Cell: ({ cell }) => cell.getValue()?.split('T')[0] || '—',
  },
  {
    accessorKey: 'baseline_end', header: 'BL End', size: 100,
    ...tip('BL End', 'Baseline End date'),
    Cell: ({ cell }) => cell.getValue()?.split('T')[0] || '—',
  },
  {
    accessorKey: 'estimated_hrs', header: 'Est. Hrs', size: 100,
    ...tip('Est. Hrs', 'Estimated Hrs (Hours) — as provided in Excel'),
    Cell: ({ cell }) => numCell(cell.getValue()),
  },
  {
    accessorKey: 'actual_hrs', header: 'Actual Hrs', size: 100,
    ...tip('Actual Hrs', 'Actual Hrs (Hours) — as provided in Excel'),
    Cell: ({ cell }) => numCell(cell.getValue()),
  },
  {
    accessorKey: 'effort_variance', header: 'Effort Var.', size: 105,
    ...tip('Effort Var.', 'Effort Variance (Hours) — as provided in Excel'),
    Cell: ({ cell }) => {
      const v = cell.getValue();
      return <span className={v >= 0 ? 'text-green-600' : 'text-red-500'}>{formatNumber(v)}</span>;
    },
  },
  {
    accessorKey: 'productivity_index', header: 'PI', size: 70,
    ...tip('PI', 'Productivity Index (Hours) — as provided in Excel'),
    Cell: ({ cell }) => {
      const v = parseFloat(cell.getValue() || 0);
      return <span className={v >= 1 ? 'text-green-600' : v > 0 ? 'text-red-500' : 'text-gray-400'}>{v.toFixed(2)}</span>;
    },
  },
  {
    accessorKey: 'total_effort_saved_hrs', header: 'Effort Saved (Hrs)', size: 140,
    ...tip('Effort Saved (Hrs)', 'Total Effort Saved from Opportunities (Hours) — as provided in Excel'),
    Cell: ({ cell }) => numCell(cell.getValue()),
  },
  {
    accessorKey: 'total_effort_saved_euros', header: 'Effort Saved (€)', size: 130,
    ...tip('Effort Saved (€)', 'Total Effort Saved from Opportunities (Euros) — as provided in Excel'),
    Cell: ({ cell }) => numCell(cell.getValue()),
  },
  {
    accessorKey: 'total_cost_saved_euros', header: 'Cost Saved (€)', size: 120,
    ...tip('Cost Saved (€)', 'Total Cost Saved from Opportunities (Euros) — as provided in Excel'),
    Cell: ({ cell }) => numCell(cell.getValue()),
  },
  {
    accessorKey: 'is_manual', header: 'Source', size: 80,
    Cell: ({ cell }) => (
      <span className={`badge ${cell.getValue() ? 'badge-warning' : 'badge-success'}`}>
        {cell.getValue() ? 'Manual' : 'Excel'}
      </span>
    ),
  },
];

export default function PlanDataViewer() {
  const { theme } = useThemeStore();
  const [selectedYear, setSelectedYear] = useState('');
  const [selectedUpload, setSelectedUpload] = useState('');

  const { data: uploads } = useQuery({
    queryKey: ['plan-uploads-all'],
    queryFn: () => planUploadsApi.getAll({}),
    select: r => r.data,
  });

  const { data: programData, isLoading, refetch } = useQuery({
    queryKey: ['plan-programs', selectedUpload],
    queryFn: () => planProgramsApi.getAll({ uploadId: selectedUpload || undefined, limit: 1000 }),
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
      }},
      MuiTableRow: { styleOverrides: { root: { '&:hover td': { backgroundColor: 'rgba(255,255,255,0.05)' } } } },
      MuiToolbar: { styleOverrides: { root: { backgroundColor: '#1f2937', color: '#f9fafb' } } },
      MuiIconButton: { styleOverrides: { root: { color: '#9ca3af' } } },
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
          <button onClick={() => exportToExcel(exportData, 'plan_programs')} className="btn-secondary text-xs">
            <Download size={12} /> Excel
          </button>
          <button onClick={() => exportToCSV(exportData, 'plan_programs')} className="btn-secondary text-xs">
            <Download size={12} /> CSV
          </button>
          <button onClick={() => exportToPDF(exportData, COLUMNS, 'Plan Programs Report', 'plan_programs')} className="btn-secondary text-xs">
            <Download size={12} /> PDF
          </button>
        </div>
      );
    },
    state: { isLoading },
  });

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="label">Upload Version</label>
          <select value={selectedUpload} onChange={e => setSelectedUpload(e.target.value)} className="input-field w-56">
            <option value="">All Uploads</option>
            {uploads?.map(u => (
              <option key={u.id} value={u.id}>v{u.upload_version} — {u.dataset_name || u.original_name}</option>
            ))}
          </select>
        </div>
        <button onClick={() => refetch()} className="btn-secondary mb-0">
          <RefreshCw size={14} /> Refresh
        </button>
        <div className="ml-auto">
          <p className="text-sm text-gray-500">{formatNumber(programData?.length)} records</p>
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
