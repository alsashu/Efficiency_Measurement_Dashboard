import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Info, X, ExternalLink, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import clsx from 'clsx';

// ─── Formatters ──────────────────────────────────────────────────────────────

const fmt = (n, d = 0) => (n == null || isNaN(n)) ? '—' : parseFloat(n).toLocaleString('en-IN', { minimumFractionDigits: d, maximumFractionDigits: d });
const fmtEur = (n) => (n == null || isNaN(n)) ? '—' : `€${fmt(n)}`;
const fmtPi = (n) => (n == null || isNaN(n)) ? '—' : parseFloat(n).toFixed(2);
const sign = (n) => parseFloat(n) >= 0 ? `+${fmt(n)}` : fmt(n);

// ─── Small table helpers ──────────────────────────────────────────────────────

function THead({ cols }) {
  return (
    <thead>
      <tr className="bg-gray-50 dark:bg-gray-800/80 text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
        {cols.map((c, i) => (
          <th key={i} className={clsx('px-3 py-1.5 border-b border-gray-100 dark:border-gray-800', i === cols.length - 1 ? 'text-right' : 'text-left')}>{c}</th>
        ))}
      </tr>
    </thead>
  );
}

function TRow({ cells, highlight }) {
  return (
    <tr className={clsx('border-b border-gray-50 dark:border-gray-800/60 last:border-0', highlight)}>
      {cells.map((cell, i) => (
        <td key={i} className={clsx('px-3 py-1.5 text-xs', i === cells.length - 1 ? 'text-right tabular-nums' : 'text-left text-gray-700 dark:text-gray-200')}>
          {cell}
        </td>
      ))}
    </tr>
  );
}

function EmptyRow({ colSpan }) {
  return (
    <tr><td colSpan={colSpan} className="px-3 py-4 text-center text-xs text-gray-400 italic">No data</td></tr>
  );
}

// ─── Tab switcher ─────────────────────────────────────────────────────────────

function TabBar({ tabs, active, onChange }) {
  return (
    <div className="flex gap-1 px-3 pt-2 pb-1">
      {tabs.map(t => (
        <button key={t.value} onClick={() => onChange(t.value)}
          className={clsx('px-2.5 py-1 rounded text-[10px] font-semibold transition-colors',
            active === t.value
              ? 'bg-carbon/10 dark:bg-carbon/20 text-carbon dark:text-blue-300'
              : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'
          )}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

// ─── Per-KPI content renderers ────────────────────────────────────────────────

function TotalProgramsContent({ programs }) {
  return (
    <table className="w-full">
      <THead cols={['Program Name', 'Code', 'PM Responsible']} />
      <tbody>
        {!programs.length
          ? <EmptyRow colSpan={3} />
          : programs.map((p, i) => (
            <TRow key={i} cells={[
              p.program_name,
              <span className="font-mono text-gray-500">{p.program_code || '—'}</span>,
              p.pm_responsible || '—',
            ]} />
          ))}
      </tbody>
    </table>
  );
}

function DepartmentsContent({ departments }) {
  return (
    <table className="w-full">
      <THead cols={['Department', 'Programs']} />
      <tbody>
        {!departments.length
          ? <EmptyRow colSpan={2} />
          : [...departments].sort((a, b) => b.program_count - a.program_count).map((d, i) => (
            <TRow key={i} cells={[d.dept, <span className="font-semibold text-gray-900 dark:text-white">{d.program_count}</span>]} />
          ))}
      </tbody>
    </table>
  );
}

// Combined Departments & Programs — tabbed
function DeptsProgramsContent({ programs, departments }) {
  const [tab, setTab] = useState('programs');
  return (
    <div>
      <TabBar
        tabs={[{ value: 'programs', label: 'Programs' }, { value: 'depts', label: 'Departments' }]}
        active={tab}
        onChange={setTab}
      />
      {tab === 'programs'
        ? <TotalProgramsContent programs={programs} />
        : <DepartmentsContent departments={departments} />}
    </div>
  );
}

function BreakdownContent({ programs, departments, progVal, deptVal, label, formatter = fmt }) {
  const [tab, setTab] = useState('program');

  const sortedPrograms = [...programs].sort((a, b) => parseFloat(b[progVal]) - parseFloat(a[progVal]));
  const sortedDepts = [...departments].sort((a, b) => parseFloat(b[deptVal]) - parseFloat(a[deptVal]));

  return (
    <div>
      <TabBar tabs={[{ value: 'program', label: 'By Program' }, { value: 'dept', label: 'By Department' }]} active={tab} onChange={setTab} />
      <table className="w-full">
        {tab === 'program' ? (
          <>
            <THead cols={['Program Name', label]} />
            <tbody>
              {!sortedPrograms.length ? <EmptyRow colSpan={2} /> : sortedPrograms.map((p, i) => (
                <TRow key={i} cells={[p.program_name, <span className="font-semibold">{formatter(p[progVal])}</span>]} />
              ))}
            </tbody>
          </>
        ) : (
          <>
            <THead cols={['Department', label]} />
            <tbody>
              {!sortedDepts.length ? <EmptyRow colSpan={2} /> : sortedDepts.map((d, i) => (
                <TRow key={i} cells={[d.dept, <span className="font-semibold">{formatter(d[deptVal])}</span>]} />
              ))}
            </tbody>
          </>
        )}
      </table>
    </div>
  );
}

function VarianceContent({ programs, departments }) {
  const [tab, setTab] = useState('program');

  const sortedP = [...programs].sort((a, b) => Math.abs(parseFloat(b.effort_variance)) - Math.abs(parseFloat(a.effort_variance)));
  const sortedD = [...departments].sort((a, b) => Math.abs(parseFloat(b.effort_variance)) - Math.abs(parseFloat(a.effort_variance)));

  const varCell = (v) => {
    const n = parseFloat(v);
    const cls = n > 0 ? 'text-greenline' : n < 0 ? 'text-vibrant' : 'text-gray-400';
    return <span className={clsx('font-semibold', cls)}>{sign(v)}</span>;
  };

  return (
    <div>
      <TabBar tabs={[{ value: 'program', label: 'By Program' }, { value: 'dept', label: 'By Department' }]} active={tab} onChange={setTab} />
      <table className="w-full">
        {tab === 'program' ? (
          <>
            <THead cols={['Program Name', 'Variance (Hrs)']} />
            <tbody>
              {!sortedP.length ? <EmptyRow colSpan={2} /> : sortedP.map((p, i) => (
                <TRow key={i} cells={[p.program_name, varCell(p.effort_variance)]} />
              ))}
            </tbody>
          </>
        ) : (
          <>
            <THead cols={['Department', 'Variance (Hrs)']} />
            <tbody>
              {!sortedD.length ? <EmptyRow colSpan={2} /> : sortedD.map((d, i) => (
                <TRow key={i} cells={[d.dept, varCell(d.effort_variance)]} />
              ))}
            </tbody>
          </>
        )}
      </table>
    </div>
  );
}

function AvgPiContent({ programs }) {
  const sorted = [...programs]
    .filter(p => parseFloat(p.avg_pi) > 0)
    .sort((a, b) => parseFloat(b.avg_pi) - parseFloat(a.avg_pi));

  const topSet = new Set(sorted.slice(0, 5).map(p => p.program_name));
  const botSet = new Set(sorted.slice(-5).map(p => p.program_name));

  return (
    <table className="w-full">
      <THead cols={['Program Name', 'PI', '']} />
      <tbody>
        {!sorted.length ? <EmptyRow colSpan={3} /> : sorted.map((p, i) => {
          const isTop = topSet.has(p.program_name) && sorted.length > 5;
          const isBot = botSet.has(p.program_name) && sorted.length > 5;
          const piVal = parseFloat(p.avg_pi);
          const piColor = piVal > 1 ? 'text-vibrant' : piVal < 1 ? 'text-greenline' : 'text-gray-500 dark:text-gray-400';
          return (
            <TRow key={i}
              cells={[
                p.program_name,
                <span className={clsx('font-semibold', piColor)}>{fmtPi(p.avg_pi)}</span>,
                isTop ? <span className="text-[9px] font-semibold text-greenline bg-greenline/10 px-1 py-0.5 rounded">Top 5</span>
                  : isBot ? <span className="text-[9px] font-semibold text-vibrant bg-vibrant/10 px-1 py-0.5 rounded">Low 5</span>
                  : null,
              ]}
            />
          );
        })}
      </tbody>
    </table>
  );
}

// ─── Content router ───────────────────────────────────────────────────────────

function TooltipContent({ kpiKey, tooltipData }) {
  const { programs = [], departments = [] } = tooltipData || {};
  switch (kpiKey) {
    case 'depts_programs':
      return <DeptsProgramsContent programs={programs} departments={departments} />;
    case 'est_hours':
      return <BreakdownContent programs={programs} departments={departments} progVal="estimated_hrs" deptVal="estimated_hrs" label="Est. Hours" />;
    case 'actual_hours':
      return <BreakdownContent programs={programs} departments={departments} progVal="actual_hrs" deptVal="actual_hrs" label="Actual Hours" />;
    case 'effort_variance':
      return <VarianceContent programs={programs} departments={departments} />;
    case 'avg_pi':
      return <AvgPiContent programs={programs} />;
    case 'effort_saved_hrs':
      return <BreakdownContent programs={programs} departments={departments} progVal="effort_saved_hrs" deptVal="effort_saved_hrs" label="Effort Saved (Hrs)" />;
    case 'effort_saved_euros':
      return <BreakdownContent programs={programs} departments={departments} progVal="effort_saved_euros" deptVal="effort_saved_euros" label="Effort Saved (€)" formatter={fmtEur} />;
    case 'cost_saved':
      return <BreakdownContent programs={programs} departments={departments} progVal="cost_saved_euros" deptVal="cost_saved_euros" label="Cost Saved (€)" formatter={fmtEur} />;
    default:
      return null;
  }
}

const KPI_TITLES = {
  depts_programs: 'Departments & Programs',
  est_hours: 'Estimated Hours Breakdown',
  actual_hours: 'Actual Hours Breakdown',
  effort_variance: 'Effort Variance Breakdown',
  avg_pi: 'Productivity Index per Program',
  effort_saved_hrs: 'Effort Saved (Hours) Breakdown',
  effort_saved_euros: 'Effort Saved from Opportunities (€)',
  cost_saved: 'Cost Saved Breakdown',
};

// ─── Portal-based popover ─────────────────────────────────────────────────────

function KpiPopover({ anchorRef, kpiKey, tooltipData, onClose, popoverRef, onPopoverMouseEnter, onPopoverMouseLeave, onViewDetails }) {
  const [style, setStyle] = useState({ position: 'fixed', opacity: 0, zIndex: 9999 });

  useEffect(() => {
    if (!anchorRef.current) return;
    const rect = anchorRef.current.getBoundingClientRect();
    const PW = 420;
    const PH = 360;

    let left = rect.left + rect.width / 2 - PW / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - PW - 8));

    const top = rect.top >= PH + 12
      ? rect.top - PH - 8
      : rect.bottom + 8;

    setStyle({ position: 'fixed', top, left, width: PW, zIndex: 9999, opacity: 1 });
  }, [anchorRef]);

  return createPortal(
    <div
      ref={popoverRef}
      style={style}
      className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden transition-opacity duration-100"
      onMouseEnter={onPopoverMouseEnter}
      onMouseLeave={onPopoverMouseLeave}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-gray-100 dark:border-gray-800 bg-gray-50/80 dark:bg-gray-800/50">
        <p className="text-xs font-semibold text-gray-900 dark:text-white truncate pr-2">
          {KPI_TITLES[kpiKey] || kpiKey}
        </p>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={onViewDetails}
            className="flex items-center gap-1 text-[10px] font-medium text-carbon dark:text-blue-400 hover:underline"
          >
            <ExternalLink size={9} /> View Details
          </button>
          <button
            onClick={onClose}
            className="p-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded transition-colors"
          >
            <X size={13} />
          </button>
        </div>
      </div>

      {/* Scrollable body */}
      <div className="overflow-y-auto" style={{ maxHeight: 300 }}>
        {tooltipData
          ? <TooltipContent kpiKey={kpiKey} tooltipData={tooltipData} />
          : (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin w-5 h-5 border-2 border-carbon border-t-transparent rounded-full" />
            </div>
          )}
      </div>
    </div>,
    document.body
  );
}

// ─── Card color map ───────────────────────────────────────────────────────────

const COLOR_CLASSES = {
  carbon: 'bg-carbon/10 text-carbon dark:bg-carbon/20 dark:text-blue-400',
  green:  'bg-greenline/10 text-greenline',
  red:    'bg-vibrant/10 text-vibrant',
  gold:   'bg-gold/10 text-gold',
  steel:  'bg-steel/10 text-steel',
};

const TREND_COLORS = { up: 'text-greenline', down: 'text-vibrant', flat: 'text-gray-400' };
const TREND_ICONS  = { up: TrendingUp, down: TrendingDown, flat: Minus };

// ─── Dual-value body (Departments & Programs combined card) ───────────────────
// dualValues: [{ label, value, sub }, { label, value, sub }]

function DualValueBody({ dualValues, loading }) {
  if (loading) {
    return (
      <div className="flex gap-3 mt-1 mb-2">
        {[0, 1].map(i => (
          <div key={i} className="flex-1">
            <div className="h-7 bg-gray-100 dark:bg-gray-800 rounded animate-pulse mb-1" />
            <div className="h-3 w-3/4 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" />
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="flex items-stretch gap-0 mt-1 mb-2">
      {dualValues.map((item, i) => (
        <React.Fragment key={i}>
          {i > 0 && (
            <div className="w-px bg-gray-200 dark:bg-gray-700 mx-3 self-stretch" />
          )}
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-0.5">{item.label}</p>
            <p className="text-xl font-bold text-gray-900 dark:text-white tabular-nums leading-tight">{item.value}</p>
            {item.sub && <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5 truncate">{item.sub}</p>}
          </div>
        </React.Fragment>
      ))}
    </div>
  );
}

// ─── Main PlanKpiCard ─────────────────────────────────────────────────────────

export default function PlanKpiCard({
  title, value, subtitle, icon: Icon, color = 'carbon',
  trend, trendValue, loading,
  kpiKey, tooltipData,
  // When provided, replaces single value with two side-by-side mini-stats
  dualValues,
}) {
  const navigate = useNavigate();
  const cardRef = useRef(null);
  const popoverRef = useRef(null);
  const closeTimer = useRef(null);
  const [open, setOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(pointer: coarse)');
    setIsMobile(mq.matches);
    const h = (e) => setIsMobile(e.matches);
    mq.addEventListener('change', h);
    return () => mq.removeEventListener('change', h);
  }, []);

  const hasDetail = (tooltipData?.programs?.length > 0 || tooltipData?.departments?.length > 0);

  const scheduleClose = useCallback(() => {
    clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setOpen(false), 180);
  }, []);

  const cancelClose = useCallback(() => clearTimeout(closeTimer.current), []);

  useEffect(() => () => clearTimeout(closeTimer.current), []);

  useEffect(() => {
    if (!open || !isMobile) return;
    const h = (e) => {
      if (!cardRef.current?.contains(e.target) && !popoverRef.current?.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open, isMobile]);

  const TrendIcon = TREND_ICONS[trend] || TREND_ICONS.flat;
  const trendCls = TREND_COLORS[trend] || TREND_COLORS.flat;
  const iconBg = COLOR_CLASSES[color] || COLOR_CLASSES.carbon;

  return (
    <div
      ref={cardRef}
      className="kpi-card animate-fade-in"
      onMouseEnter={() => !isMobile && hasDetail && cancelClose()}
      onMouseLeave={() => !isMobile && scheduleClose()}
    >
      {/* Header row */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide truncate">{title}</p>
          {hasDetail && (
            <button
              className="flex-shrink-0 p-0.5 rounded transition-colors text-gray-300 dark:text-gray-600 hover:text-carbon dark:hover:text-blue-400"
              onMouseEnter={() => { if (!isMobile) { cancelClose(); setOpen(true); } }}
              onClick={() => { if (isMobile) setOpen(v => !v); }}
              title="View breakdown"
            >
              <Info size={11} />
            </button>
          )}
        </div>
        {Icon && (
          <div className={clsx('p-2 rounded-lg flex-shrink-0', iconBg)}>
            <Icon size={16} />
          </div>
        )}
      </div>

      {/* Dual value layout OR single value layout */}
      {dualValues ? (
        <DualValueBody dualValues={dualValues} loading={loading} />
      ) : (
        <>
          {loading ? (
            <div className="h-8 bg-gray-100 dark:bg-gray-800 rounded animate-pulse mb-1" />
          ) : (
            <p className="text-2xl font-bold text-gray-900 dark:text-white mb-1">{value}</p>
          )}
          {/* Subtitle + trend */}
          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-500 dark:text-gray-400">{subtitle}</p>
            {trendValue != null && (
              <div className={clsx('flex items-center gap-1 text-xs font-medium', trendCls)}>
                <TrendIcon size={12} /><span>{trendValue}</span>
              </div>
            )}
          </div>
        </>
      )}

      {/* Mobile backdrop */}
      {open && isMobile && createPortal(
        <div className="fixed inset-0 bg-black/20 z-[9998]" onClick={() => setOpen(false)} />,
        document.body
      )}

      {/* Rich popover */}
      {open && hasDetail && (
        <KpiPopover
          popoverRef={popoverRef}
          anchorRef={cardRef}
          kpiKey={kpiKey}
          tooltipData={tooltipData}
          onClose={() => { setOpen(false); cancelClose(); }}
          onPopoverMouseEnter={cancelClose}
          onPopoverMouseLeave={scheduleClose}
          onViewDetails={() => { navigate('/plan/data-viewer'); setOpen(false); }}
        />
      )}
    </div>
  );
}
