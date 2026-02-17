import React from 'react';
import { Button } from '@/components/ui/button';

const emptyStateIcons = {
  sources: '📄',
  trends: '✨',
  report: '📊',
  projects: '📋',
  reports: '📚'
};

export default function EmptyState({ type, title, description, action, actionLabel }) {
  const icon = emptyStateIcons[type] || '→';

  return (
    <div className="text-center py-12">
      <div className="text-5xl mb-4">{icon}</div>
      <h3 className="text-lg font-semibold text-slate-900 mb-2">{title}</h3>
      <p className="text-slate-600 mb-6 max-w-md mx-auto text-sm">{description}</p>
      {action && actionLabel && (
        <Button onClick={action} className="bg-blue-600 hover:bg-blue-700">
          {actionLabel}
        </Button>
      )}
    </div>
  );
}