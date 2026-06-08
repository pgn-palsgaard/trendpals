import React, { useMemo } from 'react';

const MEGA_TRENDS = [
  {
    key: 'GLP-1',
    description: 'Weight-loss medications reshape portion sizes and satiety expectations',
    color: { bg: 'bg-violet-50', border: 'border-violet-200', activeBg: 'bg-violet-100', activeBorder: 'border-violet-500', text: 'text-violet-900', sub: 'text-violet-600', chip: 'bg-violet-100 text-violet-700' },
  },
  {
    key: 'Cost reformulation',
    description: 'Permanent ingredient substitution and recipe adaptation under commodity pressure',
    color: { bg: 'bg-orange-50', border: 'border-orange-200', activeBg: 'bg-orange-100', activeBorder: 'border-orange-500', text: 'text-orange-900', sub: 'text-orange-600', chip: 'bg-orange-100 text-orange-700' },
  },
  {
    key: 'Sustainability',
    description: 'PPWR regulation and circular packaging across food categories',
    color: { bg: 'bg-green-50', border: 'border-green-200', activeBg: 'bg-green-100', activeBorder: 'border-green-500', text: 'text-green-900', sub: 'text-green-600', chip: 'bg-green-100 text-green-700' },
  },
  {
    key: 'Plant-based parity',
    description: 'Plant-based moving from compromise to indulgence parity',
    color: { bg: 'bg-lime-50', border: 'border-lime-200', activeBg: 'bg-lime-100', activeBorder: 'border-lime-500', text: 'text-lime-900', sub: 'text-lime-600', chip: 'bg-lime-100 text-lime-700' },
  },
  {
    key: 'Functional & gut health',
    description: 'Probiotics, fermentation, and functional ingredients across categories',
    color: { bg: 'bg-teal-50', border: 'border-teal-200', activeBg: 'bg-teal-100', activeBorder: 'border-teal-500', text: 'text-teal-900', sub: 'text-teal-600', chip: 'bg-teal-100 text-teal-700' },
  },
  {
    key: 'Premium indulgence',
    description: 'Premiumization and intentional indulgence as growth driver',
    color: { bg: 'bg-amber-50', border: 'border-amber-200', activeBg: 'bg-amber-100', activeBorder: 'border-amber-500', text: 'text-amber-900', sub: 'text-amber-600', chip: 'bg-amber-100 text-amber-700' },
  },
  {
    key: 'Protein-as-default',
    description: 'Protein as table-stakes claim across food categories',
    color: { bg: 'bg-blue-50', border: 'border-blue-200', activeBg: 'bg-blue-100', activeBorder: 'border-blue-500', text: 'text-blue-900', sub: 'text-blue-600', chip: 'bg-blue-100 text-blue-700' },
  },
];

export default function MegaTrendsSection({ trends, activeMegaTrend, onSelect }) {
  const stats = useMemo(() => {
    const map = {};
    MEGA_TRENDS.forEach(m => {
      const matching = trends.filter(t => t.mega_trend === m.key);
      const categories = [...new Set(matching.map(t => t.category).filter(Boolean))];
      map[m.key] = { count: matching.length, categories };
    });
    return map;
  }, [trends]);

  return (
    <div className="mb-8">
      <div className="mb-3">
        <h2 className="text-base font-semibold text-slate-800">Cross-category mega-trends</h2>
        <p className="text-sm text-slate-500">Consumer themes that manifest across multiple categories</p>
      </div>

      {/* Scrollable on mobile, grid on desktop */}
      <div className="flex gap-3 overflow-x-auto pb-2 md:grid md:grid-cols-3 xl:grid-cols-4 md:overflow-visible md:pb-0 snap-x snap-mandatory md:snap-none">
        {MEGA_TRENDS.map(m => {
          const s = stats[m.key];
          const isActive = activeMegaTrend === m.key;
          const c = m.color;

          return (
            <button
              key={m.key}
              onClick={() => onSelect(isActive ? null : m.key)}
              className={`
                snap-start shrink-0 w-56 md:w-auto text-left rounded-xl border-2 p-4 transition-all
                ${isActive
                  ? `${c.activeBg} ${c.activeBorder} shadow-md`
                  : `${c.bg} ${c.border} hover:shadow-sm hover:brightness-95`
                }
              `}
            >
              <div className={`font-bold text-sm leading-snug mb-1 ${c.text}`}>{m.key}</div>
              <div className={`text-xs mb-2 leading-snug ${c.sub}`}>{m.description}</div>
              <div className={`text-xs font-semibold mb-2 ${c.text}`}>
                {s.count} {s.count === 1 ? 'trend' : 'trends'} in {s.categories.length} {s.categories.length === 1 ? 'category' : 'categories'}
              </div>
              {s.categories.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {s.categories.slice(0, 4).map(cat => (
                    <span key={cat} className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${c.chip}`}>
                      {cat}
                    </span>
                  ))}
                  {s.categories.length > 4 && (
                    <span className={`text-xs px-1.5 py-0.5 rounded-full ${c.chip} opacity-70`}>
                      +{s.categories.length - 4}
                    </span>
                  )}
                </div>
              )}
              {s.count === 0 && (
                <span className="text-xs opacity-50 italic">No trends assigned yet</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}