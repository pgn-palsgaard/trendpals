import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Zap, CheckCircle, XCircle, Clock, Star, ChevronDown, ChevronRight, Eye } from 'lucide-react';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import ThemeLinkReviewRow from '@/components/themes/ThemeLinkReviewRow';
import UnlinkedTrendsPanel from '@/components/themes/UnlinkedTrendsPanel';

const THEME_COLORS = {
  sage:      { bg: '#6F8263', light: '#f0f4ee', border: '#c5d1be', text: '#fff', dark: '#3d4a38' },
  chocolate: { bg: '#59361F', light: '#f4efe9', border: '#c8b09a', text: '#fff', dark: '#3a220f' },
  blue:      { bg: '#1D428A', light: '#edf1f9', border: '#a8bcde', text: '#fff', dark: '#132d5e' },
};

const YEARS = [2027, 2028, 2026];

export default function ThemeLibrary() {
  const queryClient = useQueryClient();
  const [year, setYear] = useState(2027);
  const [proposingFor, setProposingFor] = useState(null);
  const [expandedTheme, setExpandedTheme] = useState(null);
  const [showUnlinked, setShowUnlinked] = useState(false);
  const [decidedByInput, setDecidedByInput] = useState({});

  const { data: themes = [], isLoading: loadingThemes } = useQuery({
    queryKey: ['communicationThemes', year],
    queryFn: () => base44.entities.CommunicationTheme.filter({ year }),
  });

  const { data: allLinks = [] } = useQuery({
    queryKey: ['themeLinks', year],
    queryFn: async () => {
      const yearThemes = await base44.entities.CommunicationTheme.filter({ year });
      const themeIds = yearThemes.map(t => t.id);
      if (!themeIds.length) return [];
      const allResults = await Promise.all(themeIds.map(id => base44.entities.ThemeLink.filter({ theme_id: id })));
      return allResults.flat();
    },
    enabled: themes.length > 0,
  });

  const { data: allTrends = [] } = useQuery({
    queryKey: ['globalTrends'],
    queryFn: () => base44.entities.GlobalTrend.filter({ is_active: true }),
  });

  const trendMap = useMemo(() => Object.fromEntries(allTrends.map(t => [t.id, t])), [allTrends]);

  const linkUpdateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.ThemeLink.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['themeLinks', year] });
    },
  });

  const handleApprove = async (link) => {
    const by = decidedByInput[link.id] || '';
    const payload = {
      link_status: 'approved',
      decided_by: by || undefined,
      decided_at: new Date().toISOString(),
    };
    if (!by) delete payload.decided_by;
    await linkUpdateMutation.mutateAsync({ id: link.id, data: payload });
    toast.success('Link approved');
  };

  const handleReject = async (link) => {
    const by = decidedByInput[link.id] || '';
    const payload = {
      link_status: 'rejected',
      decided_by: by || undefined,
      decided_at: new Date().toISOString(),
    };
    if (!by) delete payload.decided_by;
    await linkUpdateMutation.mutateAsync({ id: link.id, data: payload });
    toast.warning('Link rejected');
  };

  const handleTogglePrimary = async (link) => {
    await linkUpdateMutation.mutateAsync({ id: link.id, data: { is_primary: !link.is_primary } });
  };

  const handlePropose = async (themeId) => {
    setProposingFor(themeId);
    try {
      const res = await base44.functions.invoke('proposeThemeLinks', { theme_id: themeId });
      const data = res?.data;
      queryClient.invalidateQueries({ queryKey: ['themeLinks', year] });
      toast.success(`${data?.links_proposed || 0} new links proposed for "${data?.theme_name}"`);
    } catch (err) {
      toast.error(`Failed: ${err.message}`);
    } finally {
      setProposingFor(null);
    }
  };

  const sortedThemes = useMemo(() =>
    [...themes].sort((a, b) => (a.display_order || 99) - (b.display_order || 99)),
    [themes]
  );

  // Linked trend IDs across all themes for this year
  const linkedTrendIds = useMemo(() => new Set(allLinks.map(l => l.global_trend_id)), [allLinks]);

  const unlinkedTrends = useMemo(() =>
    allTrends.filter(t => !linkedTrendIds.has(t.id)),
    [allTrends, linkedTrendIds]
  );

  if (loadingThemes) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-blue-700 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#F7F4EE' }}>
      <div className="max-w-6xl mx-auto px-4 md:px-6 py-8">

        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: '#1D2B47' }}>Theme Library</h1>
            <p className="text-sm text-slate-500 mt-1">Curate GlobalTrends under annual communication themes. Proposals are system-generated; only humans approve.</p>
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

        {/* Theme cards */}
        {sortedThemes.length === 0 ? (
          <div className="text-center py-24 text-slate-400">No themes found for {year}.</div>
        ) : (
          <div className="space-y-5">
            {sortedThemes.map(theme => {
              const colors = THEME_COLORS[theme.color_key] || THEME_COLORS.blue;
              const themeLinks = allLinks.filter(l => l.theme_id === theme.id);
              const proposed = themeLinks.filter(l => l.link_status === 'proposed');
              const approved = themeLinks.filter(l => l.link_status === 'approved');
              const rejected = themeLinks.filter(l => l.link_status === 'rejected');
              const isExpanded = expandedTheme === theme.id;
              const isProposing = proposingFor === theme.id;

              return (
                <div key={theme.id} className="rounded-2xl overflow-hidden shadow-sm border border-slate-200">
                  {/* Theme header band */}
                  <div style={{ backgroundColor: colors.bg }} className="px-6 py-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-1">
                          <h2 className="text-lg font-bold text-white">{theme.name}</h2>
                          <span className="text-xs font-medium px-2 py-0.5 rounded-full text-white" style={{ backgroundColor: 'rgba(255,255,255,0.2)' }}>
                            {approved.length} approved · {proposed.length} proposed
                          </span>
                        </div>
                        {theme.tagline && <p className="text-sm text-white/80 mb-3">{theme.tagline}</p>}
                        {(theme.sub_points || []).length > 0 && (
                          <ul className="space-y-1">
                            {theme.sub_points.map((sp, i) => (
                              <li key={i} className="flex items-start gap-2 text-xs text-white/75">
                                <span className="mt-1 w-1 h-1 rounded-full bg-white/60 shrink-0" />
                                {sp}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => handlePropose(theme.id)}
                          disabled={isProposing}
                          className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg transition-colors disabled:opacity-50 text-white border border-white/30"
                          style={{ backgroundColor: 'rgba(255,255,255,0.15)' }}
                        >
                          {isProposing
                            ? <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            : <Zap className="w-3 h-3" />}
                          {isProposing ? 'Proposing…' : 'Propose links'}
                        </button>
                        <button
                          onClick={() => setExpandedTheme(isExpanded ? null : theme.id)}
                          className="p-2 rounded-lg text-white/70 hover:text-white transition-colors"
                          style={{ backgroundColor: 'rgba(255,255,255,0.1)' }}
                        >
                          {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Expanded link review */}
                  {isExpanded && (
                    <div className="bg-white">
                      {themeLinks.length === 0 ? (
                        <div className="px-6 py-8 text-center text-sm text-slate-400">
                          No links yet — click "Propose links" to generate candidates.
                        </div>
                      ) : (
                        <div>
                          {/* Proposed */}
                          {proposed.length > 0 && (
                            <div>
                              <div className="px-6 py-2 bg-amber-50 border-b border-amber-100">
                                <span className="text-xs font-semibold text-amber-700 uppercase tracking-wider">Awaiting review — {proposed.length}</span>
                              </div>
                              <div className="divide-y divide-slate-100">
                                {proposed.sort((a,b) => (b.relevance_score||0) - (a.relevance_score||0)).map(link => (
                                  <ThemeLinkReviewRow
                                    key={link.id}
                                    link={link}
                                    trend={trendMap[link.global_trend_id]}
                                    onApprove={handleApprove}
                                    onReject={handleReject}
                                    onTogglePrimary={handleTogglePrimary}
                                    decidedBy={decidedByInput[link.id] || ''}
                                    onDecidedByChange={val => setDecidedByInput(prev => ({ ...prev, [link.id]: val }))}
                                    themeColor={colors.bg}
                                  />
                                ))}
                              </div>
                            </div>
                          )}
                          {/* Approved */}
                          {approved.length > 0 && (
                            <div>
                              <div className="px-6 py-2 border-b border-slate-100" style={{ backgroundColor: '#f0f4ee' }}>
                                <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#3d4a38' }}>Approved — {approved.length}</span>
                              </div>
                              <div className="divide-y divide-slate-100">
                                {approved.map(link => (
                                  <ThemeLinkReviewRow
                                    key={link.id}
                                    link={link}
                                    trend={trendMap[link.global_trend_id]}
                                    onApprove={handleApprove}
                                    onReject={handleReject}
                                    onTogglePrimary={handleTogglePrimary}
                                    decidedBy={decidedByInput[link.id] || ''}
                                    onDecidedByChange={val => setDecidedByInput(prev => ({ ...prev, [link.id]: val }))}
                                    themeColor={colors.bg}
                                  />
                                ))}
                              </div>
                            </div>
                          )}
                          {/* Rejected */}
                          {rejected.length > 0 && (
                            <div>
                              <div className="px-6 py-2 bg-slate-50 border-b border-slate-100">
                                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Rejected — {rejected.length}</span>
                              </div>
                              <div className="divide-y divide-slate-100 opacity-60">
                                {rejected.map(link => (
                                  <ThemeLinkReviewRow
                                    key={link.id}
                                    link={link}
                                    trend={trendMap[link.global_trend_id]}
                                    onApprove={handleApprove}
                                    onReject={handleReject}
                                    onTogglePrimary={handleTogglePrimary}
                                    decidedBy={decidedByInput[link.id] || ''}
                                    onDecidedByChange={val => setDecidedByInput(prev => ({ ...prev, [link.id]: val }))}
                                    themeColor={colors.bg}
                                  />
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Unlinked trends */}
        <div className="mt-8">
          <button
            onClick={() => setShowUnlinked(!showUnlinked)}
            className="flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-slate-700 transition-colors mb-3"
          >
            {showUnlinked ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            Unlinked Trends ({unlinkedTrends.length})
            <span className="text-xs font-normal text-slate-400">— active trends not yet linked to any {year} theme</span>
          </button>
          {showUnlinked && <UnlinkedTrendsPanel trends={unlinkedTrends} />}
        </div>
      </div>
    </div>
  );
}