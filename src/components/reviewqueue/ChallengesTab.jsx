import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import ChallengeCard from '@/components/challenges/ChallengeCard';
import ChallengeDetailPanel from '@/components/challenges/ChallengeDetailPanel';

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
];

const STATUS_TABS = [
  { key: 'pending', label: 'Pending' },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Rejected' },
  { key: 'all', label: 'All' },
];

export default function ChallengesTab({ challenges, trends }) {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState('pending');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [selectedChallenge, setSelectedChallenge] = useState(null);

  const trendMap = useMemo(() => Object.fromEntries(trends.map(t => [t.id, t])), [trends]);

  const mutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.IndustryChallenge.update(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['allIndustryChallenges'] }),
  });

  const handleApprove = async (challenge) => {
    await mutation.mutateAsync({ id: challenge.id, data: { review_status: 'approved', is_active: true, decision_pending: false } });
    if (selectedChallenge?.id === challenge.id) setSelectedChallenge({ ...selectedChallenge, review_status: 'approved', is_active: true });
    toast.success(`"${challenge.name}" approved`);
  };

  const handleReject = async (challenge) => {
    await mutation.mutateAsync({ id: challenge.id, data: { review_status: 'rejected', is_active: false, decision_pending: false } });
    if (selectedChallenge?.id === challenge.id) setSelectedChallenge({ ...selectedChallenge, review_status: 'rejected', is_active: false });
    toast.warning(`"${challenge.name}" rejected`);
  };

  const handleSaveValidation = async (challenge, validationPayload) => {
    const safePayload = {};
    if (validationPayload.validation_status) safePayload.validation_status = validationPayload.validation_status;
    if (validationPayload.validated_by !== undefined) safePayload.validated_by = validationPayload.validated_by;
    if (validationPayload.validated_date !== undefined) safePayload.validated_date = validationPayload.validated_date;
    await mutation.mutateAsync({ id: challenge.id, data: safePayload });
    queryClient.invalidateQueries({ queryKey: ['allIndustryChallenges'] });
    toast.success('Market validation updated');
  };

  const filtered = useMemo(() => {
    return challenges.filter(c => {
      if (statusFilter !== 'all' && c.review_status !== statusFilter) return false;
      if (categoryFilter && c.category !== categoryFilter) return false;
      return true;
    });
  }, [challenges, statusFilter, categoryFilter]);

  // Group by trend
  const grouped = useMemo(() => {
    const map = {};
    filtered.forEach(c => {
      const trendId = c.global_trend_id || '__unlinked__';
      if (!map[trendId]) map[trendId] = [];
      map[trendId].push(c);
    });
    return map;
  }, [filtered]);

  const trendIds = Object.keys(grouped);

  return (
    <div>
      {/* Filter bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', background: '#e8e3d8', borderRadius: 10, padding: 4, gap: 2 }}>
          {STATUS_TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setStatusFilter(t.key)}
              style={{
                padding: '5px 14px', borderRadius: 7, fontSize: 13, fontWeight: 500,
                background: statusFilter === t.key ? '#1D428A' : 'transparent',
                color: statusFilter === t.key ? '#fff' : '#1D2B47',
                border: 'none', cursor: 'pointer',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
        <select
          value={categoryFilter}
          onChange={e => setCategoryFilter(e.target.value)}
          style={{
            border: '1px solid hsl(var(--border))', background: 'hsl(var(--card))',
            borderRadius: 8, padding: '6px 10px', fontSize: 13, color: '#1D2B47',
          }}
        >
          <option value="">All categories</option>
          {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
      </div>

      {/* Groups */}
      {trendIds.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 0', color: 'hsl(var(--muted-foreground))', fontSize: 14 }}>
          No {statusFilter === 'all' ? '' : statusFilter} challenges
          {categoryFilter ? ` in ${CATEGORIES.find(c => c.value === categoryFilter)?.label}` : ' across any trend'}.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {trendIds.map(trendId => {
            const trend = trendMap[trendId];
            const group = grouped[trendId];
            return (
              <div key={trendId} style={{
                background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))',
                borderRadius: 10, overflow: 'hidden',
                boxShadow: '0 1px 4px 0 rgba(29,43,71,0.06)',
              }}>
                {/* Group header */}
                <div style={{
                  padding: '10px 20px', borderBottom: '1px solid hsl(var(--border))',
                  display: 'flex', alignItems: 'center', gap: 8,
                  background: 'hsl(var(--muted)/0.4)',
                }}>
                  {trend ? (
                    <Link
                      to={`/TrendHub/${trendId}`}
                      style={{ fontWeight: 600, fontSize: 13, color: '#1D428A', textDecoration: 'none' }}
                      onMouseEnter={e => e.currentTarget.style.textDecoration = 'underline'}
                      onMouseLeave={e => e.currentTarget.style.textDecoration = 'none'}
                    >
                      {trend.trend_name}
                    </Link>
                  ) : (
                    <span style={{ fontWeight: 600, fontSize: 13, color: '#1D2B47' }}>Unlinked challenges</span>
                  )}
                  {trend?.category && (
                    <span style={{
                      fontSize: 11, padding: '1px 7px', borderRadius: 9999,
                      background: 'hsl(var(--muted))', color: 'hsl(var(--muted-foreground))',
                      textTransform: 'capitalize',
                    }}>
                      {trend.category.replace(/_/g, ' ')}
                    </span>
                  )}
                  <span style={{
                    fontSize: 11, padding: '1px 7px', borderRadius: 9999,
                    background: '#EBF0F8', color: '#1D428A', fontWeight: 600,
                    marginLeft: 'auto',
                  }}>
                    {group.length}
                  </span>
                </div>
                {/* Challenge cards */}
                <div style={{ divideY: '1px solid hsl(var(--border))' }}>
                  {group.map((challenge, i) => (
                    <div key={challenge.id} style={{ borderTop: i > 0 ? '1px solid hsl(var(--border))' : 'none' }}>
                      <ChallengeCard
                        challenge={challenge}
                        onApprove={handleApprove}
                        onReject={handleReject}
                        onViewDetails={setSelectedChallenge}
                      />
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {selectedChallenge && (
        <ChallengeDetailPanel
          challenge={selectedChallenge}
          onClose={() => setSelectedChallenge(null)}
          onApprove={handleApprove}
          onReject={handleReject}
          onSaveValidation={handleSaveValidation}
        />
      )}
    </div>
  );
}