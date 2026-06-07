import React from 'react';
import clsx from 'clsx';

export function LoadingSpinner({ size = 'md', className }) {
  const sizes = { sm: 'w-4 h-4', md: 'w-8 h-8', lg: 'w-12 h-12' };
  return (
    <div className={clsx('animate-spin rounded-full border-2 border-gray-200 border-t-carbon', sizes[size], className)} />
  );
}

export function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-[400px]">
      <div className="flex flex-col items-center gap-3">
        <LoadingSpinner size="lg" />
        <p className="text-sm text-gray-500 dark:text-gray-400">Loading...</p>
      </div>
    </div>
  );
}

export function SkeletonCard() {
  return (
    <div className="card p-5 animate-pulse">
      <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-24 mb-4" />
      <div className="h-7 bg-gray-200 dark:bg-gray-700 rounded w-32 mb-2" />
      <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-20" />
    </div>
  );
}
