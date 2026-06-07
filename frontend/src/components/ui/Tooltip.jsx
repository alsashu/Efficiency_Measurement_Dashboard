import React, { useState, useRef } from 'react';
import clsx from 'clsx';

export default function Tooltip({ content, children, placement = 'top', delay = 200, maxWidth = 260 }) {
  const [visible, setVisible] = useState(false);
  const timer = useRef(null);

  if (!content) return <>{children}</>;

  const show = () => { timer.current = setTimeout(() => setVisible(true), delay); };
  const hide = () => { clearTimeout(timer.current); setVisible(false); };

  return (
    <div className="relative inline-block" onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide}>
      {children}
      {visible && (
        <div
          role="tooltip"
          style={{ maxWidth, zIndex: 9999 }}
          className={clsx(
            'absolute px-2.5 py-1.5 text-xs text-white rounded-lg shadow-xl',
            'pointer-events-none select-none leading-relaxed',
            'bg-gray-900 dark:bg-gray-700 border border-white/10 animate-fade-in',
            placement === 'top' && 'bottom-full left-1/2 -translate-x-1/2 mb-1.5',
            placement === 'bottom' && 'top-full left-1/2 -translate-x-1/2 mt-1.5',
            placement === 'left' && 'right-full top-1/2 -translate-y-1/2 mr-1.5',
            placement === 'right' && 'left-full top-1/2 -translate-y-1/2 ml-1.5',
          )}
        >
          {content}
        </div>
      )}
    </div>
  );
}
