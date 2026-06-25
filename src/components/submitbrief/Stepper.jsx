import React from 'react';
import { Check } from 'lucide-react';

const STEPS = ['Brief type', 'Add context', 'Review brief'];

// Focus trends (internal step 2) is temporarily disabled, so internal step 3 (review)
// maps to the 3rd visible dot (index 2).
const STEP_INDEX_MAP = { 0: 0, 1: 1, 3: 2 };

export default function Stepper({ currentStep }) {
  const displayStep = STEP_INDEX_MAP[currentStep] ?? currentStep;
  return (
    <div className="flex items-center justify-center gap-2 mb-8">
      {STEPS.map((label, i) => {
        const isActive = i === displayStep;
        const isDone = i < displayStep;
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