import React from 'react';
import { Check, Circle } from 'lucide-react';

const CHECKLIST = [
  { key: 'request_type', label: 'Request type' },
  { key: 'customer_audience', label: 'Customer / audience' },
  { key: 'region', label: 'Market or region' },
  { key: 'category', label: 'Category / application' },
  { key: 'objective', label: 'Business objective' },
  { key: 'deadline', label: 'Deadline' },
];

/**
 * Right-column readiness panel.
 * `fields` holds extracted brief_fields values; request_type is always present after step 1.
 */
export default function BriefReadiness({ fields, jtbdLabel, onChangeType, onContinue }) {
  const isReady = (key) => key === 'request_type' ? true : !!fields[key];
  const readyCount = CHECKLIST.filter(item => isReady(item.key)).length;
  const allReady = readyCount === CHECKLIST.length;
  const canContinue = readyCount >= 4;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-stone-200 p-5">
      <p className="text-sm font-semibold text-stone-800 mb-4">Brief readiness</p>

      <ul className="space-y-2.5 mb-5">
        {CHECKLIST.map(item => {
          const done = isReady(item.key);
          return (
            <li key={item.key} className="flex items-center gap-2.5 text-sm">
              {done ? (
                <Check className="w-4 h-4 text-green-600 shrink-0" />
              ) : (
                <Circle className="w-4 h-4 text-stone-400 shrink-0" />
              )}
              <span className={done ? 'text-stone-800' : 'text-stone-400'}>{item.label}</span>
            </li>
          );
        })}
      </ul>

      <div className="border-t border-stone-100 pt-4 mb-4">
        <p className="text-xs text-stone-400 mb-1.5">Selected brief type</p>
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium bg-blue-50 text-[#1D428A]">
            {jtbdLabel}
          </span>
          <button onClick={onChangeType} className="text-xs text-[#1D428A] hover:underline">
            Change
          </button>
        </div>
      </div>

      {allReady && (
        <div className="rounded-lg bg-green-50 border border-green-200 px-3 py-2.5 mb-3">
          <p className="text-xs font-medium text-green-700">Brief is ready — review below.</p>
        </div>
      )}

      <button
        onClick={onContinue}
        disabled={!canContinue}
        className="w-full rounded-lg py-2.5 text-sm font-semibold text-white transition-colors disabled:cursor-not-allowed"
        style={{ background: canContinue ? '#1D428A' : '#CBD5E1' }}
        onMouseEnter={e => { if (canContinue) e.currentTarget.style.background = '#1E3A8A'; }}
        onMouseLeave={e => { if (canContinue) e.currentTarget.style.background = '#1D428A'; }}
      >
        Continue to review
      </button>
      {!canContinue && (
        <p className="text-xs text-stone-400 text-center mt-2">
          {readyCount} of 6 captured — keep chatting to continue.
        </p>
      )}
    </div>
  );
}