import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Star, ChevronDown, ChevronRight } from 'lucide-react';

const THEME_COLORS = {
  sage:      { header: '#6F8263', light: '#f0f4ee', border: '#c5d1be', accent: '#3d4a38', pill: '#eaf2e8', pillText: '#3d4a38' },
  chocolate: { header: '#59361F', light: '#f4efe9', border: '#c8b09a', accent: '#3a220f', pill: '#f4ede4', pillText: '#59361F' },
  blue:      { header: '#1D428A', light: '#edf1f9', border: '#a8bcde', accent: '#132d5e', pill: '#e8eefc', pillText: '#1D428A' },
};

const CATEGORY_LABELS = {
  bakery: 'Bakery', condiments: 'Condiments', chocolate_confectionery: 'Confectionery',
  dairy: 'Dairy', ice_cream: 'Ice Cream', meat: 'Processed Meat', oils_fats: 'Oils & Fats',
  plant_based: 'Plant-based', rutf_rusf: 'RUTF/RUSF', needs_human_review: 'Needs Review',
};

const CAP_FIT_COLORS = {
  strong: { bg: '#eaf2e8', text: '#3a6b2e' },
  possible: { bg: '#fef3c7', text: '#92400e' },
  none: { bg: '#f1f5f9', text: '#64748b' },
  unknown: { bg: '#f8fafc', text: '#94a3b8' },
};

const YEARS = [2027, 2028, 2026];

function TrendCascadeCard({ trend, challenges, recipes, themeColors, isPrimary }) {
  const [expanded, setExpanded] = useState(false);

  // Group challenges by approval
  const approvedChallenges = (challenges || []).filter(c => c.is_active && c.review_status === 'approved');

  // Build recipe map for challenges
  const recipeMap = useMemo(() => {
    const map = {};
    (recipes || []).forEach(r => {
      (r.challenge_ids || []).forEach(cid => {
        if (!map[cid]) map[cid] = [];
        map[cid].push(r);
      });
    });
    return map;
  }, [recipes]);

  return (
    <div
      className="rounded-xl overflow-hidden border"
      style={{ borderColor: themeColors.border, backgroundColor: '#fff' }}
    >
      {/* Trend header */}
      <div
        className="px-4 py-3 flex items-start justify-between gap-2 cursor-pointer"
        style={{ backgroundColor: themeColors.light }}
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            {isPrimary && <Star className="w-3.5 h-3.5 shrink-0" style={{ color: themeColors.header, fill: themeColors.header }} />}
            <span className="font-semibold text-sm leading-snug" style={{ color: '#1D2B47' }}>{trend.trend_name}</span>
          </div>
          {trend.category && (
            <span className="text-xs mt-0.5 block" style={{ color: themeColors.accent }}>
              {CATEGORY_LABELS[trend.category] || trend.category}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {approvedChallenges.length > 0 && (
            <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: themeColors.pill, color: themeColors.pillText }}>
              {approvedChallenges.length} challenge{approvedChallenges.length !== 1 ? 's' : ''}
            </span>
          )}
          {expanded ? <ChevronDown className="w-3.5 h-3.5 text-slate-400" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-400" />}
        </div>
      </div>

      {/* Market signal */}
      {trend.market_signal && (
        <div className="px-4 py-2 border-t" style={{ borderColor: themeColors.border }}>
          <p className="text-xs text-slate-500 leading-relaxed line-clamp-2">{trend.market_signal}</p>
        </div>
      )}

      {/* Challenges cascade */}
      {expanded && approvedChallenges.length > 0 && (
        <div className="border-t divide-y" style={{ borderColor: themeColors.border, divideColor: themeColors.border }}>
          {approvedChallenges.map(c => {
            const fitStyle = CAP_FIT_COLORS[c.capability_fit] || CAP_FIT_COLORS.unknown;
            const linkedRecipes = recipeMap[c.id] || [];
            return (
              <div key={c.id} className="px-4 py-3">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <span className="text-xs font-semibold text-slate-700">{c.name}</span>
                  <span className="text-xs px-1.5 py-0.5 rounded font-medium shrink-0" style={{ backgroundColor: fitStyle.bg, color: fitStyle.text }}>
                    {c.capability_fit || 'unknown'}
                  </span>
                </div>
                {c.description && <p className="text-xs text-slate-500 mb-2">{c.description}</p>}
                {linkedRecipes.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {linkedRecipes.map(r => (
                      <span key={r.id} className="text-xs px-2 py-0.5 rounded-full"
                        style={{
                          backgroundColor: r.recipe_match_status === 'existing' ? '#eaf2e8' : r.recipe_match_status === 'concept_needed' ? '#fef3c7' : '#f1f5f9',
                          color: r.recipe_match_status === 'existing' ? '#3a6b2e' : r.recipe_match_status === 'concept_needed' ? '#92400e' : '#64748b',
                        }}>
                        {r.name}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {expanded && approvedChallenges.length === 0 && (
        <div className="px-4 py-3 border-t text-xs text-slate-400 italic" style={{ borderColor: themeColors.border }}>
          No approved challenges linked yet.
        </div>
      )}
    </div>
  );
}

function ThemeColumn({ theme, links, trends, challenges, recipes }) {
  const colors = THEME_COLORS[theme.color_key] || THEME_COLORS.blue;
  const approvedLinks = links.filter(l => l.link_status === 'approved');

  // Group approved linked trends by category
  const groupedByCategory = useMemo(() => {
    const map = {};
    approvedLinks.forEach(link => {
      const trend = trends[link.global_trend_id];
      if (!trend) return;
      const cat = trend.category || 'other';
      if (!map[cat]) map[cat] = [];
      map[cat].push({ trend, link });
    });
    return map;
  }, [approvedLinks, trends]);

  const categoryOrder = Object.keys(CATEGORY_LABELS).filter(k => groupedByCategory[k]);

  return (
    <div className="flex flex-col min-w-0">
      {/* Column header */}
      <div className="rounded-xl mb-4 px-5 py-4" style={{ backgroundColor: colors.header }}>
        <div className="flex items-center gap-2 mb-1">
          <h2 className="text-base font-bold text-white">{theme.name}</h2>
        </div>
        {theme.tagline && <p className="text-xs text-white/75 mb-2">{theme.tagline}</p>}
        {(theme.sub_points || []).length > 0 && (
          <ul className="space-y-0.5">
            {theme.sub_points.map((sp, i) => (
              <li key={i} className="text-xs text-white/65 flex items-start gap-1.5">
                <span className="mt-1 w-1 h-1 rounded-full bg-white/50 shrink-0" />
                {sp}
              </li>
            ))}
          </ul>
        )}
        <div className="mt-3 pt-3 border-t border-white/20 flex items-center gap-2">
          <span className="text-xs font-semibold text-white">{approvedLinks.length} approved trends</span>
        </div>
      </div>

      {/* Trends by category */}
      {approvedLinks.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 px-5 py-8 text-center text-sm text-slate-400">
          No approved trends yet.<br />
          <span className="text-xs">Approve links in Theme Library.</span>
        </div>
      ) : (
        <div className="space-y-5">
          {categoryOrder.map(cat => (
            <div key={cat}>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: colors.accent }}>{CATEGORY_LABELS[cat] || cat}</span>
                <div className="flex-1 h-px" style={{ backgroundColor: colors.border }} />
              </div>
              <div className="space-y-2">
                {groupedByCategory[cat].map(({ trend, link }) => (
                  <TrendCascadeCard
                    key={link.id}
                    trend={trend}
                    challenges={(challenges || []).filter(c => c.global_trend_id === trend.id)}
                    recipes={recipes || []}
                    themeColors={colors}
                    isPrimary={link.is_primary}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ThemeMatrix() {
  const [year, setYear] = useState(2027);

  const { data: themes = [], isLoading: loadingThemes } = useQuery({
    queryKey: ['communicationThemes', year],
    queryFn: () => base44.entities.CommunicationTheme.filter({ year }),
  });

  const { data: allLinks = [], isLoading: loadingLinks } = useQuery({
    queryKey: ['themeLinks', year],
    queryFn: async () => {
      const yearThemes = await base44.entities.CommunicationTheme.filter({ year });
      if (!yearThemes.length) return [];
      const allResults = await Promise.all(yearThemes.map(t => base44.entities.ThemeLink.filter({ theme_id: t.id })));
      return allResults.flat();
    },
    enabled: themes.length > 0,
  });

  const { data: allTrends = [] } = useQuery({
    queryKey: ['globalTrends'],
    queryFn: () => base44.entities.GlobalTrend.filter({ is_active: true }),
  });

  const { data: allChallenges = [] } = useQuery({
    queryKey: ['industryChallenges'],
    queryFn: () => base44.entities.IndustryChallenge.list(),
  });

  const { data: allRecipes = [] } = useQuery({
    queryKey: ['recipes'],
    queryFn: () => base44.entities.Recipe.filter({ is_active: true, review_status: 'approved' }),
  });

  const trendMap = useMemo(() => Object.fromEntries(allTrends.map(t => [t.id, t])), [allTrends]);

  const sortedThemes = useMemo(() =>
    [...themes].sort((a, b) => (a.display_order || 99) - (b.display_order || 99)),
    [themes]
  );

  const isLoading = loadingThemes || loadingLinks;

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#F7F4EE' }}>
      <div className="px-4 md:px-8 py-8">

        {/* Header */}
        <div className="flex items-start justify-between mb-8 max-w-screen-2xl mx-auto">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: '#1D2B47' }}>Theme Matrix</h1>
            <p className="text-sm text-slate-500 mt-1">
              Annual communication themes with their approved trend cascade — theme → trend → challenge → concept.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <select
              value={year}
              onChange={e => setYear(Number(e.target.value))}
              className="border border-slate-200 bg-white rounded-lg px-3 py-2 text-sm font-semibold focus:outline-none"
              style={{ color: '#1D2B47' }}
            >
              {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-32">
            <div className="w-8 h-8 border-4 border-slate-200 border-t-blue-700 rounded-full animate-spin" />
          </div>
        ) : sortedThemes.length === 0 ? (
          <div className="text-center py-32 text-slate-400">No themes found for {year}.</div>
        ) : (
          <div
            className="grid gap-6 max-w-screen-2xl mx-auto"
            style={{ gridTemplateColumns: `repeat(${sortedThemes.length}, minmax(0, 1fr))` }}
          >
            {sortedThemes.map(theme => (
              <ThemeColumn
                key={theme.id}
                theme={theme}
                links={allLinks.filter(l => l.theme_id === theme.id)}
                trends={trendMap}
                challenges={allChallenges}
                recipes={allRecipes}
              />
            ))}
          </div>
        )}

        {/* Legend */}
        <div className="max-w-screen-2xl mx-auto mt-10 pt-6 border-t border-slate-200 flex flex-wrap gap-4 text-xs text-slate-400">
          <span className="font-semibold text-slate-500">Legend:</span>
          <span><span className="inline-block w-2 h-2 rounded-full bg-green-300 mr-1" />Recipe exists</span>
          <span><span className="inline-block w-2 h-2 rounded-full bg-amber-300 mr-1" />Concept needed</span>
          <span><span className="inline-block w-2 h-2 rounded-full bg-slate-300 mr-1" />Unmapped</span>
          <span className="ml-4">★ = Hero trend for theme</span>
          <span className="ml-4 italic">Expand a trend card to see challenges and recipes.</span>
        </div>
      </div>
    </div>
  );
}