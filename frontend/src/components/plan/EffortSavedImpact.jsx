import React from 'react';
import { Zap, LayoutDashboard, GraduationCap, Gauge } from 'lucide-react';

// Intentionally hard-coded per product requirement — no backend field backs these yet.
const EFFORT_SAVED_IMPACT = [
  { label: 'Automation initiatives', value: 30, icon: Zap, color: 'carbon' },
  { label: 'Dashboard creation', value: 8, icon: LayoutDashboard, color: 'steel' },
  { label: 'Upskilling', value: 40, icon: GraduationCap, color: 'green' },
  { label: 'Efficiency improvement initiatives', value: 22, icon: Gauge, color: 'gold' },
];

const ICON_CLASSES = {
  carbon: 'bg-carbon/10 text-carbon dark:bg-carbon/20 dark:text-blue-400',
  green: 'bg-greenline/10 text-greenline',
  gold: 'bg-gold/10 text-gold',
  steel: 'bg-steel/10 text-steel',
};

const BAR_CLASSES = {
  carbon: 'bg-carbon dark:bg-blue-400',
  green: 'bg-greenline',
  gold: 'bg-gold',
  steel: 'bg-steel',
};

export default function EffortSavedImpact() {
  return (
    <div className="chart-container">
      <p className="section-title">Effort Saved Impact</p>
      <p className="section-subtitle mb-4">Effort variance contribution by initiative</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {EFFORT_SAVED_IMPACT.map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="p-4 rounded-lg border border-gray-100 dark:border-gray-800">
            <div className="flex items-center justify-between mb-3">
              <div className={`p-2 rounded-lg ${ICON_CLASSES[color]}`}>
                <Icon size={16} />
              </div>
              <span className="text-xl font-bold text-gray-900 dark:text-white tabular-nums">{value}%</span>
            </div>
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400">{label}</p>
            <div className="mt-2 h-1.5 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
              <div className={`h-full rounded-full ${BAR_CLASSES[color]}`} style={{ width: `${value}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
