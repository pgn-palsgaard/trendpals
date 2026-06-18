import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Input } from '@/components/ui/input';
import { Search, Zap, CheckCircle, XCircle, Clock, AlertTriangle, ChevronDown, ChevronRight, Send } from 'lucide-react';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';
import ChallengeCard from '@/components/challenges/ChallengeCard';
import ChallengeDetailPanel from '@/components/challenges/ChallengeDetailPanel';
import DispatchPanel from '@/components/challenges/DispatchPanel';

const CATEGORIES = [
  { value: 'bakery', label: 'Bakery' },
  { value: 'condiments', label: 'Condiments' },
  { value: 'chocolate_confectionery', label: 'Chocolate & Confectionery' },
  { value: 'dairy', label: 'Dairy' },
  { value: 'ice_cream', label: 'Ice Cream' },
  { value: 'meat', label: 'Processed Meat' },
  { value: 'oils_fats', label: 'Oils & Fats' },
  { value: 'plant_based', label: 'Plant-based' },
  { value: 'rutf_rusf', label: 'RUTF/RUSF' },
  { value: 'needs_human_review', label: 'Needs Review' },
];

const TABS = [
  { key: 'pending', label: 'Awaiting Review' },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Rejected' },
  { key: 'all', label: 'All' },
];

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

  const { data: trends = [] } = useQuery({
    queryKey: ['globalTrends'],
    queryFn: () => base44.entities.GlobalTrend.list(),
  });

  const trendMap = useMemo(() => Object.fromEntries(trends.map(t => [t.id, t])), [trends]);

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

  // HUMAN-ONLY: market validation fields
  const handleSaveValidation = async (challenge, validationPayload) => {
    // Only allow validation_status, validated_by, validated_date
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

  const filtered = useMemo(() => {
    return challenges.filter(c => {
      if (tab === 'pending' && c.review_status !== 'pending') return false;
      if (tab === 'approved' && c.review_status !== 'approved') return false;
      if (tab === 'rejected' && c.review_status !== 'rejected') return false;
      if (categoryFilter && c.category !== categoryFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!c.name?.toLowerCase().includes(q) && !c.description?.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [challenges, tab, categoryFilter, search]);

  // Group by parent GlobalTrend
  const grouped = useMemo(() => {
    const map = {};
    filtered.forEach(c => {
      const tid = c.global_trend_id || '__unlinked__';
      if (!map[tid]) map[tid] = [];
      map[tid].push(c);
    });
    return map;
  }, [filtered]);

  const groupKeys = Object.keys(grouped);

  const toggleGroup = (trendId) => {
    setCollapsedGroups(prev => ({ ...prev, [trendId]: !prev[trendId] }));
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto px-4 md:px-6 py-8">
        {/* Header */}
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="font-heading text-2xl font-semibold text-foreground">Challenge library</h1>
            <p className="text-sm text-slate-500 mt-1">Review AI-proposed industry challenges derived from GlobalTrends. Approve or reject each, then separately set market-validation status.</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Link
              to="/ValidationTracking"
              className="flex items-center gap-1.5 text-sm font-medium px-3 py-2 rounded-[8px] border border-border bg-card text-foreground hover:bg-muted transition-colors duration-150"
            >
              Validation Tracking
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
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              placeholder="Search by name or description…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9 bg-white"
            />
          </div>

          <span className="text-sm text-slate-500 shrink-0">
            <span className="font-medium text-slate-700">{filtered.length}</span> challenges
          </span>
        </div>

        {/* Content */}
        {loadingChallenges ? (
          <div className="flex items-center justify-center py-24">
            <div className="w-8 h-8 border-4 border-slate-200 border-t-blue-700 rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-24 text-slate-400">
            <p className="text-lg font-medium">No challenges found</p>
            <p className="text-sm mt-1">Try adjusting filters, or propose new candidates from a trend below.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {groupKeys.map(trendId => {
              const trend = trendMap[trendId];
              const group = grouped[trendId];
              const isCollapsed = collapsedGroups[trendId];
              const isProposing = proposingFor === trendId;

              return (
                <div key={trendId} className="bg-card border border-border rounded-[10px] overflow-hidden" style={{ boxShadow: '0 1px 4px 0 rgba(29,43,71,0.06)' }}>
                  {/* Group header */}
                  <div
                    className="flex items-center justify-between px-5 py-3 cursor-pointer hover:bg-muted/50 transition-colors duration-150"
                    style={{ borderBottom: '1px solid hsl(var(--border))' }}
                    onClick={() => toggleGroup(trendId)}
                  >
                    <div className="flex items-center gap-3">
                      {isCollapsed ? <ChevronRight className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                      <div>
                        <span className="font-semibold text-sm text-foreground">
                          {trend?.trend_name || 'Unlinked trend'}
                        </span>
                        {trend?.category && (
                          <span className="ml-2 text-xs text-slate-400 capitalize">{trend.category.replace(/_/g, ' ')}</span>
                        )}
                      </div>
                      <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">{group.length}</span>
                    </div>

                    {trend && (
                      <button
                        onClick={e => { e.stopPropagation(); handleProposeChallenges(trendId); }}
                        disabled={isProposing}
                        className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors disabled:opacity-50"
                        style={{ color: '#1D428A', borderColor: '#1D428A', backgroundColor: 'transparent' }}
                        onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#f0f4ff'; }}
                        onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                      >
                        {isProposing ? (
                          <div className="w-3 h-3 border-2 border-blue-700 border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <Zap className="w-3 h-3" />
                        )}
                        {isProposing ? 'Proposing…' : 'Propose new candidates'}
                      </button>
                    )}
                  </div>

                  {/* Challenges */}
                  {!isCollapsed && (
                    <div className="divide-y divide-slate-100">
                      {group.map(challenge => (
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