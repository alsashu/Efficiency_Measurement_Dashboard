import React, { useCallback, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { addMonths, differenceInCalendarMonths, endOfMonth, format, startOfMonth } from 'date-fns';
import { formatNumber, formatPct } from '../../utils/exportUtils';

const LABEL_COL_WIDTH = 200;
const MONTH_PX = 130;
const LANE_HEIGHT = 46;
const LANE_LINE_OFFSET = 30; // vertical center of the line/dots within a lane
const ROW_V_PADDING = 14;
const YEAR_ROW_HEIGHT = 28;
const QUARTER_ROW_HEIGHT = 24;
const MONTH_ROW_HEIGHT = 30;
const TOOLTIP_WIDTH = 340;
const MIN_LABEL_WIDTH = 64;

function toDate(val) {
  if (!val) return null;
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
}

// Fiscal year = 1 April – 31 March (established project-wide convention, see
// planAnalyticsController.js's periodType:'financial' handling). A "fiscal
// year boundary" is the 1 April that starts the next FY, i.e. the instant
// right after the previous FY's 31 March end.
function fiscalYearBoundaries(minDate, maxDate) {
  const boundaries = [];
  for (let year = minDate.getFullYear() - 1; year <= maxDate.getFullYear() + 1; year++) {
    const d = new Date(year, 3, 1); // 1 April
    if (d.getTime() >= minDate.getTime() && d.getTime() <= maxDate.getTime()) {
      boundaries.push(d);
    }
  }
  return boundaries;
}

// Calendar-quarter mapping (explicit, does not follow the Apr–Mar fiscal year
// used elsewhere): Q1 Jan–Mar, Q2 Apr–Jun, Q3 Jul–Sep, Q4 Oct–Dec.
function quarterOf(date) {
  return Math.floor(date.getMonth() / 3) + 1;
}

function InfoRow({ label, value }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1">
      <span className="text-[12.5px] text-gray-500 dark:text-gray-400">{label}</span>
      <span className="text-[13px] font-semibold text-gray-800 dark:text-gray-100 tabular-nums text-right">{value}</span>
    </div>
  );
}

function SegmentTooltip({ hover }) {
  if (!hover) return null;
  const { type, record: r, rect } = hover;
  const isForecast = type === 'forecast';

  const estHeight = isForecast ? 268 : 336;
  let left = rect.left + rect.width / 2 - TOOLTIP_WIDTH / 2;
  left = Math.max(12, Math.min(left, window.innerWidth - TOOLTIP_WIDTH - 12));
  let top = rect.top - estHeight - 10;
  let arrowSide = 'bottom';
  if (top < 8) {
    top = rect.bottom + 10;
    arrowSide = 'top';
  }

  return createPortal(
    <div
      className="fixed z-[9999] rounded-xl shadow-2xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 overflow-hidden pointer-events-none animate-fade-in"
      style={{ left, top, width: TOOLTIP_WIDTH }}
    >
      <div className={`flex items-center justify-between px-4 py-2.5 ${isForecast ? 'bg-amber-600' : 'bg-carbon'}`}>
        <span className="text-[13px] font-bold text-white tracking-wide">
          {isForecast ? 'Forecasting' : 'Efficiency Plan'}
        </span>
        <span className="text-[11px] font-medium text-white/70">
          {r.program_name}{r.dept ? ` | ${r.dept}` : ''}
        </span>
      </div>
      <div className="px-4 py-3">
        <InfoRow label="Baseline (BL)" value={r.baseline || '—'} />
        <InfoRow label="BL Start At" value={r._start ? format(r._start, 'd MMMM yyyy') : '—'} />
        <InfoRow label="BL End At" value={r._end ? format(r._end, 'd MMMM yyyy') : '—'} />
        <div className="my-1.5 border-t border-gray-100 dark:border-gray-700" />
        <InfoRow label="Estimation" value={`${formatNumber(r.estimated_hrs)} Hrs`} />
        {!isForecast && <InfoRow label="Actual" value={`${formatNumber(r.actual_hrs)} Hrs`} />}
        {!isForecast && <InfoRow label="Variance" value={`${formatNumber(r.effort_variance)} Hrs`} />}
        <div className="my-1.5 border-t border-gray-100 dark:border-gray-700" />
        <InfoRow label="Savings" value={`${formatNumber(r.savings_hrs)} Hrs`} />
        <InfoRow label="Efficiency" value={r.efficiency_pct != null ? formatPct(r.efficiency_pct) : '—'} />
      </div>
      <div className="mx-4 mb-3 px-3 py-2 rounded-lg bg-blue-50 dark:bg-blue-900/30 text-[11px] leading-snug text-blue-800 dark:text-blue-300">
        Savings = Effort saved from opportunities · Efficiency = Savings ÷ Estimated × 100
      </div>
    </div>,
    document.body
  );
}

export default function ForecastTimeline({ programs }) {
  const scrollRef = useRef(null);
  const showTimer = useRef(null);
  const [hover, setHover] = useState(null);

  const handleEnter = useCallback((e, type, record) => {
    const rect = e.currentTarget.getBoundingClientRect();
    clearTimeout(showTimer.current);
    showTimer.current = setTimeout(() => setHover({ type, record, rect }), 150);
  }, []);
  const handleLeave = useCallback(() => {
    clearTimeout(showTimer.current);
    setHover(null);
  }, []);

  const { minTime, maxTime, months, rows } = useMemo(() => {
    const rows = programs.map(p => ({
      ...p,
      planRecords: p.planRecords
        .map(r => ({ ...r, _start: toDate(r.baseline_start), _end: toDate(r.baseline_end) }))
        .filter(r => r._start && r._end)
        .sort((a, b) => a._start - b._start),
      forecastRecords: p.forecastRecords
        .map(r => ({ ...r, _start: toDate(r.baseline_start), _end: toDate(r.baseline_end) }))
        .filter(r => r._start && r._end)
        .sort((a, b) => a._start - b._start),
    }));

    const allDates = rows.flatMap(p => [
      ...p.planRecords.flatMap(r => [r._start, r._end]),
      ...p.forecastRecords.flatMap(r => [r._start, r._end]),
    ]);

    if (!allDates.length) return { minTime: null, maxTime: null, months: [], rows };

    const minDate = new Date(Math.min(...allDates.map(d => d.getTime())));
    const maxDate = new Date(Math.max(...allDates.map(d => d.getTime())));
    const domainStart = startOfMonth(minDate);
    const domainEnd = endOfMonth(maxDate);
    const totalMonths = differenceInCalendarMonths(domainEnd, domainStart) + 1;
    const months = Array.from({ length: totalMonths }, (_, i) => addMonths(domainStart, i));

    return { minTime: domainStart.getTime(), maxTime: domainEnd.getTime() + 1, months, rows };
  }, [programs]);

  if (!rows.length) {
    return (
      <div className="card p-12 text-center text-gray-400">
        <p className="font-medium">No programs match the selected filters</p>
      </div>
    );
  }
  if (minTime == null) {
    return (
      <div className="card p-12 text-center text-gray-400">
        <p className="font-medium">No baseline dates available to plot</p>
        <p className="text-sm mt-1">Selected programs have no valid Baseline Start/End dates.</p>
      </div>
    );
  }

  const trackWidth = months.length * MONTH_PX;
  const pxFor = (date) => ((date.getTime() - minTime) / (maxTime - minTime)) * trackWidth;

  const yearGroups = [];
  months.forEach((m, i) => {
    const y = m.getFullYear();
    const g = yearGroups[yearGroups.length - 1];
    if (g && g.year === y) g.last = m;
    else yearGroups.push({ year: y, first: m, last: m });
  });
  const yearBands = yearGroups.map(g => ({
    year: g.year,
    left: pxFor(g.first),
    width: pxFor(addMonths(g.last, 1)) - pxFor(g.first),
  }));

  const quarterGroups = [];
  months.forEach((m) => {
    const q = quarterOf(m);
    const y = m.getFullYear();
    const g = quarterGroups[quarterGroups.length - 1];
    if (g && g.year === y && g.quarter === q) g.last = m;
    else quarterGroups.push({ year: y, quarter: q, first: m, last: m });
  });
  const quarterBands = quarterGroups.map(g => ({
    quarter: g.quarter,
    year: g.year,
    left: pxFor(g.first),
    width: pxFor(addMonths(g.last, 1)) - pxFor(g.first),
  }));

  const now = new Date();
  const todayPx = now.getTime() >= minTime && now.getTime() <= maxTime ? pxFor(now) : null;

  const fyBoundaries = fiscalYearBoundaries(new Date(minTime), new Date(maxTime)).map(d => ({
    date: d,
    px: pxFor(d),
    label: `FY ${d.getFullYear()}-${String(d.getFullYear() + 1).slice(-2)}`,
  }));

  const headerHeight = YEAR_ROW_HEIGHT + QUARTER_ROW_HEIGHT + MONTH_ROW_HEIGHT;

  return (
    <div className="card overflow-hidden">
      {/* Legend */}
      <div className="flex items-center gap-6 px-5 pt-4 pb-3 text-xs text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-gray-800">
        <span className="flex items-center gap-2">
          <span className="inline-flex items-center gap-0.5">
            <span className="w-1.5 h-1.5 rounded-full bg-carbon dark:bg-blue-400" />
            <span className="inline-block w-5 h-[2px] rounded-full bg-carbon dark:bg-blue-400" />
            <span className="w-1.5 h-1.5 rounded-full bg-carbon dark:bg-blue-400" />
          </span>
          Efficiency Plan (Actual/Plan)
        </span>
        <span className="flex items-center gap-2">
          <span className="inline-flex items-center gap-0.5">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
            <span
              className="inline-block w-5 h-[2px]"
              style={{ backgroundImage: 'repeating-linear-gradient(90deg, #f59e0b 0 4px, transparent 4px 7px)' }}
            />
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
          </span>
          Forecasting (Plan)
        </span>
        <span className="flex items-center gap-2">
          <span className="inline-block w-0 h-3.5 border-l-2 border-dotted border-red-500" />
          Fiscal Year Boundary
        </span>
      </div>

      <div ref={scrollRef} className="overflow-x-auto" onScroll={handleLeave}>
        <div style={{ minWidth: LABEL_COL_WIDTH + trackWidth }}>
          {/* Two-tier header: Year band + Month ticks */}
          <div className="flex sticky top-0 bg-white dark:bg-gray-900 z-10 border-b border-gray-200 dark:border-gray-700">
            <div style={{ width: LABEL_COL_WIDTH, height: headerHeight }} className="flex-shrink-0 flex items-end pb-1.5 px-4">
              <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Program</span>
            </div>
            <div className="relative flex-shrink-0" style={{ width: trackWidth, height: headerHeight }}>
              {yearBands.map((g, i) => (
                <div
                  key={i}
                  className="absolute top-0 flex items-center justify-center text-[13px] font-bold text-gray-700 dark:text-gray-200 border-b border-gray-200 dark:border-gray-700"
                  style={{ left: g.left, width: g.width, height: YEAR_ROW_HEIGHT }}
                >
                  {g.year}
                </div>
              ))}
              {quarterBands.map((g, i) => (
                <div
                  key={i}
                  className="absolute flex items-center justify-center text-[11px] font-semibold text-gray-500 dark:text-gray-400 border-l border-b border-gray-200 dark:border-gray-700 bg-gray-50/60 dark:bg-gray-800/40"
                  style={{ left: g.left, top: YEAR_ROW_HEIGHT, width: g.width, height: QUARTER_ROW_HEIGHT }}
                >
                  Q{g.quarter}
                </div>
              ))}
              {months.map((m, i) => (
                <div
                  key={i}
                  className="absolute border-l border-gray-100 dark:border-gray-800 flex items-center pl-1.5"
                  style={{ left: pxFor(m), top: YEAR_ROW_HEIGHT + QUARTER_ROW_HEIGHT, width: MONTH_PX, height: MONTH_ROW_HEIGHT }}
                >
                  <span className="text-[10.5px] font-medium text-gray-400">{format(m, 'MMM')}</span>
                </div>
              ))}
              {fyBoundaries.map((fy, i) => (
                <div key={`fy-h-${i}`} className="absolute top-0 flex flex-col items-center" style={{ left: fy.px, height: headerHeight }}>
                  <span className="absolute -top-0.5 translate-x-[3px] whitespace-nowrap text-[9.5px] font-bold text-red-500 bg-white dark:bg-gray-900 px-1 rounded">
                    {fy.label}
                  </span>
                  <div className="border-l-2 border-dotted border-red-500 h-full" />
                </div>
              ))}
            </div>
          </div>

          {/* Rows */}
          {rows.map((p) => {
            const laneCount = Math.max(1, p.planRecords.length + p.forecastRecords.length);
            const rowHeight = laneCount * LANE_HEIGHT + ROW_V_PADDING * 2;
            let laneIdx = 0;

            return (
              <div
                key={`${p.dept}::${p.program_name}`}
                className="flex border-b border-gray-100 dark:border-gray-800 last:border-0 hover:bg-gray-50/70 dark:hover:bg-gray-800/40 transition-colors"
              >
                <div style={{ width: LABEL_COL_WIDTH }} className="flex-shrink-0 flex flex-col justify-center px-4 py-2">
                  <p className="text-[13.5px] font-semibold text-gray-800 dark:text-gray-100 truncate">{p.program_name}</p>
                  <p className="text-[11px] text-gray-400 truncate">{p.dept}</p>
                </div>
                <div className="relative flex-shrink-0" style={{ width: trackWidth, height: rowHeight }}>
                  {months.map((m, i) => (
                    <div
                      key={i}
                      className={
                        m.getMonth() % 3 === 0
                          ? 'absolute top-0 bottom-0 border-l border-gray-200 dark:border-gray-700'
                          : 'absolute top-0 bottom-0 border-l border-gray-100 dark:border-gray-800/70'
                      }
                      style={{ left: pxFor(m) }}
                    />
                  ))}
                  {fyBoundaries.map((fy, i) => (
                    <div key={`fy-${i}`} className="absolute top-0 bottom-0 border-l-2 border-dotted border-red-500/70" style={{ left: fy.px }} />
                  ))}
                  {todayPx != null && (
                    <div className="absolute top-0 bottom-0 border-l-2 border-dashed border-vibrant/50" style={{ left: todayPx }} />
                  )}

                  {p.planRecords.map((r) => {
                    const left = pxFor(r._start);
                    const width = Math.max(pxFor(r._end) - left, 4);
                    const top = ROW_V_PADDING + laneIdx * LANE_HEIGHT;
                    laneIdx += 1;
                    const showLabels = width >= MIN_LABEL_WIDTH;
                    return (
                      <div
                        key={`plan-${r.id}`}
                        className="absolute cursor-pointer group"
                        style={{ left, top, width, height: LANE_HEIGHT - 4 }}
                        onMouseEnter={(e) => handleEnter(e, 'plan', r)}
                        onMouseLeave={handleLeave}
                      >
                        {showLabels && (
                          <>
                            <span className="absolute left-0 top-0 -translate-x-1/2 text-[10px] font-medium text-carbon dark:text-blue-300 whitespace-nowrap">
                              {format(r._start, "MMM''yy")}
                            </span>
                            <span className="absolute right-0 top-0 translate-x-1/2 text-[10px] font-medium text-carbon dark:text-blue-300 whitespace-nowrap">
                              {format(r._end, "MMM''yy")}
                            </span>
                          </>
                        )}
                        <div
                          className="absolute left-0 right-0 h-[2.5px] rounded-full bg-carbon dark:bg-blue-400 group-hover:h-[3.5px] transition-all"
                          style={{ top: LANE_LINE_OFFSET - ROW_V_PADDING }}
                        />
                        <div
                          className="absolute w-2.5 h-2.5 rounded-full bg-carbon dark:bg-blue-400 ring-2 ring-white dark:ring-gray-900 -translate-x-1/2 -translate-y-1/2"
                          style={{ left: 0, top: LANE_LINE_OFFSET - ROW_V_PADDING }}
                        />
                        <div
                          className="absolute w-2.5 h-2.5 rounded-full bg-carbon dark:bg-blue-400 ring-2 ring-white dark:ring-gray-900 translate-x-1/2 -translate-y-1/2"
                          style={{ right: 0, top: LANE_LINE_OFFSET - ROW_V_PADDING }}
                        />
                      </div>
                    );
                  })}

                  {p.forecastRecords.map((r) => {
                    const left = pxFor(r._start);
                    const width = Math.max(pxFor(r._end) - left, 4);
                    const top = ROW_V_PADDING + laneIdx * LANE_HEIGHT;
                    laneIdx += 1;
                    const showLabels = width >= MIN_LABEL_WIDTH;
                    return (
                      <div
                        key={`fc-${r.id}`}
                        className="absolute cursor-pointer group"
                        style={{ left, top, width, height: LANE_HEIGHT - 4 }}
                        onMouseEnter={(e) => handleEnter(e, 'forecast', r)}
                        onMouseLeave={handleLeave}
                      >
                        {showLabels && (
                          <>
                            <span className="absolute left-0 top-0 -translate-x-1/2 text-[10px] font-medium text-amber-600 whitespace-nowrap">
                              {format(r._start, "MMM''yy")}
                            </span>
                            <span className="absolute right-0 top-0 translate-x-1/2 text-[10px] font-medium text-amber-600 whitespace-nowrap">
                              {format(r._end, "MMM''yy")}
                            </span>
                          </>
                        )}
                        <div
                          className="absolute left-0 right-0 h-[2px] group-hover:h-[3px] transition-all"
                          style={{
                            top: LANE_LINE_OFFSET - ROW_V_PADDING,
                            backgroundImage: 'repeating-linear-gradient(90deg, #f59e0b 0 5px, transparent 5px 9px)',
                          }}
                        />
                        <div
                          className="absolute w-2.5 h-2.5 rounded-full bg-amber-500 ring-2 ring-white dark:ring-gray-900 -translate-x-1/2 -translate-y-1/2"
                          style={{ left: 0, top: LANE_LINE_OFFSET - ROW_V_PADDING }}
                        />
                        <div
                          className="absolute w-2.5 h-2.5 rounded-full bg-amber-500 ring-2 ring-white dark:ring-gray-900 translate-x-1/2 -translate-y-1/2"
                          style={{ right: 0, top: LANE_LINE_OFFSET - ROW_V_PADDING }}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <SegmentTooltip hover={hover} />
    </div>
  );
}
