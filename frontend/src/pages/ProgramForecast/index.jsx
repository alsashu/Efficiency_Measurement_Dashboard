import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Autocomplete, TextField, Chip, ThemeProvider, StyledEngineProvider, createTheme } from '@mui/material';
import { GanttChartSquare, TrendingUp, Target, RefreshCw } from 'lucide-react';
import { planForecastApi } from '../../services/planApi';
import { useThemeStore } from '../../store/useStore';
import { SkeletonCard } from '../../components/ui/LoadingSpinner';
import { formatNumber, formatPct } from '../../utils/exportUtils';
import ForecastTimeline from './ForecastTimeline';

export default function ProgramForecast() {
  const { theme } = useThemeStore();
  const isDark = theme === 'dark';
  const [selectedDepts, setSelectedDepts] = useState([]);
  const [selectedPrograms, setSelectedPrograms] = useState([]);

  const { data: filterOptions, isLoading: loadingOptions } = useQuery({
    queryKey: ['forecast-filter-options'],
    queryFn: () => planForecastApi.getFilterOptions(),
    select: r => r.data,
  });

  const depts = filterOptions?.depts || [];
  const programsByDept = filterOptions?.programsByDept || {};

  // Program options depend on the selected department(s) — all programs when none selected (req. 5/6)
  const programOptions = useMemo(() => {
    const source = selectedDepts.length
      ? selectedDepts.flatMap(d => programsByDept[d] || [])
      : Object.values(programsByDept).flat();
    return [...new Set(source)].sort();
  }, [selectedDepts, programsByDept]);

  const handleDeptChange = (_, value) => {
    setSelectedDepts(value);
    const nextValidPrograms = value.length
      ? new Set(value.flatMap(d => programsByDept[d] || []))
      : new Set(Object.values(programsByDept).flat());
    setSelectedPrograms(prev => prev.filter(p => nextValidPrograms.has(p)));
  };

  const { data: timeline, isLoading: loadingTimeline } = useQuery({
    queryKey: ['forecast-timeline', selectedDepts, selectedPrograms],
    queryFn: () => planForecastApi.getTimeline({ dept: selectedDepts, program: selectedPrograms }),
    select: r => r.data,
    enabled: !loadingOptions,
  });

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
      MuiInputBase: { styleOverrides: { root: { color: '#f9fafb' } } },
      MuiOutlinedInput: { styleOverrides: { notchedOutline: { borderColor: '#374151' } } },
      MuiChip: { styleOverrides: { root: { backgroundColor: '#374151', color: '#f9fafb' } } },
      MuiAutocomplete: { styleOverrides: { popupIndicator: { color: '#9ca3af' }, clearIndicator: { color: '#9ca3af' } } },
    } : {},
  }), [isDark]);

  const overall = timeline?.overall;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <GanttChartSquare size={20} className="text-carbon dark:text-blue-400" />
            Programs with Forecast
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Efficiency Plan baseline (solid) vs. Forecasting baseline (dashed) per program
          </p>
        </div>
      </div>

      <StyledEngineProvider injectFirst>
        <ThemeProvider theme={muiTheme}>
          <div className="card p-4 flex flex-wrap gap-4">
            <div className="w-full sm:w-64">
              <label className="label">Department</label>
              <Autocomplete
                multiple
                size="small"
                options={depts}
                value={selectedDepts}
                onChange={handleDeptChange}
                loading={loadingOptions}
                disableCloseOnSelect
                renderTags={(value, getTagProps) =>
                  value.map((option, index) => <Chip label={option} size="small" {...getTagProps({ index })} />)
                }
                renderInput={(params) => (
                  <TextField {...params} placeholder={selectedDepts.length ? '' : 'All Departments'} />
                )}
              />
            </div>
            <div className="w-full sm:w-72">
              <label className="label">Program Name</label>
              <Autocomplete
                multiple
                size="small"
                options={programOptions}
                value={selectedPrograms}
                onChange={(_, value) => setSelectedPrograms(value)}
                loading={loadingOptions}
                disableCloseOnSelect
                renderTags={(value, getTagProps) =>
                  value.map((option, index) => <Chip label={option} size="small" {...getTagProps({ index })} />)
                }
                renderInput={(params) => (
                  <TextField {...params} placeholder={selectedPrograms.length ? '' : 'All Programs'} />
                )}
              />
            </div>
            <button
              onClick={() => { setSelectedDepts([]); setSelectedPrograms([]); }}
              className="btn-secondary text-xs ml-auto self-end"
              title="Clear Department and Program filters"
            >
              <RefreshCw size={12} /> Reset Filters
            </button>
          </div>
        </ThemeProvider>
      </StyledEngineProvider>

      {(loadingTimeline || loadingOptions) ? (
        <div className="grid grid-cols-1 gap-4">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : (
        <>
          <ForecastTimeline programs={timeline?.programs || []} />

          <div className="grid grid-cols-2 gap-4 max-w-xl">
            <div className="card p-5">
              <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 text-xs font-medium uppercase tracking-wide">
                <Target size={14} /> Overall Savings
              </div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white mt-2">
                {formatNumber(overall?.savingsHrs)} <span className="text-sm font-medium text-gray-400">Hrs</span>
              </p>
            </div>
            <div className="card p-5">
              <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 text-xs font-medium uppercase tracking-wide">
                <TrendingUp size={14} /> Overall Savings %
              </div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white mt-2">
                {formatPct(overall?.savingsPct)}
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
