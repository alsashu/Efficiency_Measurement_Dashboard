import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Layers, RotateCcw, X } from 'lucide-react';
import { CONSOLIDATED_META, CONSOLIDATION_MAP } from '../PlanDashboard/charts/PlanOpportunityDonutChart';
import { formatNumber, formatPct } from '../../utils/exportUtils';

// Program Baseline — Opportunity Categories & Efficiency.
// Hand-rolled SVG combo chart: one stacked column per baseline (effort saved by
// the 5 consolidated opportunity categories, right axis) with an Efficiency (%)
// line (left axis). Columns are grouped by program on a two-level x-axis.
// Efficiency Plan baselines are solid; Forecasting baselines are hatched with a
// dotted outline and continue the efficiency line as a dashed segment.
// Category colors come from CONSOLIDATED_META so they match the Overview donuts.

const META_BY_KEY = Object.fromEntries(CONSOLIDATED_META.map(m => [m.key, m]));
const STACK_ORDER = ['automation', 'cicd_devx', 'ai_assisted', 'ref_lib_sdlc', 'simulator_tools']; // bottom -> top
const SHORT_NAME = {
  automation: 'Automation',
  cicd_devx: 'CI/CD / DevX',
  ai_assisted: 'AI / Copilot',
  ref_lib_sdlc: 'Reference / SDLC',
  simulator_tools: 'Simulator & Tools',
};
const ZOOMS = [
  { key: '6M', months: 6 },
  { key: '1Y', months: 12 },
  { key: '2Y', months: 24 },
  { key: 'All', months: null },
];

const COL_W = 46;           // natural spacing per baseline
const GROUP_PAD = 14;       // space either side of a program group
const GROUP_MIN_W = 92;     // so short program names stay readable
const PLOT_TOP = 16;
const PLOT_H = 300;
const LABEL_H = 78;         // rotated baseline labels
const GROUP_H = 44;         // program bracket + name + dept
const SVG_H = PLOT_TOP + PLOT_H + LABEL_H + GROUP_H;
const AXIS_L_W = 56;
const AXIS_R_W = 68;
const TICKS = 5;
const TIP_W = 250;
const FORECAST_OUTLINE = '#6b7280';

function toDate(val) {
  if (!val) return null;
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
}
function startOfDay(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function endOfDay(d) { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; }
function addMonths(d, m) { const x = new Date(d); x.setMonth(x.getMonth() + m); return x; }
const num = v => (v == null || v === '' || isNaN(parseFloat(v)) ? null : parseFloat(v));
const truncate = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

// Axis top rounded to a 1/2/2.5/5 x 10^k step so both axes share TICKS
// intervals and their gridlines coincide.
function niceScale(max) {
  const raw = (max > 0 ? max : 1) / TICKS;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map(m => m * pow).find(s => s >= raw);
  return { top: step * TICKS, ticks: Array.from({ length: TICKS + 1 }, (_, i) => i * step) };
}

function consolidate(categories = {}) {
  const out = Object.fromEntries(STACK_ORDER.map(k => [k, 0]));
  for (const [raw, v] of Object.entries(categories)) {
    const key = CONSOLIDATION_MAP[raw];
    if (key) out[key] += parseFloat(v) || 0;
  }
  return out;
}

function useElementWidth() {
  const [el, setEl] = useState(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    if (!el) return undefined;
    setWidth(el.getBoundingClientRect().width);
    const ro = new ResizeObserver(entries => setWidth(entries[0].contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);
  return [setEl, width || 900]; // jsdom / first paint fallback
}

function Row({ label, value, warn }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-0.5">
      <span className="text-xs text-gray-500 dark:text-gray-400">{label}</span>
      <span className={`text-xs font-semibold tabular-nums text-right ${warn ? 'text-rose-600 dark:text-rose-400' : 'text-gray-800 dark:text-gray-100'}`}>
        {value}
      </span>
    </div>
  );
}

function KindBadge({ kind }) {
  return kind === 'forecast' ? (
    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide border border-dashed border-amber-500 text-amber-700 dark:text-amber-400">
      Forecasting
    </span>
  ) : (
    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide bg-carbon text-white dark:bg-blue-500">
      Efficiency Plan
    </span>
  );
}

function HatchSwatch({ color, id, size = 12 }) {
  return (
    <svg width={size} height={size} className="flex-shrink-0" aria-hidden="true">
      <defs>
        <pattern id={id} patternUnits="userSpaceOnUse" width="4" height="4" patternTransform="rotate(45)">
          <rect width="4" height="4" fill={color} fillOpacity="0.3" />
          <line x1="0" y1="0" x2="0" y2="4" stroke={color} strokeWidth="2" />
        </pattern>
      </defs>
      <rect x="0.5" y="0.5" width={size - 1} height={size - 1} fill={`url(#${id})`} stroke={FORECAST_OUTLINE} strokeDasharray="2 1.5" />
    </svg>
  );
}

export default function ProgramCategoryEfficiencyChart({ programs, startDate, endDate, isDark }) {
  const [zoom, setZoom] = useState('All');
  const [hidden, setHidden] = useState(() => new Set());
  const [focusProgram, setFocusProgram] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [tip, setTip] = useState(null);
  const [scrollRef, availW] = useElementWidth();
  const scrollEl = useRef(null);
  const containerRef = useRef(null);

  const colorOf = key => (isDark ? META_BY_KEY[key].dark : META_BY_KEY[key].light);
  const axisColor = isDark ? '#9ca3af' : '#6b7280';
  const gridColor = isDark ? '#374151' : '#e5e7eb';
  const lineColor = isDark ? '#e5e7eb' : '#1E3246';
  const cardBg = isDark ? '#111827' : '#ffffff';
  const accent = isDark ? '#60a5fa' : '#1E3246';
  const forecastLabel = isDark ? '#fbbf24' : '#b45309';

  // ---- Baseline rows, grouped by program ----
  const groups = useMemo(() => {
    const intervalStart = startDate ? startOfDay(startDate) : null;
    const intervalEnd = endDate ? endOfDay(endDate) : null;
    const months = ZOOMS.find(z => z.key === zoom)?.months;
    const today = new Date();
    const zoomStart = months ? addMonths(today, -months) : null;
    const zoomEnd = months ? addMonths(today, months) : null;
    // Same rule as the timeline: keep a baseline if it overlaps the window at all.
    const overlaps = (s, e, lo, hi) => !((lo && e < lo) || (hi && s > hi));

    const toBar = (p, r, kind) => {
      const start = toDate(r.baseline_start);
      const end = toDate(r.baseline_end);
      if (!start || !end) return null;
      if (!overlaps(start, end, intervalStart, intervalEnd)) return null;
      if (!overlaps(start, end, zoomStart, zoomEnd)) return null;
      const cats = consolidate(r.categories);
      const catTotal = STACK_ORDER.reduce((s, k) => s + cats[k], 0);
      const efficiency = num(r.efficiency_pct);
      if (catTotal <= 0 && efficiency == null) return null; // nothing to draw
      return {
        id: `${kind}-${r.id}`,
        kind,
        programKey: `${p.dept}::${p.program_name}`,
        program: p.program_name,
        dept: p.dept,
        baseline: r.baseline || '—',
        start, end, cats, catTotal, efficiency,
        savings: num(r.savings_hrs),
        estimated: num(r.estimated_hrs),
        actual: kind === 'plan' ? num(r.actual_hrs) : null,
        variance: kind === 'plan' ? num(r.effort_variance) : null,
      };
    };

    const byStart = (a, b) => a.start - b.start;
    return (programs || []).map(p => {
      const plan = (p.planRecords || []).map(r => toBar(p, r, 'plan')).filter(Boolean).sort(byStart);
      const forecast = (p.forecastRecords || []).map(r => toBar(p, r, 'forecast')).filter(Boolean).sort(byStart);
      return { key: `${p.dept}::${p.program_name}`, program: p.program_name, dept: p.dept, bars: [...plan, ...forecast] };
    }).filter(g => g.bars.length);
  }, [programs, startDate, endDate, zoom]);

  const bars = groups.flatMap(g => g.bars);
  const selected = bars.find(b => b.id === selectedId) || null;
  const focus = groups.some(g => g.key === focusProgram) ? focusProgram : null;
  const visibleKeys = STACK_ORDER.filter(k => !hidden.has(k));

  // ---- Horizontal layout: natural width, stretched to fill when it fits ----
  let x = 0;
  const layoutGroups = groups.map(g => {
    const natural = g.bars.length * COL_W + 2 * GROUP_PAD;
    const w = Math.max(natural, GROUP_MIN_W);
    const x0 = x;
    x += w;
    return { ...g, x0, w, pad: (w - g.bars.length * COL_W) / 2 };
  });
  const naturalW = x;
  const plotW = Math.max(naturalW, availW);
  const stretch = naturalW > 0 ? plotW / naturalW : 1;
  const colW = COL_W * stretch;
  const barW = Math.min(Math.max(colW * 0.56, 18), 56);
  const overflow = naturalW > availW + 1;
  for (const g of layoutGroups) {
    g.x0 *= stretch; g.w *= stretch; g.pad *= stretch;
    g.bars = g.bars.map((b, i) => ({ ...b, cx: g.x0 + g.pad + (i + 0.5) * colW }));
  }
  const placed = layoutGroups.flatMap(g => g.bars);

  // ---- Vertical scales (shared tick count so gridlines line up) ----
  const visTotal = b => visibleKeys.reduce((s, k) => s + b.cats[k], 0);
  const sav = niceScale(Math.max(0, ...placed.map(visTotal)) * 1.1);
  // Efficiency above 100% (savings > estimate, e.g. 600%+ from a tiny
  // estimate) is excluded from the axis range so it doesn't flatten every other
  // line; such points are pinned to the top edge as ▲ markers and keep their
  // real value in the tooltip / detail panel.
  const effValues = placed.map(b => b.efficiency).filter(v => v != null);
  const eff = niceScale(Math.max(0, ...effValues.filter(v => v <= 100)) * 1.1);
  const clippedCount = effValues.filter(v => v > eff.top).length;
  const ySav = v => PLOT_TOP + PLOT_H - (v / sav.top) * PLOT_H;
  const yEff = v => PLOT_TOP + PLOT_H - (Math.min(v, eff.top) / eff.top) * PLOT_H;

  const dimOf = b => {
    if (focus && b.programKey !== focus) return 0.18;
    if (selected && b.id !== selected.id) return 0.4;
    return 1;
  };

  const reset = () => {
    setZoom('All');
    setHidden(new Set());
    setFocusProgram(null);
    setSelectedId(null);
    setTip(null);
    if (scrollEl.current) scrollEl.current.scrollLeft = 0;
  };

  const toggleCategory = key => setHidden(prev => {
    const next = new Set(prev);
    next.has(key) ? next.delete(key) : next.add(key);
    return next;
  });

  const showTip = (e, content) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const left = px + 16 + TIP_W > rect.width ? px - 16 - TIP_W : px + 16;
    setTip({ left: Math.max(4, left), top: Math.max(4, py - 20), content });
  };
  const hideTip = () => setTip(null);

  const selectBar = id => setSelectedId(prev => (prev === id ? null : id));
  const keyActivate = fn => e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(); }
  };

  const segmentTip = (b, key) => (
    <>
      <div className="flex items-center gap-2 mb-1.5">
        <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: colorOf(key) }} />
        <span className="text-xs font-semibold text-gray-900 dark:text-white leading-snug">{META_BY_KEY[key].name}</span>
      </div>
      <Row label="Program" value={`${b.program} | ${b.dept}`} />
      <Row label="Baseline" value={b.baseline} />
      <Row label="Type" value={b.kind === 'forecast' ? 'Forecasting' : 'Efficiency Plan'} />
      <div className="my-1 border-t border-gray-100 dark:border-gray-700" />
      <Row label="Effort Saved" value={`${formatNumber(b.cats[key])} Hrs`} />
      <Row label="Contribution" value={b.catTotal > 0 ? formatPct((b.cats[key] / b.catTotal) * 100) : '—'} />
    </>
  );

  const pointTip = b => (
    <>
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-xs font-semibold text-gray-900 dark:text-white">Efficiency</span>
        <KindBadge kind={b.kind} />
      </div>
      <Row label="Program" value={`${b.program} | ${b.dept}`} />
      <Row label="Baseline" value={b.baseline} />
      <Row label="Efficiency" value={formatPct(b.efficiency)} />
    </>
  );

  // ---- Render pieces ----
  const plotBottom = PLOT_TOP + PLOT_H;

  const efficiencyPaths = layoutGroups.map(g => {
    const pts = g.bars.filter(b => b.efficiency != null).map(b => ({ b, x: b.cx, y: yEff(b.efficiency) }));
    const plan = pts.filter(p => p.b.kind === 'plan');
    const fc = pts.filter(p => p.b.kind === 'forecast');
    const d = arr => arr.map((p, i) => `${i ? 'L' : 'M'}${p.x},${p.y}`).join(' ');
    // The dashed forecast segment starts from the last Efficiency Plan point.
    const fcLine = fc.length ? [...(plan.length ? [plan[plan.length - 1]] : []), ...fc] : [];
    const opacity = focus && g.key !== focus ? 0.18 : 1;
    return { key: g.key, solid: plan.length > 1 ? d(plan) : null, dashed: fcLine.length > 1 ? d(fcLine) : null, pts, opacity };
  });

  return (
    <div className="card p-5" data-testid="program-category-chart">
      {/* Header */}
      <div className="flex flex-wrap items-start gap-3 mb-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <Layers size={18} className="text-carbon dark:text-blue-400" />
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Program Opportunity Categories &amp; Efficiency</h3>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Effort saved by opportunity category per baseline (columns) with Efficiency (%) (line), grouped by program
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <div className="flex rounded-lg border border-gray-200 dark:border-gray-700 divide-x divide-gray-200 dark:divide-gray-700 overflow-hidden"
            role="group" aria-label="Zoom">
            {ZOOMS.map(z => (
              <button key={z.key} type="button" onClick={() => { setZoom(z.key); setSelectedId(null); }}
                aria-pressed={zoom === z.key}
                title={z.months ? `Baselines active within ±${z.months} months of today` : 'All baselines'}
                className={`px-2.5 h-7 text-xs font-medium transition-colors ${
                  zoom === z.key
                    ? 'bg-carbon text-white dark:bg-blue-500'
                    : 'bg-white dark:bg-gray-900 text-gray-500 hover:bg-gray-50 hover:text-gray-800 dark:hover:bg-gray-800 dark:hover:text-gray-200'
                }`}>
                {z.key}
              </button>
            ))}
          </div>
          <button type="button" onClick={reset} className="btn-secondary text-xs !px-3 !py-1.5" title="Reset zoom, legend, focus and selection">
            <RotateCcw size={12} /> Reset
          </button>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-4 text-xs">
        {STACK_ORDER.map(key => {
          const off = hidden.has(key);
          return (
            <button key={key} type="button" onClick={() => toggleCategory(key)} aria-pressed={!off}
              data-testid={`legend-${key}`}
              title={`${off ? 'Show' : 'Hide'} ${META_BY_KEY[key].name}`}
              className={`flex items-center gap-1.5 rounded px-1 py-0.5 hover:bg-gray-50 dark:hover:bg-gray-800 transition-opacity ${off ? 'opacity-40' : ''}`}>
              <span className="w-3 h-3 rounded-sm flex-shrink-0" style={{ background: colorOf(key) }} />
              <span className={`text-gray-700 dark:text-gray-200 ${off ? 'line-through' : ''}`}>{SHORT_NAME[key]}</span>
            </button>
          );
        })}
        <span className="hidden sm:block w-px h-4 bg-gray-200 dark:bg-gray-700" />
        <span className="flex items-center gap-1.5 text-gray-600 dark:text-gray-300">
          <span className="w-3 h-3 rounded-sm bg-gray-400 dark:bg-gray-500" /> Efficiency Plan / Actual
        </span>
        <span className="flex items-center gap-1.5 text-gray-600 dark:text-gray-300">
          <HatchSwatch color={isDark ? '#9ca3af' : '#6b7280'} id="legend-forecast-hatch" /> Forecasting
        </span>
        <span className="flex items-center gap-1.5 text-gray-600 dark:text-gray-300">
          <svg width="22" height="10" aria-hidden="true"><line x1="0" y1="5" x2="22" y2="5" stroke={lineColor} strokeWidth="2" /><circle cx="11" cy="5" r="3.5" fill={lineColor} /></svg>
          Efficiency – Actual/Plan
        </span>
        <span className="flex items-center gap-1.5 text-gray-600 dark:text-gray-300">
          <svg width="22" height="10" aria-hidden="true"><line x1="0" y1="5" x2="22" y2="5" stroke={lineColor} strokeWidth="2" strokeDasharray="3 2" /><circle cx="11" cy="5" r="3.5" fill={cardBg} stroke={lineColor} strokeWidth="1.5" /></svg>
          Efficiency – Forecast
        </span>
      </div>

      {!placed.length ? (
        <div className="h-72 flex items-center justify-center text-gray-400 text-sm text-center px-4">
          {zoom !== 'All'
            ? `No baselines with opportunity data within ±${ZOOMS.find(z => z.key === zoom).months} months of today — try a wider zoom`
            : 'No baselines with opportunity-category or efficiency data in the selected filters'}
        </div>
      ) : (
        <div ref={containerRef} className="relative" onMouseLeave={hideTip}>
          <div className="flex">
            {/* Left axis — Efficiency (%) */}
            <svg width={AXIS_L_W} height={SVG_H} className="flex-shrink-0" aria-hidden="true">
              <text transform={`translate(12, ${PLOT_TOP + PLOT_H / 2}) rotate(-90)`} textAnchor="middle" fontSize={11} fill={axisColor}>Efficiency (%)</text>
              {eff.ticks.map(v => (
                <text key={v} x={AXIS_L_W - 6} y={yEff(v)} textAnchor="end" dominantBaseline="central" fontSize={10.5} fill={axisColor}>
                  {`${+v.toFixed(1)}%`}
                </text>
              ))}
            </svg>

            {/* Scrollable plot */}
            <div ref={el => { scrollRef(el); scrollEl.current = el; }} className="flex-1 min-w-0 overflow-x-auto overflow-y-hidden"
              data-testid="chart-scroll">
              <svg width={plotW} height={SVG_H} role="img"
                aria-label="Stacked effort saved by opportunity category per baseline, with efficiency line">
                <defs>
                  {STACK_ORDER.map(key => (
                    <pattern key={key} id={`fc-hatch-${key}`} patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
                      <rect width="6" height="6" fill={colorOf(key)} fillOpacity="0.28" />
                      <line x1="0" y1="0" x2="0" y2="6" stroke={colorOf(key)} strokeWidth="2.5" />
                    </pattern>
                  ))}
                </defs>

                {/* Gridlines + program separators */}
                {sav.ticks.map((v, i) => (
                  <line key={v} x1={0} x2={plotW} y1={ySav(v)} y2={ySav(v)} stroke={gridColor}
                    strokeDasharray={i === 0 ? undefined : '3 3'} />
                ))}
                {layoutGroups.slice(1).map(g => (
                  <line key={g.key} x1={g.x0} x2={g.x0} y1={PLOT_TOP} y2={plotBottom + LABEL_H + GROUP_H - 4}
                    stroke={gridColor} strokeDasharray="2 4" />
                ))}

                {/* Columns */}
                {placed.map(b => {
                  const isSel = selected?.id === b.id;
                  const x0 = b.cx - barW / 2;
                  const total = visTotal(b);
                  let cum = 0;
                  return (
                    <g key={b.id} opacity={dimOf(b)} style={{ transition: 'opacity 200ms ease-out' }}>
                      {/* Full-height hit area / selection band */}
                      <rect x={b.cx - colW / 2} y={PLOT_TOP} width={colW} height={PLOT_H}
                        fill={isSel ? accent : 'transparent'} fillOpacity={isSel ? 0.07 : 0}
                        className="cursor-pointer outline-none" tabIndex={0} role="button"
                        aria-pressed={isSel} aria-label={`${b.program} ${b.baseline} (${b.kind === 'forecast' ? 'Forecasting' : 'Efficiency Plan'})`}
                        data-testid={`column-${b.id}`}
                        onClick={() => selectBar(b.id)} onKeyDown={keyActivate(() => selectBar(b.id))}
                        onMouseEnter={hideTip} />
                      {visibleKeys.map(key => {
                        const v = b.cats[key];
                        if (v <= 0) return null;
                        const y1 = ySav(cum + v);
                        const h = ySav(cum) - y1;
                        cum += v;
                        return (
                          <rect key={key} x={x0} y={y1} width={barW} height={Math.max(h, 0.5)}
                            fill={b.kind === 'forecast' ? `url(#fc-hatch-${key})` : colorOf(key)}
                            stroke={cardBg} strokeWidth={b.kind === 'forecast' ? 0 : 0.75}
                            className="cursor-pointer" data-testid={`seg-${b.id}-${key}`}
                            onClick={() => selectBar(b.id)}
                            onMouseMove={e => showTip(e, segmentTip(b, key))} onMouseLeave={hideTip} />
                        );
                      })}
                      {b.kind === 'forecast' && total > 0 && (
                        <rect x={x0} y={ySav(total)} width={barW} height={ySav(0) - ySav(total)} fill="none"
                          stroke={FORECAST_OUTLINE} strokeWidth={1.25} strokeDasharray="3 2" pointerEvents="none" />
                      )}
                      {isSel && total > 0 && (
                        <rect x={x0 - 2} y={ySav(total) - 2} width={barW + 4} height={ySav(0) - ySav(total) + 2} fill="none"
                          stroke={accent} strokeWidth={2} rx={2} pointerEvents="none" />
                      )}
                    </g>
                  );
                })}

                {/* Efficiency line: solid through Efficiency Plan, dashed into Forecasting */}
                {efficiencyPaths.map(p => (
                  <g key={p.key} opacity={p.opacity} style={{ transition: 'opacity 200ms ease-out' }}>
                    {p.solid && <path d={p.solid} fill="none" stroke={lineColor} strokeWidth={2} strokeLinejoin="round" pointerEvents="none" />}
                    {p.dashed && <path d={p.dashed} fill="none" stroke={lineColor} strokeWidth={2} strokeDasharray="5 4" pointerEvents="none" />}
                    {p.pts.map(({ b, x: px, y: py }) => {
                      const isSel = selected?.id === b.id;
                      const dim = selected && !isSel && !(focus && b.programKey !== focus) ? 0.5 : 1;
                      return (
                        <g key={b.id} opacity={dim}>
                          {isSel && <circle cx={px} cy={py} r={9} fill={accent} fillOpacity={0.18} />}
                          {b.efficiency > eff.top ? (
                            <path d={`M${px},${py - 6} L${px + 6},${py + 4} L${px - 6},${py + 4} Z`}
                              fill={b.kind === 'forecast' ? cardBg : lineColor} stroke={lineColor} strokeWidth={1.5}
                              data-testid={`point-${b.id}`} data-clipped="true" />
                          ) : (
                            <circle cx={px} cy={py} r={isSel ? 5.5 : 4}
                              fill={b.kind === 'forecast' ? cardBg : lineColor} stroke={b.kind === 'forecast' ? lineColor : cardBg}
                              strokeWidth={b.kind === 'forecast' ? 2 : 1.5}
                              data-testid={`point-${b.id}`} />
                          )}
                          {/* Larger invisible target for easier hovering */}
                          <circle cx={px} cy={py} r={9} fill="transparent" className="cursor-pointer"
                            onClick={() => selectBar(b.id)}
                            onMouseMove={e => showTip(e, pointTip(b))} onMouseLeave={hideTip} />
                        </g>
                      );
                    })}
                  </g>
                ))}

                {/* X axis level 1 — baselines (forecast labels italic, amber like the timeline) */}
                {placed.map(b => (
                  <text key={b.id} transform={`translate(${b.cx + 3}, ${plotBottom + 10}) rotate(-40)`}
                    textAnchor="end" fontSize={10.5}
                    fill={b.kind === 'forecast' ? forecastLabel : axisColor}
                    fontStyle={b.kind === 'forecast' ? 'italic' : 'normal'}
                    fontWeight={selected?.id === b.id ? 700 : 400}
                    opacity={dimOf(b) < 1 ? Math.max(dimOf(b), 0.35) : 1}
                    className="cursor-pointer select-none" onClick={() => selectBar(b.id)}>
                    <title>{`${b.baseline}${b.kind === 'forecast' ? ' (Forecasting)' : ''}`}</title>
                    {truncate(b.baseline, 16)}
                  </text>
                ))}

                {/* X axis level 2 — program groups (click to focus) */}
                {layoutGroups.map(g => {
                  const isFocus = focus === g.key;
                  const y = plotBottom + LABEL_H;
                  const maxChars = Math.max(4, Math.floor((g.w - 8) / 6.8));
                  return (
                    <g key={g.key} className="cursor-pointer outline-none" role="button" tabIndex={0}
                      aria-pressed={isFocus} aria-label={`Focus program ${g.program}`}
                      data-testid={`program-${g.program}`}
                      opacity={focus && !isFocus ? 0.45 : 1}
                      onClick={() => setFocusProgram(isFocus ? null : g.key)}
                      onKeyDown={keyActivate(() => setFocusProgram(isFocus ? null : g.key))}>
                      <rect x={g.x0} y={y - 6} width={g.w} height={GROUP_H + 2} fill="transparent" />
                      <path d={`M${g.x0 + 8},${y - 4} V${y} H${g.x0 + g.w - 8} V${y - 4}`} fill="none"
                        stroke={isFocus ? accent : axisColor} strokeWidth={isFocus ? 2 : 1} />
                      <text x={g.x0 + g.w / 2} y={y + 16} textAnchor="middle" fontSize={11.5} fontWeight={700}
                        fill={isFocus ? accent : (isDark ? '#f3f4f6' : '#111827')}>
                        <title>{`${g.program} | ${g.dept}`}</title>
                        {truncate(g.program, maxChars)}
                      </text>
                      <text x={g.x0 + g.w / 2} y={y + 31} textAnchor="middle" fontSize={10} fill={axisColor}>
                        {truncate(g.dept, maxChars)}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>

            {/* Right axis — Savings (Hrs) */}
            <svg width={AXIS_R_W} height={SVG_H} className="flex-shrink-0" aria-hidden="true">
              {sav.ticks.map(v => (
                <text key={v} x={6} y={ySav(v)} dominantBaseline="central" fontSize={10.5} fill={axisColor}>{formatNumber(v)}</text>
              ))}
              <text transform={`translate(${AXIS_R_W - 10}, ${PLOT_TOP + PLOT_H / 2}) rotate(90)`} textAnchor="middle" fontSize={11} fill={axisColor}>
                Savings (Hrs)
              </text>
            </svg>
          </div>

          {tip && (
            <div role="tooltip" data-testid="chart-tooltip"
              className="absolute z-10 pointer-events-none rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 shadow-lg"
              style={{ left: tip.left, top: tip.top, width: TIP_W }}>
              {tip.content}
            </div>
          )}

          <p className="text-[11px] text-gray-400 mt-1">
            Hover a segment or point for values · click a column for details · click a program name to focus it
            {overflow && ' · scroll horizontally to see all baselines'}
          </p>
          {clippedCount > 0 && (
            <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-0.5" data-testid="clipped-note">
              ▲ {clippedCount} efficiency value{clippedCount > 1 ? 's' : ''} above {eff.top}% {clippedCount > 1 ? 'are' : 'is'} pinned
              to the top of the axis — hover for the actual value.
            </p>
          )}
        </div>
      )}

      {/* Detail panel for the selected baseline */}
      {selected && (
        <div className="mt-4 rounded-lg border border-gray-200 dark:border-gray-700 p-4" data-testid="baseline-detail">
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <span className="text-sm font-semibold text-gray-900 dark:text-white">{selected.program}</span>
            <span className="text-xs text-gray-400">{selected.dept}</span>
            <span className="text-gray-300 dark:text-gray-600">·</span>
            <span className="text-sm font-medium text-gray-700 dark:text-gray-200">{selected.baseline}</span>
            <KindBadge kind={selected.kind} />
            <span className="text-xs text-gray-400">
              {selected.start.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
              {' – '}
              {selected.end.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
            </span>
            <button type="button" onClick={() => setSelectedId(null)} aria-label="Close details"
              className="ml-auto p-1 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100 dark:hover:text-gray-200 dark:hover:bg-gray-800">
              <X size={14} />
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-1">Opportunity categories</p>
              {STACK_ORDER.map(key => (
                <div key={key} className="grid grid-cols-[1fr_5rem_3.5rem] gap-2 py-0.5 text-xs items-center">
                  <span className="flex items-center gap-2 min-w-0 text-gray-700 dark:text-gray-200">
                    {selected.kind === 'forecast'
                      ? <HatchSwatch color={colorOf(key)} id={`detail-hatch-${key}`} size={10} />
                      : <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: colorOf(key) }} />}
                    <span className="truncate" title={META_BY_KEY[key].name}>{META_BY_KEY[key].name}</span>
                  </span>
                  <span className="text-right font-semibold text-gray-900 dark:text-white tabular-nums">{formatNumber(selected.cats[key])} Hrs</span>
                  <span className="text-right text-gray-500 dark:text-gray-400 tabular-nums">
                    {selected.catTotal > 0 ? formatPct((selected.cats[key] / selected.catTotal) * 100) : '—'}
                  </span>
                </div>
              ))}
              <div className="grid grid-cols-[1fr_5rem_3.5rem] gap-2 pt-1 mt-1 border-t border-gray-100 dark:border-gray-800 text-xs font-semibold">
                <span className="text-gray-900 dark:text-white pl-[18px]">Total</span>
                <span className="text-right text-gray-900 dark:text-white tabular-nums">{formatNumber(selected.catTotal)} Hrs</span>
                <span className="text-right text-gray-900 dark:text-white tabular-nums">{selected.catTotal > 0 ? '100%' : '—'}</span>
              </div>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-1">Baseline metrics</p>
              <Row label="Total Savings" value={selected.savings != null ? `${formatNumber(selected.savings)} Hrs` : '—'} />
              <Row label="Estimated Hrs" value={selected.estimated != null ? `${formatNumber(selected.estimated)} Hrs` : '—'} />
              <Row label="Actual Hrs" value={selected.actual != null ? `${formatNumber(selected.actual)} Hrs` : '—'} />
              <Row label="Variance" value={selected.variance != null ? `${formatNumber(selected.variance)} Hrs` : '—'} warn={selected.variance != null && selected.variance < 0} />
              <Row label="Efficiency" value={selected.efficiency != null ? formatPct(selected.efficiency) : '—'} />
              {selected.kind === 'forecast' && (
                <p className="text-[11px] text-gray-400 mt-1">Actual Hrs and Variance are not part of Forecasting data.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
