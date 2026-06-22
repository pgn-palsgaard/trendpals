import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import ChallengesTab from '@/components/reviewqueue/ChallengesTab';
import SourcesTab from '@/components/reviewqueue/SourcesTab';
import ValidationsTab from '@/components/reviewqueue/ValidationsTab';

const TABS = [
  { key: 'challenges', label: 'Challenges' },
  { key: 'sources',    label: 'Sources' },
  { key: 'validations', label: 'Validations' },
];

export default function ReviewQueue() {
  const [activeTab, setActiveTab] = useState('challenges');

  // ── Data fetching — all on mount, tabs filter client-side ──
  const { data: challenges = [], isLoading: loadingChallenges } = useQuery({
    queryKey: ['allIndustryChallenges'],
    queryFn: () => base44.entities.IndustryChallenge.filter({}, '-created_date', 500),
  });

  const { data: trends = [], isLoading: loadingTrends } = useQuery({
    queryKey: ['globalTrends'],
    queryFn: () => base44.entities.GlobalTrend.filter({}, 'trend_name', 200),
  });

  const { data: sources = [], isLoading: loadingSources } = useQuery({
    queryKey: ['allSources'],
    queryFn: () => base44.entities.Source.filter({}, '-created_date', 200),
  });

  const { data: assignments = [], isLoading: loadingAssignments } = useQuery({
    queryKey: ['allReviewAssignments'],
    queryFn: () => base44.entities.ReviewAssignment.list('-created_date', 500),
  });

  const isLoading = loadingChallenges || loadingTrends || loadingSources || loadingAssignments;

  // ── Pending counts for tab badges ──
  const pendingChallenges = useMemo(
    () => challenges.filter(c => c.review_status === 'pending').length,
    [challenges]
  );
  const pendingSources = useMemo(
    () => sources.filter(s => s.review_status === 'pending').length,
    [sources]
  );
  const pendingValidations = useMemo(
    () => assignments.filter(a => a.status !== 'responded').length,
    [assignments]
  );

  const badgeCount = { challenges: pendingChallenges, sources: pendingSources, validations: pendingValidations };

  return (
    <div style={{ minHeight: '100vh', background: 'hsl(var(--background))' }}>
      <div style={{ maxWidth: 960, margin: '0 auto', padding: '24px 24px 64px' }}>

        {/* Page header */}
        <div style={{ marginBottom: 24 }}>
          <h1 style={{
            fontFamily: 'Lora, Georgia, serif',
            fontSize: 28, fontWeight: 600, color: '#1D2B47',
            letterSpacing: '-0.02em', lineHeight: 1.25, margin: '0 0 4px',
          }}>
            Review queue
          </h1>
          <p style={{ fontSize: 14, color: 'hsl(var(--muted-foreground))', margin: 0 }}>
            Cross-trend triage — approve, verify, and track across all trends.
          </p>
        </div>

        {/* Tab bar */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 24, background: '#e8e3d8', borderRadius: 12, padding: 4 }}>
          {TABS.map(tab => {
            const count = badgeCount[tab.key];
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                style={{
                  flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  padding: '8px 16px', borderRadius: 9, fontSize: 14, fontWeight: 500,
                  border: 'none', cursor: 'pointer',
                  background: isActive ? '#1D428A' : 'transparent',
                  color: isActive ? '#fff' : '#1D2B47',
                  transition: 'background 0.15s, color 0.15s',
                }}
              >
                {tab.label}
                {count > 0 && (
                  <span style={{
                    fontSize: 11, fontWeight: 700, minWidth: 18, height: 18,
                    borderRadius: 9999, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    padding: '0 5px',
                    background: isActive ? 'rgba(255,255,255,0.25)' : '#C15338',
                    color: isActive ? '#fff' : '#fff',
                  }}>
                    {count > 99 ? '99+' : count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Content */}
        {isLoading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '80px 0' }}>
            <div className="w-8 h-8 border-4 border-slate-200 border-t-[#1D428A] rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {activeTab === 'challenges' && (
              <ChallengesTab challenges={challenges} trends={trends} />
            )}
            {activeTab === 'sources' && (
              <SourcesTab sources={sources} />
            )}
            {activeTab === 'validations' && (
              <ValidationsTab
                challenges={challenges}
                assignments={assignments}
                trends={trends}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}