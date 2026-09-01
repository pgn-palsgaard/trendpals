import React from 'react';
import { DIVISIONS, setDivision, useDivision } from '@/lib/division';

// The global division choice. Everything downstream — source libraries, GNPD,
// products, and what new uploads are tagged as — follows this one control.
export default function DivisionSwitcher({ collapsed }) {
  const division = useDivision();

  if (collapsed) {
    return (
      <button
        onClick={() => setDivision(division === 'BSA' ? 'Food' : 'BSA')}
        title={`Division: ${division === 'BSA' ? 'Personal Care' : 'Food'} — click to switch`}
        className="mx-auto flex items-center justify-center w-8 h-8 rounded-lg text-xs font-bold text-white"
        style={{ background: division === 'BSA' ? '#6F8263' : '#1D428A' }}
      >
        {division === 'BSA' ? 'PC' : 'F'}
      </button>
    );
  }

  return (
    <div>
      <p className="px-1 mb-1.5 text-xs font-semibold tracking-widest uppercase" style={{ color: 'hsl(var(--muted-foreground))' }}>
        Division
      </p>
      <div className="flex rounded-lg p-0.5" style={{ background: 'hsl(var(--muted))' }}>
        {DIVISIONS.map(d => {
          const active = division === d.value;
          return (
            <button
              key={d.value}
              onClick={() => setDivision(d.value)}
              className="flex-1 rounded-md px-2 py-1.5 text-xs font-semibold transition-colors"
              style={{
                background: active ? '#1D428A' : 'transparent',
                color: active ? '#fff' : '#1D2B47',
              }}
            >
              {d.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}