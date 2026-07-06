import React from 'react';
import { Users } from 'lucide-react';

// Visual cue that a project/report follows the KAM product-led approach:
// trends derived from the account's own launch history (outside-in analysis).
export default function KAMBadge({ className = '' }) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold ${className}`}
      style={{ background: '#EBF0F8', color: '#1D428A', border: '1px solid #C5D2EC' }}
      title="KAM approach — trends derived from the account's own launch history"
    >
      <Users className="w-3 h-3" />
      KAM · Product-led
    </span>
  );
}