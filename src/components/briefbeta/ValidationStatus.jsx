import React from 'react';
import { Loader2 } from 'lucide-react';

// Inline indicator while the build → validate → rewrite loop runs.
export default function ValidationStatus({ status }) {
  if (!status) return null;
  return (
    <div className="pal-card p-3 flex items-center gap-2">
      <Loader2 className="w-4 h-4 animate-spin" style={{ color: '#1D428A' }} />
      <p className="text-sm text-foreground">
        {status.attempt > 1
          ? `Retter dæk (forsøg ${status.attempt}/${status.total})…`
          : `Validerer dæk (forsøg ${status.attempt}/${status.total})…`}
      </p>
    </div>
  );
}