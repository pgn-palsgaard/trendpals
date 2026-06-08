import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';

// Fallback color palette keyed on mega_trend_name — keeps pastel accents even for DB-sourced cards
const COLOR_MAP = {
  'GLP-1':                  { bg: 'bg-violet-50', border: 'border-violet-200', activeBg: 'bg-violet-100', activeBorder: 'border-violet-500', text: 'text-violet-900', sub: 'text-violet-600', chip: 'bg-violet-100 text-violet-700' },
  'Cost reformulation':     { bg: 'bg-orange-50', border: 'border-orange-200', activeBg: 'bg-orange-100', activeBorder: 'border-orange-500', text: 'text-orange-900', sub: 'text-orange-600', chip: 'bg-orange-100 text-orange-700' },
  'Sustainability':         { bg: 'bg-green-50',  border: 'border-green-200',  activeBg: 'bg-green-100',  activeBorder: 'border-green-500',  text: 'text-green-900',  sub: 'text-green-600',  chip: 'bg-green-100 text-green-700'  },
  'Plant-based parity':     { bg: 'bg-lime-50',   border: 'border-lime-200',   activeBg: 'bg-lime-100',   activeBorder: 'border-lime-500',   text: 'text-lime-900',   sub: 'text-lime-600',   chip: 'bg-lime-100 text-lime-700'    },
  'Functional & gut health':{ bg: 'bg-teal-50',   border: 'border-teal-200',   activeBg: 'bg-teal-100',   activeBorder: 'border-teal-500',   text: 'text-teal-900',   sub: 'text-teal-600',   chip: 'bg-teal-100 text-teal-700'    },
  'Premium indulgence':     { bg: 'bg-amber-50',  border: 'border-amber-200',  activeBg: 'bg-amber-100',  activeBorder: 'border-amber-500',  text: 'text-amber-900',  sub: 'text-amber-600',  chip: 'bg-amber-100 text-amber-700'  },
  'Protein-as-default':     { bg: 'bg-blue-50',   border: 'border-blue-200',   activeBg: 'bg-blue-100',   activeBorder: 'border-blue-500',   text: 'text-blue-900',   sub: 'text-blue-600',   chip: 'bg-blue-100 text-blue-700'    },
};

const FALLBACK_COLOR = { bg: 'bg-slate-50', border: 'border-slate-200', activeBg: 'bg-slate-100', activeBorder: 'border-slate-500', text: 'text-slate-900', sub: 'text-slate-600', chip: 'bg-slate-100 text-slate-700' };

export default function MegaTrendsSection({ trends, activeMegaTrend, onSelect, onOpenDetail }) {
  const { data: megaTrends = [] } = useQuery({
    queryKey: ['megaTrends'],
    queryFn: () => base44.entities.MegaTrend.filter({ is_active: true }, 'display_order', 50),
  });

  const stats = useMemo(() => {
    const map = {};
    megaTrends.forEach(m => {
      const matching = trends.filter(t => t.mega_trend === m.mega_trend_name);
      const categories = [...new Set(matching.map(t => t.category).filter(Boolean))];
      map[m.mega_trend_name] = { count: matching.length, categories };
    });
    return map;
  }, [megaTrends, trends]);

  if (megaTrends.length === 0) return null;

  return (
    <div className="mb-8">
      <div className="mb-3">
        <h2 className="text-base font-semibold text-slate-800">Cross-category mega-trends</h2>
        <p className="text-sm text-slate-500">Consumer themes that manifest across multiple categories</p>
      </div>

      {/* Scrollable on mobile, grid on desktop */}
      <div className="flex gap-3 overflow-x-auto pb-2 md:grid md:grid-cols-3 xl:grid-cols-4 md:overflow-visible md:pb-0 snap-x snap-mandatory md:snap-none">
        {megaTrends.map(m => {
          const s = stats[m.mega_trend_name] || { count: 0, categories: [] };
          const isActive = activeMegaTrend === m.mega_trend_name;
          const c = COLOR_MAP[m.mega_trend_name] || FALLBACK_COLOR;

          return (
            <button
              key={m.id}
              onClick={() => {
                // Left-click toggles filter; open detail on the same click for UX (filter + detail together)
                onSelect(isActive ? null : m.mega_trend_name);
                onOpenDetail(m);
              }}
              className={`
                snap-start shrink-0 w-56 md:w-auto text-left rounded-xl border-2 p-4 transition-all
                ${isActive
                  ? `${c.activeBg} ${c.activeBorder} shadow-md`
                  : `${c.bg} ${c.border} hover:shadow-sm hover:brightness-95`
                }
              `}
            >
              <div className={`font-bold text-sm leading-snug mb-1 ${c.text}`}>{m.mega_trend_name}</div>
              <div className={`text-xs mb-2 leading-snug ${c.sub}`}>{m.short_description}</div>
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