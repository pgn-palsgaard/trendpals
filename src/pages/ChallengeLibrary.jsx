// DEPRECATED — replaced by TrendHub (per-trend) + ReviewQueue (cross-trend)
// Build D+E, 2026-06-22. Redirect route in App.jsx: /ChallengeLibrary → /ReviewQueue
// Safe to delete after confirming no imports reference this file.
import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Input } from '@/components/ui/input';
import { Search, Zap, ChevronDown, ChevronRight, Send } from 'lucide-react';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';
import ChallengeCard from '@/components/challenges/ChallengeCard';
import ChallengeDetailPanel from '@/components/challenges/ChallengeDetailPanel';
import DispatchPanel from '@/components/challenges/DispatchPanel';

const CATEGORIES = [
  { value: 'bakery', label: 'Bakery' },
  { value: 'condiments', label: 'Condiments' },
  { value: 'chocolate_confectionery', label: 'Confectionery' },
  { value: 'dairy', label: 'Dairy' },
  { value: 'ice_cream', label: 'Ice Cream' },
  { value: 'meat', label: 'Processed Meat' },
  { value: 'oils_fats', label: 'Oils & Fats' },
  { value: 'plant_based', label: 'Plant-based' },
  { value: 'rutf_rusf', label: 'RUTF/RUSF' },
  { value: 'needs_human_review', label: 'Needs Review' },
];

const TABS = [
  { key: 'pending', label: 'Awaiting review' },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Rejected' },
  { key: 'all', label: 'All' },
];

// Sort trends: zero-challenge first, then pending > approved > rejected, then alphabetical
function sortTrends(trends, challengesByTrend) {
  return [...trends].sort((a, b) => {
    const aGroup = challengesByTrend[a.id] || [];
    const bGroup = challengesByTrend[b.id] || [];
    const aCount = aGroup.length;
    const bCount = bGroup.length;

    // Zero challenges first (need attention)
    if (aCount === 0 && bCount > 0) return -1;
    if (bCount === 0 && aCount > 0) return 1;

    // Among trends with challenges: pending > others
    const aPending = aGroup.filter(c => c.review_status === 'pending').length;
    const bPending = bGroup.filter(c => c.review_status === 'pending').length;
    if (aPending !== bPending) return bPending - aPending;

    // Alphabetical by category then name
    if (a.category !== b.category) return (a.category || '').localeCompare(b.category || '');
    return (a.trend_name || '').localeCompare(b.trend_name || '');
  });
}

export default function ChallengeLibrary() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState('pending');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [search, setSearch] = useState('');
  const [selectedChallenge, setSelectedChallenge] = useState(null);
  const [proposingFor, setProposingFor] = useState(null);
  const [collapsedGroups, setCollapsedGroups] = useState({});
  const [selectedForDispatch, setSelectedForDispatch] = useState([]);
  const [showDispatchPanel, setShowDispatchPanel] = useState(false);

  const { data: challenges = [], isLoading: loadingChallenges } = useQuery({
    queryKey: ['industryChallenges'],
    queryFn: () => base44.entities.IndustryChallenge.list(),
  });

  const { data: allTrends = [], isLoading: loadingTrends } = useQuery({
    queryKey: ['globalTrends'],
    queryFn: () => base44.entities.GlobalTrend.list(),
  });

  // Only active trends
  const activeTrends = useMemo(() => allTrends.filter(t => t.is_active !== false), [allTrends]);

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.IndustryChallenge.update(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['industryChallenges'] }),
  });

  const handleApprove = async (challenge) => {
    await updateMutation.mutateAsync({ id: challenge.id, data: { review_status: 'approved', is_active: true, decision_pending: false } });
    if (selectedChallenge?.id === challenge.id) setSelectedChallenge({ ...selectedChallenge, review_status: 'approved', is_active: true });
    toast.success(`"${challenge.name}" approved`);
  };

  const handleReject = async (challenge) => {
    await updateMutation.mutateAsync({ id: challenge.id, data: { review_status: 'rejected', is_active: false, decision_pending: false } });
    if (selectedChallenge?.id === challenge.id) setSelectedChallenge({ ...selectedChallenge, review_status: 'rejected', is_active: false });
    toast.warning(`"${challenge.name}" rejected`);
  };

  const handleSaveValidation = async (challenge, validationPayload) => {
    const safePayload = {};
    if (validationPayload.validation_status) safePayload.validation_status = validationPayload.validation_status;
    if (validationPayload.validated_by !== undefined) safePayload.validated_by = validationPayload.validated_by;
    if (validationPayload.validated_date !== undefined) safePayload.validated_date = validationPayload.validated_date;
    await updateMutation.mutateAsync({ id: challenge.id, data: safePayload });
    queryClient.invalidateQueries({ queryKey: ['industryChallenges'] });
    toast.success('Market validation updated');
  };

  const handleProposeChallenges = async (trendId) => {
    setProposingFor(trendId);
    try {
      const res = await base44.functions.invoke('proposeChallengesForTrend', { global_trend_id: trendId });
      const data = res?.data;
      queryClient.invalidateQueries({ queryKey: ['industryChallenges'] });
      toast.success(`${data?.candidates_proposed || 0} new candidates proposed for "${data?.trend_name || 'trend'}"`);
    } catch (err) {
      toast.error(`Failed to propose challenges: ${err.message}`);
    } finally {
      setProposingFor(null);
    }
  };

  const toggleGroup = (trendId) => {
    setCollapsedGroups(prev => {
      const current = prev[trendId] === undefined ? true : prev[trendId];
      return { ...prev, [trendId]: !current };
    });
  };

  // All challenges grouped by trend (no tab/search filter — used for counts and sorting)
  const allChallengesByTrend = useMemo(() => {
    const map = {};
    challenges.forEach(c => {
      const tid = c.global_trend_id || '__unlinked__';
      if (!map[tid]) map[tid] = [];
      map[tid].push(c);
    });
    return map;
  }, [challenges]);

  // Challenges filtered by tab + search (for display inside each trend row)
  const filteredChallengesByTrend = useMemo(() => {
    const map = {};
    challenges.forEach(c => {
      if (tab === 'pending' && c.review_status !== 'pending') return;
      if (tab === 'approved' && c.review_status !== 'approved') return;
      if (tab === 'rejected' && c.review_status !== 'rejected') return;
      if (search) {
        const q = search.toLowerCase();
        if (!c.name?.toLowerCase().includes(q) && !c.description?.toLowerCase().includes(q)) return;
      }
      const tid = c.global_trend_id || '__unlinked__';
      if (!map[tid]) map[tid] = [];
      map[tid].push(c);
    });
    return map;
  }, [challenges, tab, search]);

  // Active trends filtered by category + search (search matches trend name OR any challenge name)
  const visibleTrends = useMemo(() => {
    let trends = activeTrends;

    if (categoryFilter) {
      trends = trends.filter(t => t.category === categoryFilter);
    }

    if (search) {
      const q = search.toLowerCase();
      trends = trends.filter(t => {
        // Match on trend name
        if (t.trend_name?.toLowerCase().includes(q)) return true;
        // Or has a challenge matching the search
        const tChallenges = allChallengesByTrend[t.id] || [];
        return tChallenges.some(c => c.name?.toLowerCase().includes(q) || c.description?.toLowerCase().includes(q));
      });
    }

    // Always include __unlinked__ group if it has challenges
    return trends;
  }, [activeTrends, categoryFilter, search, allChallengesByTrend]);

  const sortedTrends = useMemo(() => sortTrends(visibleTrends, allChallengesByTrend), [visibleTrends, allChallengesByTrend]);

  // Unlinked challenges (global_trend_id is null/undefined/__unlinked__)
  const unlinkedChallenges = useMemo(() => allChallengesByTrend['__unlinked__'] || [], [allChallengesByTrend]);

  // Coverage summary
  const trendsWithChallenges = useMemo(() => activeTrends.filter(t => (allChallengesByTrend[t.id] || []).length > 0).length, [activeTrends, allChallengesByTrend]);

  const totalFilteredChallenges = useMemo(() => {
    return Object.values(filteredChallengesByTrend).flat().length;
  }, [filteredChallengesByTrend]);

  const isLoading = loadingChallenges || loadingTrends;

  // Rows to render: sorted active trends + optionally the unlinked bucket
  const trendRows = useMemo(() => {
    const rows = [...sortedTrends];
    // Append unlinked bucket if it has matching challenges
    const unlinkedFiltered = filteredChallengesByTrend['__unlinked__'] || [];
    if (unlinkedChallenges.length > 0) {
      // Push a synthetic "unlinked" entry
      rows.push({ id: '__unlinked__', trend_name: 'Unlinked challenges', category: null, is_active: true, _synthetic: true });
    }
    return rows;
  }, [sortedTrends, unlinkedChallenges, filteredChallengesByTrend]);

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto px-4 md:px-6 py-8">
        {/* Header */}
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="font-heading text-2xl font-semibold text-foreground">Challenge library</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Review AI-proposed industry challenges derived from global trends. Approve or reject each, then separately set market-validation status.
            </p>
            {!isLoading && (
              <p className="text-xs text-muted-foreground mt-1.5">
                <span className="font-medium" style={{ color: trendsWithChallenges === activeTrends.length ? '#4A6040' : '#92600A' }}>
                  {trendsWithChallenges} of {activeTrends.length}
                </span>{' '}
                active trends have challenges
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Link
              to="/ValidationTracking"
              className="flex items-center gap-1.5 text-sm font-medium px-3 py-2 rounded-[8px] border border-border bg-card text-foreground hover:bg-muted transition-colors duration-150"
            >
              Validation tracking
            </Link>
            {selectedForDispatch.length > 0 && (
              <button
                onClick={() => setShowDispatchPanel(true)}
                className="flex items-center gap-1.5 text-sm font-semibold px-4 py-2 rounded-lg text-white transition-all"
                style={{ background: '#1D428A' }}
              >
                <Send className="w-4 h-4" />
                Dispatch {selectedForDispatch.length} for review
              </button>
            )}
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col md:flex-row md:items-center gap-3 mb-6">
          <div className="flex items-center bg-card border border-border rounded-[8px] p-1 gap-0.5 shrink-0">
            {TABS.map(t => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className="px-3 py-1.5 rounded-[6px] text-xs font-medium transition-colors duration-150 cursor-pointer"
                style={{ background: tab === t.key ? '#1D428A' : 'transparent', color: tab === t.key ? '#fff' : 'hsl(var(--muted-foreground))' }}
              >
                {t.label}
              </button>
            ))}
          </div>

          <select
            value={categoryFilter}
            onChange={e => setCategoryFilter(e.target.value)}
            className="border border-border bg-card rounded-[8px] px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-[#1D428A]/40"
          >
            <option value="">All categories</option>
            {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>

          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search by trend name or challenge…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          <span className="text-sm text-muted-foreground shrink-0">
            <span className="font-medium text-foreground">{sortedTrends.length}</span> trends ·{' '}
            <span className="font-medium text-foreground">{totalFilteredChallenges}</span> challenges
          </span>
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="flex items-center justify-center py-24">
            <div className="w-8 h-8 border-4 border-muted border-t-[#1D428A] rounded-full animate-spin" />
          </div>
        ) : trendRows.length === 0 ? (
          <div className="text-center py-24 text-muted-foreground">
            <p className="text-base font-medium">No trends found</p>
            <p className="text-sm mt-1">Try adjusting the category filter or search.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {trendRows.map(trend => {
              const trendId = trend.id;
              const allGroup = allChallengesByTrend[trendId] || [];
              const filteredGroup = filteredChallengesByTrend[trendId] || [];
              // undefined = not yet toggled = default collapsed (true)
              const isCollapsed = collapsedGroups[trendId] === undefined ? true : collapsedGroups[trendId];
              const isProposing = proposingFor === trendId;
              const pendingCount = allGroup.filter(c => c.review_status === 'pending').length;
              const hasNoChallenges = allGroup.length === 0;

              return (
                <div key={trendId} className="bg-card border border-border rounded-[10px] overflow-hidden" style={{ boxShadow: '0 1px 4px 0 rgba(29,43,71,0.06)' }}>
                  {/* Group header */}
                  <div
                    className="flex items-center justify-between px-5 py-3 cursor-pointer hover:bg-muted/50 transition-colors duration-150"
                    style={{ borderBottom: !isCollapsed ? '1px solid hsl(var(--border))' : 'none' }}
                    onClick={() => toggleGroup(trendId)}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {isCollapsed ? <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />}
                      <div className="min-w-0">
                        <span className="font-semibold text-sm text-foreground truncate">
                          {trend.trend_name || 'Unnamed trend'}
                        </span>
                        {trend.category && (
                          <span className="ml-2 text-xs text-muted-foreground capitalize">{trend.category.replace(/_/g, ' ')}</span>
                        )}
                      </div>
                      {/* Challenge count badge */}
                      <span
                        className="shrink-0 text-xs px-2 py-0.5 rounded-full font-medium"
                        style={
                          hasNoChallenges
                            ? { background: '#FAE9E5', color: '#A33B24' }
                            : pendingCount > 0
                            ? { background: '#FEF3C7', color: '#92600A' }
                            : { background: 'hsl(var(--muted))', color: 'hsl(var(--muted-foreground))' }
                        }
                      >
                        {allGroup.length}
                      </span>
                    </div>

                    {/* Propose button — shown for all non-synthetic trends */}
                    {!trend._synthetic && (
                      <button
                        onClick={e => { e.stopPropagation(); handleProposeChallenges(trendId); }}
                        disabled={isProposing}
                        className="ml-3 shrink-0 flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-[7px] border transition-colors duration-150 disabled:opacity-50 cursor-pointer"
                        style={{ color: '#1D428A', borderColor: '#1D428A', background: 'transparent' }}
                        onMouseEnter={e => { e.currentTarget.style.background = '#EBF0F8'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                      >
                        {isProposing ? (
                          <div className="w-3 h-3 border-2 border-[#1D428A] border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <Zap className="w-3 h-3" />
                        )}
                        {isProposing ? 'Proposing…' : 'Propose new candidates'}
                      </button>
                    )}
                  </div>

                  {/* Challenges body */}
                  {!isCollapsed && (
                    <div>
                      {filteredGroup.length === 0 ? (
                        <div className="px-5 py-6 text-center text-sm text-muted-foreground">
                          {hasNoChallenges
                            ? 'No challenges yet — propose candidates to get started.'
                            : 'No challenges match the current tab filter for this trend.'}
                        </div>
                      ) : (
                        <div className="divide-y divide-border">
                          {filteredGroup.map(challenge => (
                            <div key={challenge.id} className="flex items-start">
                              {challenge.review_status === 'approved' && (
                                <label className="pl-4 pt-4 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    className="rounded"
                                    checked={selectedForDispatch.some(c => c.id === challenge.id)}
                                    onChange={e => {
                                      setSelectedForDispatch(prev =>
                                        e.target.checked
                                          ? [...prev, challenge]
                                          : prev.filter(c => c.id !== challenge.id)
                                      );
                                    }}
                                  />
                                </label>
                              )}
                              <div className="flex-1">
                                <ChallengeCard
                                  challenge={challenge}
                                  onApprove={handleApprove}
                                  onReject={handleReject}
                                  onViewDetails={setSelectedChallenge}
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {selectedChallenge && (
        <ChallengeDetailPanel
          challenge={selectedChallenge}
          onClose={() => setSelectedChallenge(null)}
          onApprove={handleApprove}
          onReject={handleReject}
          onSaveValidation={handleSaveValidation}
        />
      )}

      {showDispatchPanel && (
        <DispatchPanel
          selectedChallenges={selectedForDispatch}
          allChallenges={challenges}
          onClose={() => { setShowDispatchPanel(false); setSelectedForDispatch([]); }}
        />
      )}
    </div>
  );
}