import React from 'react';
import { Check, Loader2, Circle } from 'lucide-react';

// Visual "orchestration monitor" — shows the user exactly where the PPTX build is.
export default function GammaProgressSteps({ steps, activeIndex, failed }) {
  return (
    <ol className="space-y-2.5">
      {steps.map((label, i) => {
        const done = i < activeIndex;
        const active = i === activeIndex && !failed;
        return (
          <li key={label} className="flex items-center gap-2.5">
            <span className="w-5 h-5 flex items-center justify-center shrink-0">
              {done ? (
                <Check className="w-4 h-4" style={{ color: '#6F8263' }} />
              ) : active ? (
                <Loader2 className="w-4 h-4 animate-spin" style={{ color: '#1D428A' }} />
              ) : (
                <Circle className="w-3 h-3 text-muted-foreground/40" />
              )}
            </span>
            <span
              className="text-sm"
              style={{
                color: done ? '#6F8263' : active ? '#1D428A' : undefined,
                fontWeight: active || done ? 600 : 400,
              }}
            >
              {label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}