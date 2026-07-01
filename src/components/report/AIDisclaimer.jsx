import React from 'react';
import { Sparkles } from 'lucide-react';
import { AI_DISCLAIMER_FULL } from '@/lib/aiDisclaimer';

// On-screen AI disclaimer banner shown on any generated content the user can
// share or export. Kept intentionally low-key but always visible.
export default function AIDisclaimer({ className = '' }) {
  return (
    <div
      className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-xs leading-relaxed ${className}`}
      style={{ backgroundColor: '#F7F4EE', borderColor: '#e8e4da', color: '#6b7280' }}
    >
      <Sparkles className="w-3.5 h-3.5 mt-0.5 shrink-0" style={{ color: '#6F8263' }} />
      <span>{AI_DISCLAIMER_FULL}</span>
    </div>
  );
}