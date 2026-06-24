import React from 'react';
import { Check } from 'lucide-react';

const STEPS = ['Brief type', 'Add context', 'Review brief'];

export default function Stepper({ currentStep }) {
  return (
    <div className="flex items-center justify-center gap-2 mb-8">
      {STEPS.map((label, i) => {
        const isActive = i === currentStep;
        const isDone = i < currentStep;
        return (
          <React.Fragment key={label}>
            <div className="flex items-center gap-2">
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 transition-colors"
                style={{
                  background: isDone ? '#16A34A' : isActive ? '#1D428A' : '#E7E5E4',
                  color: isDone || isActive ? '#fff' : '#78716C',
                }}
              >
                {isDone ? <Check className="w-4 h-4" /> : i + 1}
              </div>
              <span
                className="text-sm font-medium whitespace-nowrap"
                style={{ color: isActive ? '#1D428A' : isDone ? '#16A34A' : '#A8A29E' }}
              >
                {label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div className="w-10 sm:w-16 h-px mx-1" style={{ background: '#E7E5E4' }} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}