import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Autocomplete, TextField, Chip, ThemeProvider, StyledEngineProvider, createTheme } from '@mui/material';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFnsV3';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { GanttChartSquare, TrendingUp, Target, RefreshCw, ArrowRight } from 'lucide-react';
import { planForecastApi } from '../../services/planApi';
import { useThemeStore } from '../../store/useStore';
import { SkeletonCard } from '../../components/ui/LoadingSpinner';
import { formatPct } from '../../utils/exportUtils';
import ForecastTimeline from './ForecastTimeline';
import EfficiencySavingsChart from './EfficiencySavingsChart';

export default function ProgramForecast() {
  const { theme } = useThemeStore();
  const isDark = theme === 'dark';
  const [selectedDepts, setSelectedDepts] = useState([]);
  const [selectedPrograms, setSelectedPrograms] = useState([]);
  const [startDate, setStartDate] = useState(null);
  const [endDate, setEndDate] = useState(null);

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
            <LocalizationProvider dateAdapter={AdapterDateFns}>
              <div>
                <label className="label">Time Interval</label>
                <div className="flex items-center gap-2">
                  <DatePicker
                    value={startDate}
                    onChange={setStartDate}
                    maxDate={endDate || undefined}
                    slotProps={{ textField: { size: 'small', placeholder: 'Start Date', sx: { width: 150 } } }}
                  />
                  <ArrowRight size={14} className="text-gray-400 flex-shrink-0" />
                  <DatePicker
                    value={endDate}
                    onChange={setEndDate}
                    minDate={startDate || undefined}
                    slotProps={{ textField: { size: 'small', placeholder: 'End Date', sx: { width: 150 } } }}
                  />
                </div>
              </div>
            </LocalizationProvider>
            <button
              onClick={() => { setSelectedDepts([]); setSelectedPrograms([]); setStartDate(null); setEndDate(null); }}
              className="btn-secondary text-xs ml-auto self-end"
              title="Clear Department, Program and Time Interval filters"
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
          <ForecastTimeline programs={timeline?.programs || []} startDate={startDate} endDate={endDate} />

          <EfficiencySavingsChart programs={timeline?.programs || []} startDate={startDate} endDate={endDate} isDark={isDark} />

          <div className="grid grid-cols-2 gap-4 max-w-xl">
            <div className="card p-5">
              <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 text-xs font-medium uppercase tracking-wide">
                <Target size={14} /> Achieved Efficiency
              </div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white mt-2">
                {formatPct(overall?.achievedEfficiencyPct)}
              </p>
              <p className="text-[11px] text-gray-400 mt-1">Source: Efficiency Plan</p>
            </div>
            <div className="card p-5">
              <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 text-xs font-medium uppercase tracking-wide">
                <TrendingUp size={14} /> Forecasted Efficiency
              </div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white mt-2">
                {formatPct(overall?.forecastedEfficiencyPct)}
              </p>
              <p className="text-[11px] text-gray-400 mt-1">Source: Efficiency Plan + Forecasting</p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
