import React from 'react';
import { CheckCircle2, Circle } from 'lucide-react';

export default function ProjectProgress({ project, sourcesCount, selectedTrendsCount, reportExists }) {
  const steps = [
    { id: 1, label: 'Setup', complete: true },
    { id: 2, label: 'Sources', complete: sourcesCount > 0, count: sourcesCount },
    { id: 3, label: 'Trends', complete: selectedTrendsCount >= 3, count: selectedTrendsCount },
    { id: 4, label: 'Report', complete: reportExists, icon: true }
  ];

  return (
    <div className="mb-8">
      <div className="flex items-center justify-between">
        {steps.map((step, idx) => (
          <React.Fragment key={step.id}>
            <div className="flex flex-col items-center flex-1">
              <div className={`flex items-center justify-center w-10 h-10 rounded-full border-2 transition-all ${
                step.complete 
                  ? 'bg-green-100 border-green-500' 
                  : 'bg-slate-100 border-slate-300'
              }`}>
                {step.complete ? (
                  <CheckCircle2 className="w-6 h-6 text-green-600" />
                ) : (
                  <Circle className="w-6 h-6 text-slate-400" />
                )}
              </div>
              <p className={`text-xs font-medium mt-2 ${
                step.complete ? 'text-slate-900' : 'text-slate-500'
              }`}>
                {step.label}
              </p>
              {step.count !== undefined && (
                <p className="text-xs text-slate-500 mt-1">{step.count}</p>
              )}
            </div>
            {idx < steps.length - 1 && (
              <div className={`flex-1 h-1 mx-2 mb-6 rounded transition-all ${
                step.complete ? 'bg-green-300' : 'bg-slate-200'
              }`} />
            )}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}