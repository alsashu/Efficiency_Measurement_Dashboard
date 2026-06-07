import React, { useState } from 'react';
import clsx from 'clsx';
import { TrendingUp, TrendingDown, Minus, Info } from 'lucide-react';

export default function KpiCard({ title, value, subtitle, icon: Icon, trend, trendValue, color = 'carbon', loading, tooltip }) {
  const [showTip, setShowTip] = useState(false);

  const colors = {
    carbon: 'bg-carbon/10 text-carbon dark:bg-carbon/20 dark:text-blue-400',
    green: 'bg-greenline/10 text-greenline',
    red: 'bg-vibrant/10 text-vibrant',
    gold: 'bg-gold/10 text-gold',
    steel: 'bg-steel/10 text-steel',
  };

  const trendColor = trend === 'up' ? 'text-greenline' : trend === 'down' ? 'text-vibrant' : 'text-gray-400';
  const TrendIcon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus;

  return (
    <div className="kpi-card animate-fade-in">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide truncate">{title}</p>
          {tooltip && (
            <div
              className="relative flex-shrink-0"
              onMouseEnter={() => setShowTip(true)}
              onMouseLeave={() => setShowTip(false)}
            >
              <Info size={11} className="text-gray-300 dark:text-gray-600 cursor-help hover:text-gray-400 dark:hover:text-gray-500 transition-colors" />
              {showTip && (
                <div
                  className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 w-56
                             px-2.5 py-2 text-xs text-white leading-relaxed rounded-lg shadow-xl
                             bg-gray-900 dark:bg-gray-700 border border-white/10 pointer-events-none"
                >
                  {tooltip}
                </div>
              )}
            </div>
          )}
        </div>
        {Icon && (
          <div className={clsx('p-2 rounded-lg flex-shrink-0', colors[color])}>
            <Icon size={16} />
          </div>
        )}
      </div>

      {loading ? (
        <div className="h-8 bg-gray-100 dark:bg-gray-800 rounded animate-pulse mb-1" />
      ) : (
        <p className="text-2xl font-bold text-gray-900 dark:text-white mb-1">{value}</p>
      )}

      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-500 dark:text-gray-400">{subtitle}</p>
        {trendValue != null && (
          <div className={clsx('flex items-center gap-1 text-xs font-medium', trendColor)}>
            <TrendIcon size={12} />
            <span>{trendValue}</span>
          </div>
        )}
      </div>
    </div>
  );
}
