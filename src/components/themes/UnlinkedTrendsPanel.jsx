import React from 'react';

const CATEGORY_LABELS = {
  bakery: 'Bakery', condiments: 'Condiments', chocolate_confectionery: 'Confectionery',
  dairy: 'Dairy', ice_cream: 'Ice Cream', meat: 'Processed Meat', oils_fats: 'Oils & Fats',
  plant_based: 'Plant-based', rutf_rusf: 'RUTF/RUSF', needs_human_review: 'Needs Review',
};

export default function UnlinkedTrendsPanel({ trends }) {
  if (!trends.length) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 px-6 py-8 text-center text-sm text-slate-400 bg-white">
        All active trends are linked to at least one theme.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      <div className="divide-y divide-slate-100">
        {trends.map(t => (
          <div key={t.id} className="px-5 py-3 flex items-center justify-between gap-3">
            <div>
              <span className="text-sm font-medium text-slate-700">{t.trend_name}</span>
              {t.category && (
                <span className="ml-2 text-xs text-slate-400 capitalize">{(CATEGORY_LABELS[t.category] || t.category)}</span>
              )}
              {t.market_signal && (
                <p className="text-xs text-slate-400 mt-0.5 line-clamp-1">{t.market_signal}</p>
              )}
            </div>
            <span className="text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 shrink-0">
              Not linked
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}