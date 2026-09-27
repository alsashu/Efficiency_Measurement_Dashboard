import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { format } from 'date-fns';
import clsx from 'clsx';
import { formatNumber, formatPct } from '../../utils/exportUtils';
import { efficiencyScale } from './ProgramEfficiencyPillars';

// Baseline Efficiency Waterfall — modelled on the Chart-1 reference.
// Per program, baselines run left→right in End-Date order:
//  • the first baseline is a full "starting" bar (0 → its Efficiency %);
//  • every later baseline is a floating bar from the previous baseline's
//    efficiency to its own — up (teal) for an increase, down (rose) for a decrease;
//  • dotted connectors carry each level across to the next bar;
//  • Forecasting baselines continue the chain after the last Plan baseline,
//    drawn hatched with a dashed outline.
// No trailing "Total" bar: efficiency changes don't sum, and the last bar's
// level already is the latest efficiency (shown in the program summary).
// Same inclusion rule as the pillar chart: a baseline is included when its
// End Date falls inside the selected window.

const COL_W = 44;
const SLOT_GAP = 14;
const GROUP_GAP = 36;
const SIDE_PAD = 20;
const PLOT_TOP = 30;
const PLOT_H = 300;
const X_LABEL_H = 26;
const GROUP_LABEL_H = 34;
const AXIS_W = 56;
const LABEL_CHAR_W = 6.2;
const MAX_SLOT_W = 160;
const TIP_W = 280;

const num = v => (v == null || v === '' || isNaN(parseFloat(v)) ? null : parseFloat(v));
const fmtDelta = d => (d == null ? 'N/A' : `${d > 0 ? '+' : d < 0 ? '−' : '±'}${Math.abs(d).toFixed(1)}%`);
const blLabel = r => `BL ${r.baseline || '—'}`;

/** Programs → per-program waterfall steps (Plan chain, then Forecast chain). */
export function buildWaterfall(programs, windowStart, windowEnd) {
  return programs.map(p => {
    const pick = (records, kind) => (records || [])
      .map(r => {
        const end = r.baseline_end ? new Date(r.baseline_end) : null;
        const start = r.baseline_start ? new Date(r.baseline_start) : null;
        return { ...r, kind, _end: end, _start: start && !isNaN(start) ? start : null, eff: Math.max(0, num(r.efficiency_pct) ?? 0) };
      })
      .filter(r => r._end && !isNaN(r._end) && r._end >= windowStart && r._end <= windowEnd)
      .sort((a, b) => a._end - b._end || (a._start ?? 0) - (b._start ?? 0)
        || String(a.baseline).localeCompare(String(b.baseline), undefined, { numeric: true }));

    const steps = [];
    let prev = null;
    [...pick(p.planRecords, 'plan'), ...pick(p.forecastRecords, 'forecast')].forEach(r => {
      steps.push({
        ...r,
        dept: p.dept,
        program_name: p.program_name,
        anchor: prev == null,
        prevEff: prev?.eff ?? null,
        prevBaseline: prev?.baseline ?? null,
        delta: prev == null ? null : r.eff - prev.eff,
      });
      prev = r;
    });
    return { dept: p.dept, program_name: p.program_name, steps };
  }).filter(g => g.steps.length);
}

function Row({ label, value, tone }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-[3px]">
      <span className="text-[12px] text-gray-500 dark:text-gray-400">{label}</span>
      <span className={clsx('text-[12.5px] font-semibold tabular-nums text-right',
        tone === 'up' ? 'text-teal-700 dark:text-teal-400'
          : tone === 'down' ? 'text-rose-600 dark:text-rose-400'
            : 'text-gray-800 dark:text-gray-100')}>
        {value}
      </span>
    </div>
  );
}

function WaterfallTooltip({ tip }) {
  if (!tip) return null;
  const { step: s, x, y } = tip;
  const isForecast = s.kind === 'forecast';
  const tone = s.delta == null ? null : s.delta > 0 ? 'up' : s.delta < 0 ? 'down' : null;
  const left = Math.max(12, Math.min(x - TIP_W / 2, window.innerWidth - TIP_W - 12));
  const estH = isForecast ? 300 : 350;
  let top = y - estH - 14;
  if (top < 8) top = y + 18;
  return createPortal(
    <div
      role="tooltip"
      className="fixed z-[9999] rounded-xl shadow-2xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 overflow-hidden pointer-events-none"
      style={{ left, top, width: TIP_W }}
    >
      <div className={clsx('px-4 py-2', isForecast ? 'bg-amber-600' : 'bg-carbon')}>
        <span className="text-[13px] font-bold text-white">{isForecast ? 'Forecasted Efficiency' : 'Baseline Efficiency'}</span>
      </div>
      <div className="px-4 py-2">
        <Row label="Program" value={s.program_name} />
        <Row label="Baseline" value={s.baseline || '—'} />
        <Row label="End" value={s._end ? format(s._end, 'dd-MMM-yyyy') : '—'} />
        <div className="my-1.5 border-t border-gray-100 dark:border-gray-700" />
        <Row label="Previous Efficiency" value={s.prevEff == null ? 'N/A' : `${formatPct(s.prevEff)}${s.prevBaseline ? ` (BL ${s.prevBaseline})` : ''}`} />
        <Row label="Current Efficiency" value={formatPct(s.eff)} />
        <Row label="Change" value={fmtDelta(s.delta)} tone={tone} />
        <div className="my-1.5 border-t border-gray-100 dark:border-gray-700" />
        <Row label="Estimated Hrs" value={formatNumber(s.estimated_hrs)} />
        {!isForecast && <Row label="Actual Hrs" value={formatNumber(s.actual_hrs)} />}
        <Row label="Savings" value={`${formatNumber(s.savings_hrs)} Hrs`} />
      </div>
    </div>,
    document.body
  );
}

export default function BaselineEfficiencyWaterfall({ programs, windowStart, windowEnd, context, isDark }) {
  const [tip, setTip] = useState(null);
  const [hoverKey, setHoverKey] = useState(null);

  const groups = useMemo(() => buildWaterfall(programs, windowStart, windowEnd), [programs, windowStart, windowEnd]);
  const multi = groups.length > 1;

  const layout = useMemo(() => {
    let x = SIDE_PAD;
    const placed = groups.map((g, gi) => {
      if (gi > 0) x += GROUP_GAP;
      const gx = x;
      const steps = g.steps.map(s => {
        const slotW = Math.min(MAX_SLOT_W, Math.max(COL_W + 16, blLabel(s).length * LABEL_CHAR_W + 8));
        const placedStep = { ...s, key: `${s.kind}-${s.id}`, slotX: x, slotW, x: x + (slotW - COL_W) / 2 };
        x += slotW + SLOT_GAP;
        return placedStep;
      });
      x -= SLOT_GAP;
      return { ...g, key: `${g.dept}::${g.program_name}`, steps, x: gx, w: x - gx };
    });
    return { groups: placed, width: x + SIDE_PAD };
  }, [groups]);

  const allSteps = layout.groups.flatMap(g => g.steps);
  const { top: yTop, ticks } = efficiencyScale(Math.max(0, ...allSteps.map(s => Math.max(s.eff, s.prevEff ?? 0))));
  const yOf = pct => PLOT_TOP + PLOT_H - (pct / yTop) * PLOT_H;
  const baseY = PLOT_TOP + PLOT_H;
  const svgH = baseY + X_LABEL_H + (multi ? GROUP_LABEL_H : 6);

  const anchorColor = isDark ? '#5b7fa6' : '#1E3246';
  const upColor = isDark ? '#3fb39a' : '#2a9d8f';     // muted teal
  const downColor = isDark ? '#e07a74' : '#c8554f';   // muted brick-rose
  const flatColor = isDark ? '#6b7280' : '#9ca3af';
  const gridColor = isDark ? '#374151' : '#eef0f3';
  const axisText = isDark ? '#9ca3af' : '#6b7280';
  const strongText = isDark ? '#f3f4f6' : '#111827';
  const forecastText = '#d97706';
  const colorOf = s => (s.anchor ? anchorColor : s.delta > 0 ? upColor : s.delta < 0 ? downColor : flatColor);
  const patternId = s => `wf-hatch-${s.anchor ? 'anchor' : s.delta > 0 ? 'up' : s.delta < 0 ? 'down' : 'flat'}`;

  const header = (
    <div className="px-5 pt-4 pb-3 border-b border-gray-100 dark:border-gray-800 text-center">
      <h3 className="text-sm font-bold text-gray-900 dark:text-white">Baseline Efficiency Waterfall</h3>
      <div className="flex flex-wrap justify-center gap-x-5 gap-y-1 mt-1 text-[12px] text-gray-500 dark:text-gray-400">
        <span>Department: <strong className="text-gray-800 dark:text-gray-200">{context.dept}</strong></span>
        <span>Program: <strong className="text-gray-800 dark:text-gray-200">{context.program}</strong></span>
        <span>Fiscal Period: <strong className="text-gray-800 dark:text-gray-200">{context.period}</strong></span>
      </div>
    </div>
  );

  if (!allSteps.length) {
    return (
      <div className="card overflow-hidden">
        {header}
        <div className="p-12 text-center text-gray-400">
          <p className="font-medium">No baselines end in the selected period</p>
        </div>
      </div>
    );
  }

  const legend = (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 px-5 py-3 border-t border-gray-100 dark:border-gray-800 text-xs text-gray-600 dark:text-gray-300">
      <span className="flex items-center gap-2"><span className="w-3 h-3 rounded-sm" style={{ background: anchorColor }} /> Starting efficiency</span>
      <span className="flex items-center gap-2"><span className="w-3 h-3 rounded-sm" style={{ background: upColor }} /> Increase</span>
      <span className="flex items-center gap-2"><span className="w-3 h-3 rounded-sm" style={{ background: downColor }} /> Decrease</span>
      <span className="flex items-center gap-2"><span className="w-3 h-3 rounded-sm bg-gray-500" /> Solid = Efficiency Plan</span>
      <span className="flex items-center gap-2">
        <svg width="12" height="12" aria-hidden="true">
          <defs>
            <pattern id="wf-legend-hatch" patternUnits="userSpaceOnUse" width="4" height="4" patternTransform="rotate(45)">
              <line x1="0" y1="0" x2="0" y2="4" stroke={axisText} strokeWidth="2" />
            </pattern>
          </defs>
          <rect width="12" height="12" fill="url(#wf-legend-hatch)" stroke={axisText} strokeDasharray="2 1.5" />
        </svg>
        Hatched = Forecasted
      </span>
      <span className="flex items-center gap-2"><span className="w-5 border-t border-dotted border-gray-400" /> Carry-over level</span>
    </div>
  );

  const summaries = layout.groups.map(g => {
    const plan = g.steps.filter(s => s.kind === 'plan');
    const first = g.steps[0];
    const lastPlan = plan[plan.length - 1];
    const lastFc = g.steps.filter(s => s.kind === 'forecast').pop();
    return { g, first, lastPlan, lastFc };
  });

  return (
    <div className="card overflow-hidden">
      {header}

      {/* Progression summary: first → latest per program */}
      <div className="flex flex-wrap justify-center gap-x-6 gap-y-1 px-5 pt-3 text-[12px] text-gray-600 dark:text-gray-300" data-testid="waterfall-summary">
        {summaries.map(({ g, first, lastPlan, lastFc }) => (
          <span key={g.key}>
            {multi && <strong className="text-gray-800 dark:text-gray-100">{g.program_name}: </strong>}
            {lastPlan ? (
              <>
                {formatPct(first.eff)} → <strong>{formatPct(lastPlan.eff)}</strong>{' '}
                <span className={lastPlan.eff - first.eff >= 0 ? 'text-teal-700 dark:text-teal-400' : 'text-rose-600 dark:text-rose-400'}>
                  ({fmtDelta(lastPlan.eff - first.eff)})
                </span>
              </>
            ) : null}
            {lastFc && (
              <span className="text-amber-600">{lastPlan ? ' · ' : ''}Forecasted {formatPct(lastFc.eff)}</span>
            )}
          </span>
        ))}
      </div>

      <div className="flex">
        <svg width={AXIS_W} height={svgH} className="flex-shrink-0" aria-hidden="true">
          <text x={12} y={PLOT_TOP + PLOT_H / 2} transform={`rotate(-90 12 ${PLOT_TOP + PLOT_H / 2})`} textAnchor="middle" fontSize="11" fontWeight="600" fill={axisText}>
            Efficiency (%)
          </text>
          {ticks.map(t => (
            <text key={t} x={AXIS_W - 8} y={yOf(t) + 4} textAnchor="end" fontSize="10.5" fill={axisText}>{`${+t.toFixed(1)}%`}</text>
          ))}
        </svg>

        <div className="overflow-x-auto flex-1" onScroll={() => setTip(null)} data-testid="waterfall-scroll">
          <svg width={layout.width} height={svgH} role="img" aria-label="Baseline efficiency waterfall" className="animate-fade-in">
            <defs>
              {[['anchor', anchorColor], ['up', upColor], ['down', downColor], ['flat', flatColor]].map(([k, c]) => (
                <pattern key={k} id={`wf-hatch-${k}`} patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
                  <rect width="6" height="6" fill={c} fillOpacity="0.18" />
                  <line x1="0" y1="0" x2="0" y2="6" stroke={c} strokeWidth="2.5" />
                </pattern>
              ))}
            </defs>

            {ticks.slice(1).map(t => (
              <line key={t} x1={0} x2={layout.width} y1={yOf(t)} y2={yOf(t)} stroke={gridColor} />
            ))}
            <line x1={0} x2={layout.width} y1={baseY} y2={baseY} stroke={isDark ? '#6b7280' : '#374151'} strokeWidth="1.25" />

            {layout.groups.map((g, gi) => (
              <g key={g.key} data-testid="waterfall-group">
                {gi > 0 && (
                  <line x1={g.x - GROUP_GAP / 2} x2={g.x - GROUP_GAP / 2} y1={PLOT_TOP - 16} y2={svgH - 4} stroke={gridColor} strokeWidth="1.5" />
                )}

                {/* Carry-over connectors */}
                {g.steps.slice(1).map((s, i) => {
                  const prev = g.steps[i];
                  return (
                    <line key={`c-${s.key}`} x1={prev.x + COL_W} x2={s.x} y1={yOf(prev.eff)} y2={yOf(prev.eff)}
                      stroke={axisText} strokeWidth="1" strokeDasharray="2 2" data-testid="waterfall-connector"
                      style={{ transition: 'all 400ms ease' }} />
                  );
                })}

                {g.steps.map(s => {
                  const lo = s.anchor ? 0 : Math.min(s.prevEff, s.eff);
                  const hi = s.anchor ? s.eff : Math.max(s.prevEff, s.eff);
                  const top = yOf(hi);
                  const h = Math.max(yOf(lo) - top, 2);
                  const isForecast = s.kind === 'forecast';
                  const color = colorOf(s);
                  const dimmed = hoverKey && hoverKey !== s.key;
                  const deltaText = s.anchor ? formatPct(s.eff) : fmtDelta(s.delta);
                  const deltaInside = h >= 18;
                  const isDown = !s.anchor && s.delta < 0;
                  // Current efficiency sits at the bar's END level: above for up/start, below for down.
                  const valueY = isDown ? top + h + 13 : top - 6;
                  return (
                    <g key={s.key}
                      data-testid={`waterfall-step-${s.kind}`} data-baseline={s.baseline}
                      data-direction={s.anchor ? 'start' : s.delta > 0 ? 'up' : s.delta < 0 ? 'down' : 'flat'}
                      className="cursor-pointer" style={{ opacity: dimmed ? 0.35 : 1, transition: 'opacity 150ms ease' }}
                      onMouseMove={e => { setHoverKey(s.key); setTip({ step: s, x: e.clientX, y: e.clientY }); }}
                      onMouseLeave={() => { setHoverKey(null); setTip(null); }}
                    >
                      <rect x={s.slotX} y={PLOT_TOP - 20} width={s.slotW} height={baseY - PLOT_TOP + 20} fill="transparent" />
                      <rect x={s.x} y={top} width={COL_W} height={h} rx="1.5"
                        fill={isForecast ? `url(#${patternId(s)})` : color}
                        stroke={isForecast ? color : 'none'} strokeWidth="1.5" strokeDasharray={isForecast ? '4 3' : undefined}
                        style={{ transition: 'y 400ms ease, height 400ms ease' }} data-testid="waterfall-bar" />
                      {!s.anchor && (
                        <text x={s.x + COL_W / 2} y={deltaInside ? top + h / 2 + 4 : (isDown ? top - 5 : top + h + 12)}
                          textAnchor="middle" fontSize="10.5" fontWeight="700"
                          fill={deltaInside && !isForecast ? '#ffffff' : color} pointerEvents="none">
                          {deltaText}
                        </text>
                      )}
                      <text x={s.x + COL_W / 2} y={valueY} textAnchor="middle" fontSize="11.5" fontWeight="800"
                        fill={isForecast ? forecastText : strongText} pointerEvents="none" data-testid="waterfall-value">
                        {formatPct(s.eff)}
                      </text>
                      <text x={s.x + COL_W / 2} y={baseY + 17} textAnchor="middle" fontSize="10.5" fontWeight="600"
                        fill={isForecast ? forecastText : strongText}>
                        {blLabel(s).length * LABEL_CHAR_W > s.slotW ? `${blLabel(s).slice(0, Math.floor(s.slotW / LABEL_CHAR_W) - 1)}…` : blLabel(s)}
                      </text>
                    </g>
                  );
                })}

                {multi && (
                  <>
                    <path d={`M ${g.x} ${baseY + X_LABEL_H + 2} v 5 H ${g.x + g.w} v -5`} fill="none" stroke={axisText} />
                    <text x={g.x + g.w / 2} y={baseY + X_LABEL_H + 22} textAnchor="middle" fontSize="11.5" fontWeight="700" fill={strongText}>
                      {g.program_name}
                    </text>
                  </>
                )}
              </g>
            ))}
          </svg>
        </div>
      </div>

      {legend}
      <WaterfallTooltip tip={tip} />
    </div>
  );
}
