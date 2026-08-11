import React from 'react';
import { Globe } from 'lucide-react';

/**
 * Marks a record as discovered on the open web by Market Scout — visually
 * distinct from Mintel/GNPD-sourced evidence.
 */
export default function WebBadge({ label = 'Web', className = '' }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold ${className}`}
      style={{ background: '#EEF1EC', color: '#4A6040' }}
      title="Discovered on the open web by Market Scout — supplementary signal, not Mintel/GNPD evidence"
    >
      <Globe className="w-3 h-3" />
      {label}
    </span>
  );
}