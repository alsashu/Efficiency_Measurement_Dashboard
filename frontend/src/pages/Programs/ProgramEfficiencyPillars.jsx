import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { addMonths, differenceInCalendarMonths, format, startOfMonth } from 'date-fns';
import clsx from 'clsx';
import { CONSOLIDATED_META, CONSOLIDATION_MAP } from '../PlanDashboard/charts/PlanOpportunityDonutChart';
import { formatNumber, formatPct } from '../../utils/exportUtils';
import { fiscalQuarterOf, fiscalYearOf, fyLabel } from '../../utils/fiscalYear';

// Program Efficiency & Opportunity Analysis — modelled on the Chart-2 reference
// (quarterly "commit pipeline" chart), with Efficiency (%) as the height:
//
//  • The period lives ONLY in the timeline header at the top:
//    FY (red labels + red dotted boundaries) → Year → Quarter → Month.
//  • Every month in the window is shown; a baseline's grey pillar (height =
//    its Efficiency %) sits under the month of its End Date.
//  • Each quarter's Total column(s) — stacked by the 5 opportunity categories,
//    height = Σ savings ÷ Σ estimated — sit in the quarter's last month.
//  • A ribbon above each quarter's tallest column shows only the quarter's
//    efficiency (navy = Plan, amber = Forecast), with dashed guides to the axis.
//  • FY totals and the grey "Overall" bar sit in a Totals zone at the far right
//    (the reference's "FYE Total" / "Business Plan" columns).
//  • Forecasting uses the same shapes with a hatched fill + dashed outline.
// Fixed column width / spacing; the plot scrolls horizontally.

export const STACK_ORDER = ['automation', 'cicd_devx', 'ai_assisted', 'ref_lib_sdlc', 'simulator_tools']; // bottom → top
const META_BY_KEY = Object.fromEntries(CONSOLIDATED_META.map(m => [m.key, m]));
export const SHORT_NAME = {
  automation: 'Automation',
  cicd_devx: 'CI/CD / DevX',
  ai_assisted: 'AI Assisted / Copilot',
  ref_lib_sdlc: 'Reference / SDLC',
  simulator_tools: 'Simulator & Tools',
};
const UNCAT = '_none';
const UNCAT_COLOR = { light: '#9ca3af', dark: '#6b7280' };

const COL_W = 44;
const COL_GAP = 12;
const CELL_PAD = 10;
const MONTH_MIN_W = 56;   // empty months stay narrow but readable
const TOTALS_GAP = 28;    // space between the timeline and the Totals zone
const FY_ROW_H = 18;
const YEAR_ROW_H = 26;
const QUARTER_ROW_H = 24;
const MONTH_ROW_H = 24;
const HEADER_H = FY_ROW_H + YEAR_ROW_H + QUARTER_ROW_H + MONTH_ROW_H;
const PLOT_TOP = HEADER_H + 86; // room for up to two stacked ribbons above the tallest column
const LABEL_CHAR_W = 6.2;   // ≈ width of one 10.5px x-axis character
const MAX_SLOT_W = 160;     // longer baseline names are truncated (full name in a tooltip)
const PLOT_H = 320;
const BAND_H = 24;
const BAND_GAP = 10;      // between the ribbon and the tallest column under it
const RIBBON_GAP = 3;     // between stacked Efficiency / Forecasted ribbons
const LABEL_H = 44;
const AXIS_W = 56;
const TICKS = 5;
const TIP_W = 290;

const num = v => (v == null || v === '' || isNaN(parseFloat(v)) ? null : parseFloat(v));
const fmtDate = d => (d ? format(d, 'dd-MMM-yyyy') : '—');
const baselineLabel = item => `BL ${item.baseline || '—'}`;
const shortFy = fy => `FY${String(fy).slice(-2)}-${String(fy + 1).slice(-2)}`;

/** Nice y-axis top with ~15% headroom above the tallest column. */
export function efficiencyScale(maxPct) {
  const target = Math.max(maxPct, 1) * 1.15;
  const raw = target / TICKS;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map(m => m * pow).find(s => s >= raw);
  return { top: step * TICKS, ticks: Array.from({ length: TICKS + 1 }, (_, i) => +(i * step).toFixed(4)) };
}

function consolidate(categories = {}) {
  const out = Object.fromEntries(STACK_ORDER.map(k => [k, 0]));
  for (const [raw, v] of Object.entries(categories || {})) {
    const key = CONSOLIDATION_MAP[raw];
    if (key) out[key] += parseFloat(v) || 0;
  }
  return out;
}

/** Efficiency + category segments for a set of baselines: Σ savings ÷ Σ estimated. */
function aggregate(items) {
  const counted = items.filter(i => (num(i.estimated_hrs) ?? 0) > 0);
  const est = counted.reduce((s, i) => s + num(i.estimated_hrs), 0);
  const sav = counted.reduce((s, i) => s + (num(i.savings_hrs) ?? 0), 0);
  const cats = Object.fromEntries(STACK_ORDER.map(k => [k, items.reduce((s, i) => s + i.cats[k], 0)]));
  const eff = est > 0 ? Math.max(0, (sav / est) * 100) : 0;
  return { count: items.length, est, sav, eff, cats, segments: segmentsOf(eff, cats, sav) };
}

function segmentsOf(eff, cats, savings) {
  const total = STACK_ORDER.reduce((s, k) => s + cats[k], 0);
  if (total > 0) {
    return STACK_ORDER.filter(k => cats[k] > 0)
      .map(k => ({ key: k, hrs: cats[k], share: cats[k] / total, pct: eff * (cats[k] / total) }));
  }
  return eff > 0 ? [{ key: UNCAT, hrs: savings ?? 0, share: 1, pct: eff }] : [];
}

/**
 * Programs → fiscal-quarter model. A baseline belongs to the quarter of its
 * End Date and is included when that date is inside the selected window.
 */
export function buildQuarterModel(programs, windowStart, windowEnd) {
  const items = [];
  programs.forEach(p => {
    const add = (r, kind) => {
      const end = r.baseline_end ? new Date(r.baseline_end) : null;
      if (!end || isNaN(end) || end < windowStart || end > windowEnd) return;
      const start = r.baseline_start ? new Date(r.baseline_start) : null;
      const cats = consolidate(r.categories);
      const eff = Math.max(0, num(r.efficiency_pct) ?? 0);
      items.push({
        ...r, kind, dept: p.dept, program_name: p.program_name,
        _start: start && !isNaN(start) ? start : null, _end: end,
        fy: fiscalYearOf(end), q: fiscalQuarterOf(end),
        eff, cats, segments: segmentsOf(eff, cats, num(r.savings_hrs)),
      });
    };
    (p.planRecords || []).forEach(r => add(r, 'plan'));
    (p.forecastRecords || []).forEach(r => add(r, 'forecast'));
  });

  const byQuarter = new Map();
  items.forEach(i => {
    const key = `${i.fy}-${i.q}`;
    if (!byQuarter.has(key)) byQuarter.set(key, { fy: i.fy, q: i.q, items: [] });
    byQuarter.get(key).items.push(i);
  });
  const quarters = [...byQuarter.values()]
    .sort((a, b) => a.fy - b.fy || a.q - b.q)
    .map(g => {
      g.items.sort((a, b) => a._end - b._end || (a.kind === 'plan' ? -1 : 1)
        || String(a.baseline).localeCompare(String(b.baseline), undefined, { numeric: true }));
      const plan = g.items.filter(i => i.kind === 'plan');
      const forecast = g.items.filter(i => i.kind === 'forecast');
      return { ...g, plan: plan.length ? aggregate(plan) : null, forecast: forecast.length ? aggregate(forecast) : null };
    });

  const fys = [...new Set(quarters.map(q => q.fy))].map(fy => {
    const all = quarters.filter(q => q.fy === fy).flatMap(q => q.items);
    const plan = all.filter(i => i.kind === 'plan');
    const forecast = all.filter(i => i.kind === 'forecast');
    return { fy, plan: plan.length ? aggregate(plan) : null, forecast: forecast.length ? aggregate(forecast) : null };
  });
  const allPlan = items.filter(i => i.kind === 'plan');
  const overall = allPlan.length ? aggregate(allPlan) : null;
  return { quarters, fys, overall, count: items.length };
}

/**
 * Lay the model out on a continuous month timeline. Every month in the window
 * gets a cell (empty months stay narrow); a baseline pillar sits in the cell of
 * its End Date month, and each quarter's Total columns sit in the quarter's
 * last visible month. FY totals + Overall go in a separate "Totals" zone at the
 * far right (the reference's "FYE Total" / "Business Plan" columns).
 */
function layoutTimeline(model, windowStart, windowEnd) {
  const first = startOfMonth(windowStart);
  const nMonths = differenceInCalendarMonths(windowEnd, first) + 1;
  const months = Array.from({ length: nMonths }, (_, i) => addMonths(first, i));
  const fqKey = m => `${fiscalYearOf(m)}-${fiscalQuarterOf(m)}`;
  const quarterByKey = new Map(model.quarters.map(q => [`${q.fy}-${q.q}`, q]));
  const lastMonthOfQuarter = new Map(months.map(m => [fqKey(m), m.getTime()])); // later months overwrite

  const cells = [];
  let x = 0;
  months.forEach(m => {
    const q = quarterByKey.get(fqKey(m));
    const cols = (q?.items || [])
      .filter(i => i._end.getFullYear() === m.getFullYear() && i._end.getMonth() === m.getMonth())
      .map(i => ({ type: 'baseline', item: i, eff: i.eff, kind: i.kind }));
    if (q && lastMonthOfQuarter.get(fqKey(m)) === m.getTime()) {
      ['plan', 'forecast'].forEach(kind => {
        if (q[kind]) cols.push({ type: 'total', agg: q[kind], kind, scope: `Q${q.q} ${fyLabel(q.fy)}`, eff: q[kind].eff });
      });
    }
    // Each baseline slot is wide enough for its x-axis name, so labels never overlap.
    cols.forEach(c => {
      c.slotW = c.type === 'baseline'
        ? Math.min(MAX_SLOT_W, Math.max(COL_W, baselineLabel(c.item).length * LABEL_CHAR_W + 6))
        : COL_W;
    });
    const contentW = cols.length ? cols.reduce((s, c) => s + c.slotW, 0) + (cols.length - 1) * COL_GAP : 0;
    const w = Math.max(MONTH_MIN_W, contentW + CELL_PAD * 2);
    let cx = x + (w - contentW) / 2;
    cols.forEach(c => { c.x = cx + (c.slotW - COL_W) / 2; cx += c.slotW + COL_GAP; });
    cells.push({ month: m, x, w, cols, fy: fiscalYearOf(m), q: fiscalQuarterOf(m), key: fqKey(m) });
    x += w;
  });
  const timelineW = x;

  const span = (keyFn, extra) => {
    const out = [];
    cells.forEach(c => {
      const k = keyFn(c);
      const last = out[out.length - 1];
      if (last && last.key === k) { last.w += c.w; last.cols.push(...c.cols); }
      else out.push({ key: k, x: c.x, w: c.w, cols: [...c.cols], ...extra(c) });
    });
    return out;
  };
  const quarterSpans = span(c => c.key, c => ({ fy: c.fy, q: c.q, agg: quarterByKey.get(c.key) }));
  const yearSpans = span(c => String(c.month.getFullYear()), c => ({ year: c.month.getFullYear() }));
  const fyMarks = cells
    .filter((c, i) => i === 0 || c.month.getMonth() === 3)
    .map(c => ({ x: c.x, fy: c.fy, boundary: c.month.getMonth() === 3 }));

  // Totals zone
  x += TOTALS_GAP;
  const totalsX = x;
  const totals = [];
  const totalsLabels = []; // one label per FY group (Plan + Forecast pair), centred under it
  x += CELL_PAD;
  model.fys.forEach(f => {
    const startX = x;
    const kinds = ['plan', 'forecast'].filter(k => f[k]);
    kinds.forEach((kind, i) => {
      totals.push({ type: 'total', agg: f[kind], kind, scope: fyLabel(f.fy), eff: f[kind].eff, x });
      x += COL_W + (i < kinds.length - 1 ? 4 : 0);
    });
    totalsLabels.push({ x: (startX + x) / 2, text: shortFy(f.fy) });
    x += COL_GAP * 2;
  });
  if (model.fys.length > 1 && model.overall) {
    totals.push({ type: 'overall', agg: model.overall, kind: 'plan', scope: 'Selected period', eff: model.overall.eff, x });
    totalsLabels.push({ x: x + COL_W / 2, text: 'Overall' });
    x += COL_W + COL_GAP * 2;
  }
  x += CELL_PAD - COL_GAP * 2;

  return { cells, quarterSpans, yearSpans, fyMarks, totals, totalsLabels, totalsX, totalsW: x - totalsX, timelineW, width: x };
}

function HatchSwatch({ color, id, size = 12 }) {
  return (
    <svg width={size} height={size} className="flex-shrink-0" aria-hidden="true">
      <defs>
        <pattern id={id} patternUnits="userSpaceOnUse" width="4" height="4" patternTransform="rotate(45)">
          <rect width="4" height="4" fill={color} fillOpacity="0.18" />
          <line x1="0" y1="0" x2="0" y2="4" stroke={color} strokeWidth="2" />
        </pattern>
      </defs>
      <rect width={size} height={size} fill={`url(#${id})`} stroke={color} strokeDasharray="2 1.5" />
    </svg>
  );
}

function TipRow({ label, value, tone, swatch }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-[3px]">
      <span className="text-[12px] text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
        {swatch && <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: swatch }} />}
        {label}
      </span>
      <span className={clsx('text-[12.5px] font-semibold tabular-nums text-right',
        tone === 'neg' ? 'text-rose-600 dark:text-rose-400' : 'text-gray-800 dark:text-gray-100')}>
        {value}
      </span>
    </div>
  );
}

function ChartTooltip({ tip, colorOf }) {
  if (!tip) return null;
  const { col, segment: s, x, y } = tip;
  const isForecast = col.kind === 'forecast';
  let rows;
  if (col.type === 'baseline') {
    const b = col.item;
    rows = [
      ['Program', `${b.program_name} · ${b.dept}`],
      ['Baseline', b.baseline || '—'],
      ['Start', fmtDate(b._start)],
      ['End', fmtDate(b._end)],
      ['Estimated', `${formatNumber(b.estimated_hrs)} Hrs`],
      ...(!isForecast ? [
        ['Actual', `${formatNumber(b.actual_hrs)} Hrs`],
        ['Variance', `${formatNumber(b.effort_variance)} Hrs`, parseFloat(b.effort_variance) < 0 ? 'neg' : null],
      ] : []),
      ['Savings', `${formatNumber(b.savings_hrs)} Hrs`],
      ['Efficiency', formatPct(b.eff)],
      ...b.segments.map(seg => [
        seg.key === UNCAT ? 'Uncategorised' : SHORT_NAME[seg.key],
        `${formatNumber(seg.hrs)} Hrs · ${formatPct(seg.share * 100)}`, null, colorOf(seg.key),
      ]),
    ];
  } else if (s) {
    rows = [
      ['Scope', col.scope],
      ['Category', s.key === UNCAT ? 'Uncategorised' : META_BY_KEY[s.key].name],
      ['Saved', `${formatNumber(s.hrs)} Hrs`],
      ['Contribution', formatPct(s.share * 100)],
      ['Efficiency Share', formatPct(s.pct)],
      ['Total Efficiency', formatPct(col.agg.eff)],
    ];
  } else {
    rows = [
      ['Scope', col.scope],
      ['Baselines', formatNumber(col.agg.count)],
      ['Estimated', `${formatNumber(col.agg.est)} Hrs`],
      ['Savings', `${formatNumber(col.agg.sav)} Hrs`],
      ['Efficiency', formatPct(col.agg.eff)],
    ];
  }
  const estH = 44 + rows.length * 24;
  const left = Math.max(12, Math.min(x - TIP_W / 2, window.innerWidth - TIP_W - 12));
  let top = y - estH - 14;
  if (top < 8) top = y + 18;

  return createPortal(
    <div
      role="tooltip"
      className="fixed z-[9999] rounded-xl shadow-2xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 overflow-hidden pointer-events-none"
      style={{ left, top, width: TIP_W }}
    >
      <div className={clsx('px-4 py-2', isForecast ? 'bg-amber-600' : 'bg-carbon')}>
        <span className="text-[13px] font-bold text-white">{isForecast ? 'Forecasting' : 'Efficiency Plan'}</span>
      </div>
      <div className="px-4 py-2">
        {rows.map(([l, v, tone, swatch]) => <TipRow key={l} label={l} value={v} tone={tone} swatch={swatch} />)}
      </div>
    </div>,
    document.body
  );
}

export default function ProgramEfficiencyPillars({ programs, windowStart, windowEnd, context, isDark }) {
  const [hidden, setHidden] = useState(() => new Set());
  const [tip, setTip] = useState(null);

  const model = useMemo(() => buildQuarterModel(programs, windowStart, windowEnd), [programs, windowStart, windowEnd]);
  const L = useMemo(() => layoutTimeline(model, windowStart, windowEnd), [model, windowStart, windowEnd]);

  const colorOf = (key) => (key === UNCAT ? UNCAT_COLOR : META_BY_KEY[key])[isDark ? 'dark' : 'light'];
  const navy = isDark ? '#264058' : '#1E3246';
  const ribbonForecast = isDark ? '#b45309' : '#d97706'; // amber — matches the Forecasting tooltip header
  const grey = isDark ? '#4b5563' : '#c3c8cf';
  const gridColor = isDark ? '#374151' : '#eef0f3';
  const monthLine = isDark ? '#1f2937' : '#f3f4f6';
  const quarterLine = isDark ? '#374151' : '#e5e7eb';
  const headerFill = isDark ? '#1f2937' : '#f9fafb';
  const guideColor = isDark ? '#4b6a8a' : '#1E3246';
  const axisText = isDark ? '#9ca3af' : '#6b7280';
  const strongText = isDark ? '#f3f4f6' : '#111827';
  const fyRed = '#ef4444';
  const forecastStroke = '#d97706';
  const panelBg = isDark ? '#111827' : '#ffffff';

  const allCols = [...L.cells.flatMap(c => c.cols), ...L.totals];
  const { top: yTop, ticks } = efficiencyScale(Math.max(0, ...allCols.map(c => c.eff)));
  const yOf = (pct) => PLOT_TOP + PLOT_H - (pct / yTop) * PLOT_H;
  const baseY = PLOT_TOP + PLOT_H;
  const svgH = baseY + LABEL_H;

  const toggle = (key) => setHidden(prev => {
    const next = new Set(prev);
    next.has(key) ? next.delete(key) : next.add(key);
    return next;
  });
  const showTip = (e, col, segment) => setTip({ col, segment, x: e.clientX, y: e.clientY });
  const hideTip = () => setTip(null);

  const header = (
    <div className="px-5 pt-4 pb-3 border-b border-gray-100 dark:border-gray-800 text-center">
      <h3 className="text-sm font-bold text-gray-900 dark:text-white">Program Efficiency &amp; Opportunity Analysis</h3>
      <div className="flex flex-wrap justify-center gap-x-5 gap-y-1 mt-1 text-[12px] text-gray-500 dark:text-gray-400">
        <span>Department: <strong className="text-gray-800 dark:text-gray-200">{context.dept}</strong></span>
        <span>Program: <strong className="text-gray-800 dark:text-gray-200">{context.program}</strong></span>
        <span>Fiscal Period: <strong className="text-gray-800 dark:text-gray-200">{context.period}</strong></span>
      </div>
    </div>
  );

  const legend = (
    <div className="w-full md:w-48 flex-shrink-0 px-5 md:pr-2 py-4 space-y-1.5">
      {STACK_ORDER.map(k => {
        const off = hidden.has(k);
        return (
          <button
            key={k}
            type="button"
            onClick={() => toggle(k)}
            aria-pressed={!off}
            title={`${META_BY_KEY[k].name} — click to ${off ? 'show' : 'hide'}`}
            className={clsx(
              'flex items-center gap-2 text-left text-[12px] leading-tight transition-opacity w-full',
              off ? 'opacity-40 line-through' : 'text-gray-700 dark:text-gray-200 hover:opacity-80'
            )}
          >
            <span className="w-3 h-3 flex-shrink-0 rounded-sm" style={{ background: colorOf(k) }} />
            {SHORT_NAME[k]}
          </button>
        );
      })}
      <div className="pt-3 mt-2 border-t border-gray-100 dark:border-gray-800 space-y-1.5 text-[11.5px] text-gray-500 dark:text-gray-400">
        <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-sm" style={{ background: grey }} /> Baseline</div>
        <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-sm bg-gray-500" /> Solid = Efficiency Plan</div>
        <div className="flex items-center gap-2"><HatchSwatch color={isDark ? '#9ca3af' : '#6b7280'} id="q-legend-hatch" /> Hatched = Forecasting</div>
        <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-sm" style={{ background: navy }} /> Efficiency header</div>
        <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-sm" style={{ background: ribbonForecast }} /> Forecasted header</div>
        <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-sm" style={{ background: `linear-gradient(${colorOf('automation')} 50%, ${colorOf('ref_lib_sdlc')} 50%)` }} /> Quarter total (by category)</div>
        <div className="flex items-center gap-2"><span className="w-0 h-3 ml-1.5 mr-1 border-l-2 border-dotted border-red-500" /> FY boundary</div>
      </div>
    </div>
  );

  if (!model.count) {
    return (
      <div className="card overflow-hidden">
        {header}
        <div className="p-12 text-center text-gray-400">
          <p className="font-medium">No baselines end in the selected period</p>
          <p className="text-sm mt-1">Adjust the Department, Program or Fiscal Year / Time Interval filters.</p>
        </div>
      </div>
    );
  }

  const renderStack = (col, segments, isForecast) => {
    let cursor = 0;
    return segments.map(seg => {
      if (hidden.has(seg.key)) return null;
      const y0 = yOf(cursor + seg.pct);
      const h = yOf(cursor) - y0;
      cursor += seg.pct;
      if (h <= 0) return null;
      return (
        <g key={seg.key}>
          <rect
            x={col.x} y={y0} width={COL_W} height={h}
            fill={isForecast ? `url(#q-hatch-${seg.key})` : colorOf(seg.key)}
            stroke={panelBg} strokeWidth="1"
            className="cursor-pointer hover:opacity-80 transition-opacity"
            onMouseMove={e => showTip(e, col, seg)} onMouseLeave={hideTip}
            data-testid="pillar-segment" data-category={seg.key}
          />
          {h >= 16 && (
            <text x={col.x + COL_W / 2} y={y0 + h / 2 + 4} textAnchor="middle" fontSize="10" fontWeight="700"
              fill={isForecast ? strongText : '#ffffff'} pointerEvents="none">
              {`${Math.round(seg.share * 100)}%`}
            </text>
          )}
        </g>
      );
    });
  };

  // showValue: only the Totals zone prints efficiency on the column itself —
  // on the timeline the quarter ribbon is the single place the value appears.
  const renderColumn = (col, key, { showValue = false } = {}) => {
    const isForecast = col.kind === 'forecast';
    const topY = yOf(col.eff);
    const h = baseY - topY;
    const valueLabel = formatPct(col.eff);

    if (col.type === 'baseline') {
      // X-axis shows the Baseline name only; truncated to its slot, full name on hover.
      const full = baselineLabel(col.item);
      const maxChars = Math.max(4, Math.floor((col.slotW - 4) / LABEL_CHAR_W));
      const text = full.length > maxChars ? `${full.slice(0, maxChars - 1)}…` : full;
      return (
        <g key={key} data-testid={`pillar-${col.kind}`} data-baseline={col.item.baseline} data-efficiency={col.eff}
          className="cursor-pointer" onMouseMove={e => showTip(e, col, null)} onMouseLeave={hideTip}>
          <rect x={col.x} y={topY} width={COL_W} height={Math.max(h, 1.5)}
            fill={isForecast ? 'url(#q-hatch-grey)' : grey}
            stroke={isForecast ? forecastStroke : 'none'} strokeDasharray={isForecast ? '4 3' : undefined} strokeWidth="1.25"
            className="hover:opacity-80 transition-opacity" />
          <text x={col.x + COL_W / 2} y={baseY + 16} textAnchor="middle" fontSize="10.5" fontWeight="600"
            fill={isForecast ? forecastStroke : strongText} data-testid="x-label">
            {text !== full && <title>{full}</title>}
            {text}
          </text>
        </g>
      );
    }

    if (col.type === 'overall') {
      return (
        <g key={key} data-testid="pillar-overall" onMouseMove={e => showTip(e, col, null)} onMouseLeave={hideTip} className="cursor-pointer">
          <rect x={col.x} y={topY} width={COL_W} height={h} fill={grey} />
          {h > 90 && (
            <text x={col.x + COL_W / 2 + 7} y={topY + h / 2} transform={`rotate(-90 ${col.x + COL_W / 2 + 7} ${topY + h / 2})`}
              textAnchor="middle" fontSize="20" fontWeight="800" letterSpacing="1" fill={strongText}>
              OVERALL
            </text>
          )}
          <text x={col.x + COL_W / 2} y={topY - 6} textAnchor="middle" fontSize="12" fontWeight="800" fill={strongText}>{valueLabel}</text>
        </g>
      );
    }

    // Quarter / FY total — stacked by category
    const visibleTop = col.agg.segments.reduce((s, seg) => s + (hidden.has(seg.key) ? 0 : seg.pct), 0);
    return (
      <g key={key} data-testid={`total-${col.kind}`} data-scope={col.scope} data-efficiency={col.eff}>
        <rect x={col.x - 2} y={PLOT_TOP - 4} width={COL_W + 4} height={Math.max(0, yOf(visibleTop) - PLOT_TOP + 4)}
          fill="transparent" onMouseMove={e => showTip(e, col, null)} onMouseLeave={hideTip} data-testid="total-summary" />
        {hidden.size > 0 && col.eff > 0 && (
          <rect x={col.x + 0.5} y={topY} width={COL_W - 1} height={h} fill="none"
            stroke={axisText} strokeOpacity="0.5" strokeDasharray="2 2" pointerEvents="none" />
        )}
        {renderStack(col, col.agg.segments, isForecast)}
        {isForecast && visibleTop > 0 && (
          <rect x={col.x} y={yOf(visibleTop)} width={COL_W} height={baseY - yOf(visibleTop)}
            fill="none" stroke={forecastStroke} strokeWidth="1.5" strokeDasharray="4 3" pointerEvents="none" />
        )}
        {showValue && (
          <text x={col.x + COL_W / 2} y={topY - 6} textAnchor="middle" fontSize="11.5" fontWeight="800"
            fill={isForecast ? forecastStroke : strongText} pointerEvents="none">
            {valueLabel}
          </text>
        )}
      </g>
    );
  };

  const yRowTop = FY_ROW_H;
  const qRowTop = FY_ROW_H + YEAR_ROW_H;
  const mRowTop = qRowTop + QUARTER_ROW_H;

  return (
    <div className="card overflow-hidden">
      {header}
      <div className="flex flex-col md:flex-row">
        {legend}
        <div className="flex flex-1 min-w-0">
          {/* Fixed y-axis */}
          <svg width={AXIS_W} height={svgH} className="flex-shrink-0" aria-hidden="true">
            <line x1={0} x2={AXIS_W} y1={HEADER_H} y2={HEADER_H} stroke={quarterLine} />
            <text x={12} y={PLOT_TOP + PLOT_H / 2} transform={`rotate(-90 12 ${PLOT_TOP + PLOT_H / 2})`} textAnchor="middle" fontSize="11" fontWeight="600" fill={axisText}>
              Efficiency (%)
            </text>
            {ticks.map(t => (
              <text key={t} x={AXIS_W - 8} y={yOf(t) + 4} textAnchor="end" fontSize="10.5" fill={axisText}>{`${+t.toFixed(1)}%`}</text>
            ))}
          </svg>

          <div className="overflow-x-auto flex-1" onScroll={hideTip} data-testid="pillars-scroll">
            <svg width={L.width} height={svgH} role="img" aria-label="Efficiency by baseline on a fiscal-year timeline, with opportunity category totals">
              <defs>
                {[...STACK_ORDER, UNCAT].map(k => (
                  <pattern key={k} id={`q-hatch-${k}`} patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
                    <rect width="6" height="6" fill={colorOf(k)} fillOpacity="0.22" />
                    <line x1="0" y1="0" x2="0" y2="6" stroke={colorOf(k)} strokeWidth="3" />
                  </pattern>
                ))}
                <pattern id="q-hatch-grey" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
                  <rect width="6" height="6" fill={grey} fillOpacity="0.35" />
                  <line x1="0" y1="0" x2="0" y2="6" stroke={isDark ? '#9ca3af' : '#8b929c'} strokeWidth="2.5" />
                </pattern>
              </defs>

              {/* ── Timeline header: FY → Year → Quarter → Month ─────────── */}
              <g data-testid="timeline-header">
                {L.yearSpans.map(y => (
                  <text key={`y${y.key}`} x={y.x + y.w / 2} y={yRowTop + 18} textAnchor="middle" fontSize="13" fontWeight="700" fill={strongText}>
                    {y.year}
                  </text>
                ))}
                {L.quarterSpans.map(q => (
                  <g key={`q${q.key}`}>
                    <rect x={q.x} y={qRowTop} width={q.w} height={QUARTER_ROW_H} fill={headerFill} />
                    <line x1={q.x} x2={q.x} y1={qRowTop} y2={HEADER_H} stroke={quarterLine} />
                    <text x={q.x + q.w / 2} y={qRowTop + 16} textAnchor="middle" fontSize="11" fontWeight="600" fill={axisText}>
                      {`Q${q.q}`}
                    </text>
                  </g>
                ))}
                {L.cells.map(c => (
                  <g key={`m${c.month.getTime()}`}>
                    <line x1={c.x} x2={c.x} y1={mRowTop} y2={HEADER_H} stroke={quarterLine} />
                    <text x={c.x + 7} y={mRowTop + 16} fontSize="10.5" fill={axisText}>
                      <title>{format(c.month, 'MMMM yyyy')}</title>
                      {format(c.month, 'MMM')}
                    </text>
                  </g>
                ))}
                {[qRowTop, mRowTop, HEADER_H].map(y => (
                  <line key={`h${y}`} x1={0} x2={L.timelineW} y1={y} y2={y} stroke={quarterLine} />
                ))}
                {/* Totals zone header */}
                <rect x={L.totalsX} y={yRowTop} width={L.totalsW} height={HEADER_H - yRowTop} fill={headerFill} stroke={quarterLine} />
                <text x={L.totalsX + L.totalsW / 2} y={yRowTop + (HEADER_H - yRowTop) / 2 + 4} textAnchor="middle" fontSize="11" fontWeight="700" fill={axisText}>
                  TOTALS
                </text>
                {L.fyMarks.map(f => (
                  <text key={`fy${f.fy}`} x={f.x + 4} y={12} fontSize="10" fontWeight="700" fill={fyRed}>{fyLabel(f.fy)}</text>
                ))}
              </g>

              {/* ── Plot grid ─────────────────────────────────────────────── */}
              {ticks.slice(1).map(t => (
                <line key={t} x1={0} x2={L.width} y1={yOf(t)} y2={yOf(t)} stroke={gridColor} />
              ))}
              {L.cells.map(c => (
                <line key={`mg${c.month.getTime()}`} x1={c.x} x2={c.x} y1={HEADER_H} y2={baseY}
                  stroke={c.month.getMonth() % 3 === 0 ? quarterLine : monthLine} />
              ))}
              <line x1={0} x2={L.width} y1={baseY} y2={baseY} stroke={isDark ? '#4b5563' : '#9ca3af'} />

              {/* ── Quarter ribbons: efficiency only (period is in the header) ── */}
              {L.quarterSpans.filter(q => q.agg && q.cols.length).map(q => {
                // Efficiency (navy) sits directly above the columns; Forecasted (amber)
                // stacks on top of it — both full width so the wording always fits.
                const kinds = ['plan', 'forecast'].filter(k => q.agg[k]);
                const maxEff = Math.max(0, ...q.cols.map(c => c.eff));
                const stackH = kinds.length * BAND_H + (kinds.length - 1) * RIBBON_GAP;
                const bandBottom = Math.max(HEADER_H + 8 + stackH, yOf(maxEff) - BAND_GAP);
                const ribbonW = q.w - 6;
                return (
                  <g key={`r${q.key}`} data-testid="quarter-ribbon">
                    {kinds.map((k, i) => {
                      const pct = formatPct(q.agg[k].eff);
                      const full = `${k === 'forecast' ? 'Forecasted' : 'Efficiency'} ${pct}`;
                      const text = full.length * 6.4 + 10 <= ribbonW ? full : pct;
                      const top = bandBottom - BAND_H - i * (BAND_H + RIBBON_GAP);
                      return (
                        <g key={k}>
                          <rect x={q.x + 3} y={top} width={ribbonW} height={BAND_H} rx="2"
                            fill={k === 'forecast' ? ribbonForecast : navy} data-testid={`ribbon-${k}`} />
                          <text x={q.x + q.w / 2} y={top + BAND_H / 2 + 4} textAnchor="middle" fontSize="11" fontWeight="700" fill="#ffffff">
                            {text}
                          </text>
                        </g>
                      );
                    })}
                    {[q.x + 3, q.x + q.w - 3].map(gx => (
                      <line key={gx} x1={gx} x2={gx} y1={bandBottom} y2={baseY} stroke={guideColor} strokeOpacity="0.45" strokeDasharray="3 3" />
                    ))}
                  </g>
                );
              })}

              {/* ── Columns ───────────────────────────────────────────────── */}
              {L.cells.flatMap(c => c.cols.map((col, i) => renderColumn(col, `${c.month.getTime()}-${col.type}-${col.kind}-${col.item?.id ?? i}`)))}
              <g data-testid="totals-zone">
                {L.totals.map((col, i) => renderColumn(col, `tot-${i}`, { showValue: true }))}
                {L.totalsLabels.map(t => (
                  <text key={t.text} x={t.x} y={baseY + 16} textAnchor="middle" fontSize="10.5" fontWeight="700" fill={strongText}>{t.text}</text>
                ))}
              </g>

              {/* ── FY boundaries (between 31 Mar and 1 Apr) ──────────────── */}
              {L.fyMarks.filter(f => f.boundary).map(f => (
                <line key={`fyb${f.fy}`} x1={f.x} x2={f.x} y1={0} y2={svgH - 4} stroke={fyRed} strokeWidth="1.5"
                  strokeDasharray="2 3" data-testid="fy-boundary" />
              ))}
            </svg>
          </div>
        </div>
      </div>

      <p className="px-5 pb-3 text-[11px] text-gray-400">
        Each baseline sits under the month of its End Date. Column height = Efficiency (%) = Savings ÷ Estimated.
        Quarter totals (last month of each quarter) and FY totals are stacked by opportunity category; labels show each category’s share of the savings.
      </p>

      <ChartTooltip tip={tip} colorOf={colorOf} />
    </div>
  );
}
