import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import { useThemeStore } from '../../../store/useStore';
import { CONSOLIDATED_META, consolidateData } from './PlanOpportunityDonutChart';
import { formatNumber } from '../../../utils/exportUtils';

// Enhanced, legend-free Opportunity Categories donut. Hand-rolled SVG (not
// recharts) so the ring size can tween between compact and expanded states and
// the tooltip / connector labels can be positioned against exact segment
// geometry. Colors come from CONSOLIDATED_META so a category keeps the same hue
// as in the standard donut.
//
// Compact (-): medium donut, hover tooltip, no permanent labels.
// Expanded (+): large donut as focal point, categories split into balanced
// left/right columns with colored connectors, plus an exact-value summary strip.
const META_BY_KEY = Object.fromEntries(CONSOLIDATED_META.map(m => [m.key, m]));

const TWEEN_MS = 450;
const R_COMPACT = 110;        // 220px donut
const R_EXPANDED_MAX = 185;   // up to 370px donut
const HOVER_SCALE = 1.04;     // a highlighted segment grows slightly
const TOOLTIP_W = 210;
const TOOLTIP_GAP = 28;       // ring edge -> compact tooltip
const LABEL_OFFSET = 64;      // ring edge -> expanded label column
const LABEL_MIN_W = 160;
const LEAD_Y = 16;            // connector meets the label at its percentage line
const LABEL_GAP = 12;         // min vertical space between stacked labels
const WIDE_MIN_WIDTH = 2 * (150 + LABEL_OFFSET + LABEL_MIN_W) + 16; // else labels -> summary strip only
const LATERAL_MIN_WIDTH = 2 * (R_COMPACT + TOOLTIP_GAP + TOOLTIP_W) + 16;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const lerp = (a, b, t) => a + (b - a) * t;
const ease = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const fmt = n => formatNumber(n); // en-IN, matches the KPI cards

// Angles are radians, clockwise from 12 o'clock.
const polar = (cx, cy, r, a) => [cx + r * Math.sin(a), cy - r * Math.cos(a)];

function arcPath(cx, cy, r0, r1, a0, a1) {
  const end = Math.min(a1, a0 + Math.PI * 2 - 1e-4);
  const large = end - a0 > Math.PI ? 1 : 0;
  const [ox0, oy0] = polar(cx, cy, r1, a0);
  const [ox1, oy1] = polar(cx, cy, r1, end);
  const [ix1, iy1] = polar(cx, cy, r0, end);
  const [ix0, iy0] = polar(cx, cy, r0, a0);
  return `M${ox0},${oy0} A${r1},${r1} 0 ${large} 1 ${ox1},${oy1} L${ix1},${iy1} A${r0},${r0} 0 ${large} 0 ${ix0},${iy0} Z`;
}

// Dark text on light fills (e.g. amber), white on the rest.
function readableText(hex) {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(c => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.4 ? '#111827' : '#ffffff';
}

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!mq) return undefined;
    setReduced(mq.matches);
    const onChange = e => setReduced(e.matches);
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, []);
  return reduced;
}

// 0 -> 1 progress for the compact/expanded transition, eased, rAF-driven.
function useTween(target, reduced) {
  const [value, setValue] = useState(target);
  const current = useRef(target);
  useEffect(() => {
    if (reduced || typeof window.requestAnimationFrame !== 'function') {
      current.current = target;
      setValue(target);
      return undefined;
    }
    const from = current.current;
    const start = performance.now();
    const duration = TWEEN_MS * Math.abs(target - from);
    let frame;
    const step = () => {
      const now = performance.now();
      const p = duration > 0 ? clamp((now - start) / duration, 0, 1) : 1;
      current.current = lerp(from, target, ease(p));
      setValue(current.current);
      if (p < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [target, reduced]);
  return value;
}

// Callback ref so the observer attaches whenever the chart node (re)mounts,
// e.g. after an empty-data state.
function useContainerWidth() {
  const [el, setEl] = useState(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    if (!el) return undefined;
    setWidth(el.getBoundingClientRect().width);
    const ro = new ResizeObserver(entries => setWidth(entries[0].contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);
  return [setEl, width || 800]; // jsdom / first paint fallback
}

// Split segments (clockwise from 12 o'clock) into a right and a left column of
// near-equal size. Taking a contiguous run keeps connectors from crossing; of
// the balanced splits, pick the one where fewest segments sit on the "wrong"
// side of the donut.
function assignSides(segments) {
  const n = segments.length;
  const candidates = [...new Set([Math.floor(n / 2), Math.ceil(n / 2)])];
  let best = null;
  for (const k of candidates) {
    const cost = segments.reduce((c, s, i) => {
      const sin = Math.sin(s.mid);
      return c + (i < k ? Math.max(0, -sin) : Math.max(0, sin));
    }, 0);
    if (!best || cost < best.cost) best = { k, cost };
  }
  return segments.map((s, i) => (i < best.k ? 'right' : 'left'));
}

// Where a connector leaves its segment: the segment middle when it already
// faces the label's column, otherwise the point of the arc closest to that
// column (so the line never has to cross the ring).
function anchorAngle(seg, side) {
  const facing = side === 'right' ? Math.sin(seg.mid) >= 0 : Math.sin(seg.mid) <= 0;
  if (facing) return seg.mid;
  const target = side === 'right' ? Math.PI / 2 : (3 * Math.PI) / 2;
  const inset = Math.min((seg.a1 - seg.a0) * 0.25, 0.14);
  const dist = a => Math.abs(Math.atan2(Math.sin(a - target), Math.cos(a - target)));
  const lo = seg.a0 + inset;
  const hi = seg.a1 - inset;
  if (target >= lo && target <= hi) return target;
  return dist(lo) < dist(hi) ? lo : hi;
}

// Stack labels in one column: keep each as close to its connector's height as
// possible, push down to avoid overlap, then pull back up if the stack
// overflows the bottom edge.
function resolveColumn(items, height, pad) {
  const sorted = [...items].sort((a, b) => a.desiredTop - b.desiredTop);
  let cursor = pad;
  for (const it of sorted) {
    it.top = Math.max(it.desiredTop, cursor);
    cursor = it.top + it.h + LABEL_GAP;
  }
  let limit = height - pad;
  for (let i = sorted.length - 1; i >= 0; i--) {
    const it = sorted[i];
    if (it.top + it.h > limit) it.top = limit - it.h;
    limit = it.top - LABEL_GAP;
  }
  return sorted;
}

function ModeToggle({ expanded, onChange }) {
  const btn = active => `w-8 h-7 flex items-center justify-center transition-colors ${
    active
      ? 'bg-carbon text-white dark:bg-blue-500'
      : 'bg-white dark:bg-gray-900 text-gray-500 hover:bg-gray-50 hover:text-gray-800 dark:hover:bg-gray-800 dark:hover:text-gray-200'
  }`;
  return (
    <div className="flex flex-shrink-0 rounded-lg border border-gray-200 dark:border-gray-700 divide-x divide-gray-200 dark:divide-gray-700 overflow-hidden shadow-sm"
      role="group" aria-label="Chart size">
      <button type="button" className={btn(!expanded)} onClick={() => onChange(false)}
        aria-pressed={!expanded} aria-label="Compact view" title="Compact view">
        <Minus size={14} strokeWidth={2.5} />
      </button>
      <button type="button" className={btn(expanded)} onClick={() => onChange(true)}
        aria-pressed={expanded} aria-label="Expanded view" title="Expanded view">
        <Plus size={14} strokeWidth={2.5} />
      </button>
    </div>
  );
}

export default function PlanOpportunityDonutEnhanced({ data = [] }) {
  const { theme } = useThemeStore();
  const isDark = theme === 'dark';
  const reduced = usePrefersReducedMotion();
  const tooltipRef = useRef(null);
  const labelRefs = useRef({});
  const [wrapRef, width] = useContainerWidth();

  const [expanded, setExpanded] = useState(false);
  const [hoverKey, setHoverKey] = useState(null);
  const [selectedKey, setSelectedKey] = useState(null);
  const [tooltipH, setTooltipH] = useState(76);
  const [labelHeights, setLabelHeights] = useState({});
  const t = useTween(expanded ? 1 : 0, reduced);

  const items = consolidateData(data)
    .map(d => ({ ...d, value: Math.round(d.value) }))
    .filter(d => d.value > 0);
  const total = items.reduce((s, d) => s + d.value, 0);

  // Measure rendered label / tooltip heights so the layout uses real sizes
  // (long category names wrap to 2-3 lines).
  useLayoutEffect(() => {
    const next = {};
    let changed = false;
    for (const [k, el] of Object.entries(labelRefs.current)) {
      if (!el) continue;
      next[k] = el.offsetHeight;
      if (next[k] && next[k] !== labelHeights[k]) changed = true;
    }
    if (changed) setLabelHeights(prev => ({ ...prev, ...next }));
    if (tooltipRef.current?.offsetHeight && tooltipRef.current.offsetHeight !== tooltipH) {
      setTooltipH(tooltipRef.current.offsetHeight);
    }
  });

  // A hovered label that unmounts on a layout switch never fires mouseleave.
  const wide = width >= WIDE_MIN_WIDTH;
  useEffect(() => { setHoverKey(null); }, [wide]);

  if (!items.length) {
    return <div className="h-72 flex items-center justify-center text-gray-400 text-sm">No opportunity-category data available</div>;
  }

  const colorOf = key => (isDark ? META_BY_KEY[key].dark : META_BY_KEY[key].light);
  const cardBg = isDark ? '#111827' : '#ffffff';
  const activeKey = hoverKey ?? selectedKey;

  // ---- Staged transition: donut grows first, then labels slide out and
  // connectors draw in. ----
  const g = ease(clamp(t / 0.7, 0, 1));            // donut size / canvas height
  const lp = clamp((t - 0.45) / 0.55, 0, 1);       // labels, connectors, strip

  // ---- Geometry: compact and expanded targets, interpolated by g ----
  const lateralTooltip = width >= LATERAL_MIN_WIDTH;
  const H0 = lateralTooltip ? 2 * R_COMPACT + 80 : 2 * R_COMPACT + 2 * (tooltipH + 24);
  const R1 = wide
    ? clamp(width / 2 - LABEL_OFFSET - 250, 150, R_EXPANDED_MAX)
    : clamp(width / 2 - 24, 100, 160);
  const labelW = clamp(width / 2 - R1 - LABEL_OFFSET - 8, LABEL_MIN_W, 300);

  let angle = 0;
  const segments = items.map(d => {
    const sweep = (d.value / total) * Math.PI * 2;
    const seg = { ...d, a0: angle, a1: angle + sweep, mid: angle + sweep / 2, color: colorOf(d.key) };
    angle += sweep;
    return seg;
  });
  const sides = assignSides(segments);

  // Expanded canvas must fit the taller label column, and leave room for a
  // label whose connector leaves near 12 or 6 o'clock to sit level with it
  // instead of being pushed back across the ring.
  const colHeight = side => segments
    .filter((s, i) => sides[i] === side)
    .reduce((h, s) => h + (labelHeights[s.key] || 80) + LABEL_GAP, 0);
  const levelFit = segments.reduce((m, s, i) => {
    const dy = -(R1 + 18) * Math.cos(anchorAngle(s, sides[i]));
    const h = labelHeights[s.key] || 80;
    return Math.max(m, dy > 0 ? 2 * (dy - LEAD_Y + h + 8) : 2 * (LEAD_Y - dy + 8));
  }, 0);
  const H1 = wide
    ? Math.max(2 * R1 + 120, levelFit, colHeight('right') + 16, colHeight('left') + 16)
    : 2 * R1 + 40;

  const R = lerp(R_COMPACT, R1, g);
  const r = R * 0.64;
  const H = lerp(H0, H1, g);
  const cx = width / 2;
  const cy = H / 2;

  // ---- Expanded connector labels (wide layout only) ----
  let labels = [];
  if (wide && lp > 0) {
    const cols = { left: [], right: [] };
    segments.forEach((s, i) => {
      const side = sides[i];
      const a = anchorAngle(s, side);
      const [ex, ey] = polar(cx, cy, R + 18, a);
      cols[side].push({ seg: s, side, a, elbow: [ex, ey], h: labelHeights[s.key] || 80, desiredTop: ey - LEAD_Y });
    });
    labels = [...resolveColumn(cols.left, H, 8), ...resolveColumn(cols.right, H, 8)].map(l => {
      const dir = l.side === 'right' ? 1 : -1;
      const edgeX = cx + dir * (R + LABEL_OFFSET);
      const y = l.top + LEAD_Y;
      const [x0, y0] = polar(cx, cy, R + 3, l.a);
      const [x1, y1] = l.elbow;
      const x3 = edgeX - dir * 8;
      // Short radial stub, a bend that always travels outward (so it never
      // cuts back across the ring), then a horizontal run to the label.
      let x2 = x1 + dir * Math.max(Math.abs(y - y1), 12);
      if (dir * (x3 - x2) < 0) x2 = x3;
      return { ...l, dir, edgeX, points: `${x0},${y0} ${x1},${y1} ${x2},${y} ${x3},${y}`, dot: [x0, y0] };
    });
  }

  // ---- Compact tooltip placement ----
  // Always outside the ring so it never covers the chart: beside the donut on
  // the segment's side when there is horizontal room, otherwise in the band
  // above/below. A leader line runs from the segment to the arrow tip.
  let tooltip = null;
  const tooltipSeg = t < 0.3 && activeKey ? segments.find(s => s.key === activeKey) : null;
  if (tooltipSeg) {
    const [ax, ay] = polar(cx, cy, R * HOVER_SCALE + 4, tooltipSeg.mid);
    if (lateralTooltip) {
      const right = Math.sin(tooltipSeg.mid) >= 0;
      const left = right ? cx + R + TOOLTIP_GAP : cx - R - TOOLTIP_GAP - TOOLTIP_W;
      const top = clamp(ay - tooltipH / 2, 4, H - tooltipH - 4);
      const arrowY = clamp(ay - top, 14, tooltipH - 14);
      const tipX = right ? left - 6 : left + TOOLTIP_W + 6;
      tooltip = { seg: tooltipSeg, left, top, side: right ? 'left' : 'right', arrowOffset: arrowY, leader: [ax, ay, tipX, top + arrowY] };
    } else {
      const above = Math.cos(tooltipSeg.mid) >= 0;
      const left = clamp(ax - TOOLTIP_W / 2, 4, width - TOOLTIP_W - 4);
      const top = above ? 4 : H - tooltipH - 4;
      const arrowX = clamp(ax - left, 14, TOOLTIP_W - 14);
      const tipY = above ? top + tooltipH + 6 : top - 6;
      tooltip = { seg: tooltipSeg, left, top, side: above ? 'bottom' : 'top', arrowOffset: arrowX, leader: [ax, ay, left + arrowX, tipY] };
    }
  }

  const toggleSelect = key => setSelectedKey(prev => (prev === key ? null : key));
  const bindHighlight = key => ({
    onMouseEnter: () => setHoverKey(key),
    onMouseLeave: () => setHoverKey(null),
    onFocus: () => setHoverKey(key),
    onBlur: () => setHoverKey(null),
    onClick: e => { e.stopPropagation(); toggleSelect(key); },
    onKeyDown: e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleSelect(key); }
      if (e.key === 'Escape') setSelectedKey(null);
    },
  });

  const arrowStyle = side => {
    const base = 'absolute w-3 h-3 rotate-45 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700';
    if (side === 'left') return { cls: `${base} border-l border-b -left-1.5`, style: { top: tooltip.arrowOffset - 6 } };
    if (side === 'right') return { cls: `${base} border-r border-t -right-1.5`, style: { top: tooltip.arrowOffset - 6 } };
    if (side === 'bottom') return { cls: `${base} border-r border-b -bottom-1.5`, style: { left: tooltip.arrowOffset - 6 } };
    return { cls: `${base} border-l border-t -top-1.5`, style: { left: tooltip.arrowOffset - 6 } };
  };

  const dimFor = key => (activeKey && activeKey !== key ? 0.3 : 1);

  return (
    <div>
      <div className="flex items-start justify-between gap-3 mb-2">
        <div>
          <p className="section-title">Opportunity Categories</p>
          <p className="section-subtitle">Distribution of effort saved by category</p>
        </div>
        <ModeToggle expanded={expanded} onChange={v => { setExpanded(v); setHoverKey(null); }} />
      </div>

      <div
        ref={wrapRef}
        className="relative w-full"
        style={{ height: H }}
        onClick={() => setSelectedKey(null)}
        data-testid="enhanced-donut"
      >
        <svg width={width} height={H} className="absolute inset-0 overflow-visible" role="img"
          aria-label={`Opportunity categories donut, total ${fmt(total)} hours saved`}>
          {/* Connectors sit under the ring so their dots tuck against the segment edge */}
          {labels.map(l => {
            const active = activeKey === l.seg.key;
            return (
              <g key={l.seg.key} opacity={dimFor(l.seg.key)} pointerEvents="none"
                style={{ transition: 'opacity 200ms ease-out' }}>
                <polyline points={l.points} fill="none" stroke={l.seg.color}
                  strokeWidth={active ? 2.25 : 1.25} strokeLinejoin="round" strokeLinecap="round"
                  pathLength={1} strokeDasharray={1} strokeDashoffset={1 - lp} />
                <circle cx={l.dot[0]} cy={l.dot[1]} r={active ? 4 : 3} fill={l.seg.color}
                  stroke={cardBg} strokeWidth={1.5} opacity={lp} />
              </g>
            );
          })}

          {segments.map(s => {
            const isActive = activeKey === s.key;
            const [px, py] = polar(cx, cy, (r + R) / 2, s.mid);
            return (
              <g
                key={s.key}
                style={{
                  transform: isActive ? `scale(${HOVER_SCALE})` : 'scale(1)',
                  transformOrigin: `${cx}px ${cy}px`,
                  transformBox: 'view-box',
                  opacity: activeKey && !isActive ? 0.35 : 1,
                  transition: 'transform 200ms ease-out, opacity 200ms ease-out',
                  filter: isActive ? 'drop-shadow(0 3px 6px rgba(0,0,0,0.2))' : 'none',
                }}
              >
                <path
                  d={arcPath(cx, cy, r, R, s.a0, s.a1)}
                  fill={s.color}
                  stroke={cardBg}
                  strokeWidth={2}
                  tabIndex={0}
                  role="button"
                  aria-pressed={selectedKey === s.key}
                  aria-label={`${s.name}: ${fmt(s.value)} hours, ${s.percentage}%`}
                  data-testid={`segment-${s.key}`}
                  className="cursor-pointer outline-none"
                  {...bindHighlight(s.key)}
                />
                {/* On-segment percentage for larger slices once expanded */}
                {lp > 0 && s.percentage >= 5 && (
                  <text x={px} y={py} textAnchor="middle" dominantBaseline="central" fontSize={13} fontWeight={700}
                    fill={readableText(s.color)} opacity={lp} pointerEvents="none">
                    {`${s.percentage}%`}
                  </text>
                )}
              </g>
            );
          })}

          {tooltip && (
            <g pointerEvents="none">
              <line x1={tooltip.leader[0]} y1={tooltip.leader[1]} x2={tooltip.leader[2]} y2={tooltip.leader[3]}
                stroke={tooltip.seg.color} strokeWidth={1.5} strokeDasharray="3 3" />
              <circle cx={tooltip.leader[0]} cy={tooltip.leader[1]} r={3} fill={tooltip.seg.color} />
            </g>
          )}
        </svg>

        {/* Center total — same content in both modes, slightly larger when expanded */}
        <div className="absolute pointer-events-none text-center flex flex-col items-center justify-center"
          style={{ left: cx - r, top: cy - r, width: 2 * r, height: 2 * r }}>
          <span className="uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400"
            style={{ fontSize: lerp(10, 12, g) }}>
            Total Effort Saved
          </span>
          <span className="font-bold text-gray-900 dark:text-white tabular-nums leading-tight mt-1"
            style={{ fontSize: lerp(24, 36, g) }}>
            {fmt(total)}
          </span>
          <span className="font-medium text-gray-500 dark:text-gray-400" style={{ fontSize: lerp(11, 14, g) }}>Hrs</span>
        </div>

        {/* Expanded connector labels: percentage > category > hours */}
        {labels.map(l => {
          const active = activeKey === l.seg.key;
          const isRight = l.side === 'right';
          return (
            <button
              key={l.seg.key}
              type="button"
              ref={el => { labelRefs.current[l.seg.key] = el; }}
              data-testid={`label-${l.seg.key}`}
              aria-pressed={selectedKey === l.seg.key}
              tabIndex={lp > 0.5 ? 0 : -1}
              className={`absolute px-2 py-1 rounded-md transition-[background-color,opacity] duration-200 ${
                isRight ? 'text-left' : 'text-right'
              } ${active ? 'bg-gray-50 dark:bg-gray-800' : 'hover:bg-gray-50 dark:hover:bg-gray-800'}`}
              style={{
                top: l.top,
                width: 'max-content',
                maxWidth: labelW,
                ...(isRight ? { left: l.edgeX } : { right: width - l.edgeX }),
                opacity: lp * dimFor(l.seg.key),
                transform: `translateX(${-l.dir * (1 - lp) * 24}px)`,
                pointerEvents: lp > 0.5 ? 'auto' : 'none',
              }}
              {...bindHighlight(l.seg.key)}
            >
              <span className="block text-2xl font-bold text-gray-900 dark:text-white tabular-nums leading-none">
                {l.seg.percentage}%
              </span>
              <span className={`block text-sm font-medium leading-snug mt-1 ${
                active ? 'text-gray-900 dark:text-white' : 'text-gray-700 dark:text-gray-200'
              }`}>
                {l.seg.name}
              </span>
              <span className="block text-xs text-gray-500 dark:text-gray-400 tabular-nums mt-0.5">{fmt(l.seg.value)} Hrs</span>
            </button>
          );
        })}

        {/* Compact hover tooltip */}
        {tooltip && (
          <div
            ref={tooltipRef}
            role="tooltip"
            data-testid="donut-tooltip"
            className="absolute pointer-events-none rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 shadow-lg"
            style={{ left: tooltip.left, top: tooltip.top, width: TOOLTIP_W }}
          >
            <span className={arrowStyle(tooltip.side).cls} style={arrowStyle(tooltip.side).style} />
            <div className="relative flex items-start gap-2">
              <span className="mt-1 w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: tooltip.seg.color }} />
              <div className="min-w-0">
                <p className="text-xs font-semibold text-gray-900 dark:text-white leading-snug">{tooltip.seg.name}</p>
                <p className="text-sm font-bold text-gray-900 dark:text-white tabular-nums mt-0.5">{fmt(tooltip.seg.value)} Hrs</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 tabular-nums">{tooltip.seg.percentage}% of total</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Expanded summary strip — exact values; also the only label surface on narrow screens */}
      {lp > 0 && (
        <div className="mt-4 mx-auto max-w-xl border-t border-gray-100 dark:border-gray-800 pt-3"
          style={{ opacity: lp }} data-testid="summary-strip">
          {segments.map(s => {
            const active = activeKey === s.key;
            return (
              <button key={s.key} type="button" data-testid={`summary-${s.key}`} aria-pressed={selectedKey === s.key}
                tabIndex={lp > 0.5 ? 0 : -1}
                className={`w-full grid grid-cols-[1fr_4rem_7rem] items-center gap-3 px-2 py-1 rounded-md text-left text-xs transition-[background-color,opacity] duration-200 ${
                  active ? 'bg-gray-50 dark:bg-gray-800' : 'hover:bg-gray-50 dark:hover:bg-gray-800'
                }`}
                style={{ opacity: dimFor(s.key) === 1 ? 1 : 0.45 }}
                {...bindHighlight(s.key)}>
                <span className="flex items-start gap-2 min-w-0">
                  <span className="mt-1 w-2 h-2 rounded-full flex-shrink-0" style={{ background: s.color }} />
                  <span className="text-gray-700 dark:text-gray-200 leading-snug">{s.name}</span>
                </span>
                <span className="text-right font-semibold text-gray-900 dark:text-white tabular-nums">{s.percentage}%</span>
                <span className="text-right text-gray-500 dark:text-gray-400 tabular-nums">{fmt(s.value)} Hrs</span>
              </button>
            );
          })}
          <div className="grid grid-cols-[1fr_4rem_7rem] gap-3 px-2 pt-1.5 mt-1 border-t border-gray-100 dark:border-gray-800 text-xs font-semibold">
            <span className="text-gray-900 dark:text-white pl-4">Total</span>
            <span className="text-right text-gray-900 dark:text-white tabular-nums">100%</span>
            <span className="text-right text-gray-900 dark:text-white tabular-nums">{fmt(total)} Hrs</span>
          </div>
        </div>
      )}

      <p className="text-center text-xs text-gray-400 mt-3">
        {expanded
          ? 'Hover or click a segment, label or row to highlight it'
          : 'Hover over a segment for details · click to pin'}
      </p>
    </div>
  );
}
