import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Autocomplete, TextField, ThemeProvider, StyledEngineProvider, createTheme } from '@mui/material';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFnsV3';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { Layers, RefreshCw, ArrowRight } from 'lucide-react';
import { planForecastApi } from '../../services/planApi';
import { useThemeStore } from '../../store/useStore';
import { SkeletonCard } from '../../components/ui/LoadingSpinner';
import {
  DEFAULT_FY_RANGE, fiscalYearOf, fyLabel, fyStartDate, fyEndDate, fyRangeFromDates, resolveFyRange,
} from '../../utils/fiscalYear';
import { endOfDay, format, startOfDay } from 'date-fns';
import ProgramEfficiencyPillars from './ProgramEfficiencyPillars';
import BaselineEfficiencyWaterfall from './BaselineEfficiencyWaterfall';

const defaultDates = () => resolveFyRange(DEFAULT_FY_RANGE.startFy, DEFAULT_FY_RANGE.endFy);

export default function Programs() {
  const { theme } = useThemeStore();
  const isDark = theme === 'dark';
  const [dept, setDept] = useState(null);
  const [program, setProgram] = useState(null);
  const [startDate, setStartDate] = useState(() => defaultDates().start);
  const [endDate, setEndDate] = useState(() => defaultDates().end);

  // One unfiltered fetch; Department / Program filtering happens client-side so
  // the dropdown options and FY range list come from the same data.
  const { data: timeline, isLoading } = useQuery({
    queryKey: ['programs-page-timeline'],
    queryFn: () => planForecastApi.getTimeline({}),
    select: r => r.data,
  });
  const allPrograms = timeline?.programs || [];

  const depts = useMemo(() => [...new Set(allPrograms.map(p => p.dept))].sort(), [allPrograms]);
  const programOptions = useMemo(() => {
    const source = dept ? allPrograms.filter(p => p.dept === dept) : allPrograms;
    return [...new Set(source.map(p => p.program_name))].sort();
  }, [allPrograms, dept]);

  const filteredPrograms = useMemo(
    () => allPrograms.filter(p => (!dept || p.dept === dept) && (!program || p.program_name === program)),
    [allPrograms, dept, program]
  );

  // FY options span the data plus the configured default and the current FY.
  const fyOptions = useMemo(() => {
    const years = [DEFAULT_FY_RANGE.startFy, DEFAULT_FY_RANGE.endFy, fiscalYearOf(new Date())];
    allPrograms.forEach(p => [...(p.planRecords || []), ...(p.forecastRecords || [])].forEach(r => {
      [r.baseline_start, r.baseline_end].forEach(v => {
        const d = v ? new Date(v) : null;
        if (d && !isNaN(d)) years.push(fiscalYearOf(d));
      });
    }));
    const lo = Math.min(...years);
    const hi = Math.max(...years);
    return Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
  }, [allPrograms]);

  const fySelection = fyRangeFromDates(startDate, endDate);

  const handleDeptChange = (_, value) => {
    setDept(value);
    if (value && program && !allPrograms.some(p => p.dept === value && p.program_name === program)) {
      setProgram(null);
    }
  };

  const handleStartFy = (_, fy) => {
    if (fy == null) return;
    setStartDate(fyStartDate(fy));
    if (!endDate || endDate < fyStartDate(fy)) setEndDate(fyEndDate(fy));
  };
  const handleEndFy = (_, fy) => {
    if (fy == null) return;
    setEndDate(fyEndDate(fy));
    if (!startDate || startDate > fyEndDate(fy)) setStartDate(fyStartDate(fy));
  };

  const resetPeriod = () => {
    const d = defaultDates();
    setStartDate(d.start);
    setEndDate(d.end);
  };
  const resetFilters = () => {
    setDept(null);
    setProgram(null);
    resetPeriod();
  };

  // Chart window falls back to the default FY range while a date is cleared/invalid.
  const validDate = (d) => d instanceof Date && !isNaN(d);
  const windowStart = validDate(startDate) ? startDate : defaultDates().start;
  const windowEnd = validDate(endDate) && endDate >= windowStart ? endDate : defaultDates().end;
  const chartStart = useMemo(() => startOfDay(windowStart), [windowStart.getTime()]); // eslint-disable-line react-hooks/exhaustive-deps
  const chartEnd = useMemo(() => endOfDay(windowEnd), [windowEnd.getTime()]); // eslint-disable-line react-hooks/exhaustive-deps

  const fmt = (d) => format(d, 'dd-MMM-yyyy');
  const chartContext = {
    dept: dept || 'All Departments',
    program: program || 'All Programs',
    period: fySelection
      ? `${fyLabel(fySelection.startFy)} → ${fyLabel(fySelection.endFy)} (${fmt(windowStart)} → ${fmt(windowEnd)})`
      : `${fmt(windowStart)} → ${fmt(windowEnd)}`,
  };

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
      MuiAutocomplete: { styleOverrides: { popupIndicator: { color: '#9ca3af' }, clearIndicator: { color: '#9ca3af' } } },
    } : {},
  }), [isDark]);

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          <Layers size={20} className="text-carbon dark:text-blue-400" />
          Programs
        </h2>
        <p className="text-xs text-gray-500 mt-0.5">
          Efficiency by baseline, stacked by opportunity category — Efficiency Plan vs Forecasting
        </p>
      </div>

      <StyledEngineProvider injectFirst>
        <ThemeProvider theme={muiTheme}>
          <div className="card p-4 flex flex-wrap items-end gap-4">
            <div className="w-full sm:w-56">
              <label className="label">Department</label>
              <Autocomplete
                size="small"
                options={depts}
                value={dept}
                onChange={handleDeptChange}
                loading={isLoading}
                renderInput={(params) => <TextField {...params} placeholder="All Departments" />}
              />
            </div>
            <div className="w-full sm:w-56">
              <label className="label">Program Name</label>
              <Autocomplete
                size="small"
                options={programOptions}
                value={program}
                onChange={(_, value) => setProgram(value)}
                loading={isLoading}
                renderInput={(params) => <TextField {...params} placeholder="All Programs" />}
              />
            </div>
            <div>
              <label className="label">Fiscal Year</label>
              <div className="flex items-center gap-2">
                <Autocomplete
                  size="small"
                  disableClearable
                  options={fyOptions}
                  value={fySelection?.startFy ?? null}
                  onChange={handleStartFy}
                  getOptionLabel={(fy) => fyLabel(fy)}
                  sx={{ width: 140 }}
                  renderInput={(params) => <TextField {...params} placeholder="Custom" inputProps={{ ...params.inputProps, 'aria-label': 'Start Fiscal Year' }} />}
                />
                <ArrowRight size={14} className="text-gray-400 flex-shrink-0" />
                <Autocomplete
                  size="small"
                  disableClearable
                  options={fyOptions}
                  value={fySelection?.endFy ?? null}
                  onChange={handleEndFy}
                  getOptionLabel={(fy) => fyLabel(fy)}
                  getOptionDisabled={(fy) => fySelection ? fy < fySelection.startFy : false}
                  sx={{ width: 140 }}
                  renderInput={(params) => <TextField {...params} placeholder="Custom" inputProps={{ ...params.inputProps, 'aria-label': 'End Fiscal Year' }} />}
                />
              </div>
            </div>
            <LocalizationProvider dateAdapter={AdapterDateFns}>
              <div>
                <label className="label">Time Interval</label>
                <div className="flex items-center gap-2">
                  <DatePicker
                    value={startDate}
                    onChange={setStartDate}
                    maxDate={endDate || undefined}
                    format="dd-MMM-yyyy"
                    slotProps={{ textField: { size: 'small', placeholder: 'Start Date', sx: { width: 160 } } }}
                  />
                  <ArrowRight size={14} className="text-gray-400 flex-shrink-0" />
                  <DatePicker
                    value={endDate}
                    onChange={setEndDate}
                    minDate={startDate || undefined}
                    format="dd-MMM-yyyy"
                    slotProps={{ textField: { size: 'small', placeholder: 'End Date', sx: { width: 160 } } }}
                  />
                </div>
              </div>
            </LocalizationProvider>
            <button
              onClick={resetFilters}
              className="btn-secondary text-xs ml-auto"
              title="Reset Department, Program and the default Fiscal Year range"
            >
              <RefreshCw size={12} /> Reset Filters
            </button>
          </div>
        </ThemeProvider>
      </StyledEngineProvider>

      {isLoading ? (
        <>
          <SkeletonCard />
          <SkeletonCard />
        </>
      ) : (
        <>
          <ProgramEfficiencyPillars
            programs={filteredPrograms}
            windowStart={chartStart}
            windowEnd={chartEnd}
            context={chartContext}
            isDark={isDark}
          />
          <BaselineEfficiencyWaterfall
            programs={filteredPrograms}
            windowStart={chartStart}
            windowEnd={chartEnd}
            context={chartContext}
            isDark={isDark}
          />
        </>
      )}
    </div>
  );
}
