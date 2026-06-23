import React, { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { ArrowLeft, Pencil, CheckCircle, XCircle, Trash2, Zap, ChevronRight, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import TrendEditModal from '@/components/trendlibrary/TrendEditModal';
import ChallengeCard from '@/components/challenges/ChallengeCard';
import ChallengeDetailPanel from '@/components/challenges/ChallengeDetailPanel';
import DispatchPanel from '@/components/challenges/DispatchPanel';
import TrendReportSections from '@/components/trendreport/TrendReportSections';
import ValidationSummary from '@/components/trendhub/ValidationSummary';
import RegionalEvidence from '@/components/trendhub/RegionalEvidence';
import { COMMERCIAL_REGIONS } from '@/lib/regions';

// ── Section wrapper ──────────────────────────────────────────
function Section({ title, count, countColor, action, children }) {
  return (
    <div style={{
      background: 'hsl(var(--card))',
      border: '1px solid hsl(var(--border))',
      borderRadius: 10,
      boxShadow: '0 1px 4px 0 rgba(29,43,71,0.06)',
      overflow: 'hidden',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 20px',
        borderBottom: '1px solid hsl(var(--border))',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <h2 style={{ fontSize: 14, fontWeight: 600, color: '#1D2B47', margin: 0 }}>{title}</h2>
          {count !== undefined && (
            <span style={{
              fontSize: 11, fontWeight: 600, padding: '1px 7px', borderRadius: 9999,
              background: countColor || 'hsl(var(--muted))',
              color: countColor ? '#fff' : 'hsl(var(--muted-foreground))',
            }}>
              {count}
            </span>
          )}
        </div>
        {action}
      </div>
      <div style={{ padding: '16px 20px' }}>{children}</div>
    </div>
  );
}

// ── Label + value row ───────────────────────────────────────
function InfoRow({ label, children }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <p style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'hsl(var(--muted-foreground))', marginBottom: 4 }}>
        {label}
      </p>
      <div style={{ fontSize: 14, color: '#1D2B47', lineHeight: 1.6 }}>{children}</div>
    </div>
  );
}

// ── Status chip helper ──────────────────────────────────────
function Chip({ children, bg, color, border }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      padding: '3px 10px', borderRadius: 9999,
      fontSize: 12, fontWeight: 500,
      background: bg || 'hsl(var(--muted))',
      color: color || 'hsl(var(--muted-foreground))',
      border: `1px solid ${border || 'hsl(var(--border))'}`,
    }}>
      {children}
    </span>
  );
}

export default function TrendHub() {
  const { trendId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // ── Local state ──────────────────────────────────────────
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [selectedChallenge, setSelectedChallenge] = useState(null);
  const [proposing, setProposing] = useState(false);
  const [showDispatch, setShowDispatch] = useState(false);
  const [selectedForDispatch, setSelectedForDispatch] = useState([]);
  const [reportData, setReportData] = useState(null);
  const [generatingReport, setGeneratingReport] = useState(false);
  const [reportError, setReportError] = useState(null);
  const [reportRegion, setReportRegion] = useState('all');
  const [showRejectedSources, setShowRejectedSources] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // ── Queries ──────────────────────────────────────────────
  const { data: trend, isLoading: loadingTrend } = useQuery({
    queryKey: ['globalTrend', trendId],
    queryFn: () => base44.entities.GlobalTrend.get(trendId),
    enabled: !!trendId,
  });

  const { data: challenges = [], isLoading: loadingChallenges } = useQuery({
    queryKey: ['industryChallenges', trendId],
    queryFn: () => base44.entities.IndustryChallenge.filter({ global_trend_id: trendId }),
    enabled: !!trendId,
  });

  const { data: allAssignments = [] } = useQuery({
    queryKey: ['reviewAssignments'],
    queryFn: () => base44.entities.ReviewAssignment.list(),
  });

  const assignments = allAssignments.filter(a =>
    challenges.some(c => c.id === a.challenge_id)
  );

  // ── Mutations ────────────────────────────────────────────
  const challengeMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.IndustryChallenge.update(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['industryChallenges', trendId] }),
  });

  const trendMutation = useMutation({
    mutationFn: (data) => base44.entities.GlobalTrend.update(trendId, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['globalTrend', trendId] }),
  });

  // ── Handlers ─────────────────────────────────────────────
  const handleApproveChallenge = async (challenge) => {
    await challengeMutation.mutateAsync({
      id: challenge.id,
      data: { review_status: 'approved', is_active: true, decision_pending: false },
    });
    if (selectedChallenge?.id === challenge.id) {
      setSelectedChallenge({ ...selectedChallenge, review_status: 'approved', is_active: true });
    }
    toast.success(`"${challenge.name}" approved`);
  };

  const handleRejectChallenge = async (challenge) => {
    await challengeMutation.mutateAsync({
      id: challenge.id,
      data: { review_status: 'rejected', is_active: false, decision_pending: false },
    });
    if (selectedChallenge?.id === challenge.id) {
      setSelectedChallenge({ ...selectedChallenge, review_status: 'rejected', is_active: false });
    }
    toast.warning(`"${challenge.name}" rejected`);
  };

  const handleSaveValidation = async (challenge, validationPayload) => {
    const safePayload = {};
    if (validationPayload.validation_status) safePayload.validation_status = validationPayload.validation_status;
    if (validationPayload.validated_by !== undefined) safePayload.validated_by = validationPayload.validated_by;
    if (validationPayload.validated_date !== undefined) safePayload.validated_date = validationPayload.validated_date;
    await challengeMutation.mutateAsync({ id: challenge.id, data: safePayload });
    queryClient.invalidateQueries({ queryKey: ['industryChallenges', trendId] });
    toast.success('Market validation updated');
  };

  const handleSaveEdit = async (payload) => {
    setIsSaving(true);
    await trendMutation.mutateAsync({ $set: { ...payload } });
    setEditModalOpen(false);
    setIsSaving(false);
    toast.success('Trend updated');
  };

  const handleActivate = async () => {
    await trendMutation.mutateAsync({ $set: { is_active: true } });
    toast.success(`"${trend.trend_name}" is now Active`);
  };

  const handleDeactivate = async () => {
    await trendMutation.mutateAsync({ $set: { is_active: false } });
    toast.success(`"${trend.trend_name}" moved to Pending review`);
  };

  const handleArchive = async () => {
    await trendMutation.mutateAsync({ $set: { is_active: false } });
    toast.warning(`"${trend.trend_name}" set to Pending review`);
  };

  const handleProposeChallenges = async () => {
    setProposing(true);
    try {
      const res = await base44.functions.invoke('proposeChallengesForTrend', { global_trend_id: trendId });
      const data = res?.data;
      queryClient.invalidateQueries({ queryKey: ['industryChallenges', trendId] });
      toast.success(`${data?.candidates_proposed || 0} new candidates proposed`);
    } catch (err) {
      toast.error(`Failed to propose challenges: ${err.message}`);
    } finally {
      setProposing(false);
    }
  };

  const handleGenerateReport = async () => {
    setGeneratingReport(true);
    setReportError(null);
    setReportData(null);
    try {
      const res = await base44.functions.invoke('generateTrendReport', { global_trend_id: trendId, region: reportRegion });
      setReportData(res?.data);
      toast.success('Report generated');
    } catch (err) {
      setReportError(err.message);
      toast.error(`Report generation failed: ${err.message}`);
    } finally {
      setGeneratingReport(false);
    }
  };

  // ── Loading / error states ───────────────────────────────
  if (loadingTrend) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <div className="w-8 h-8 border-4 border-slate-200 border-t-[#1D428A] rounded-full animate-spin" />
      </div>
    );
  }

  if (!trend) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', gap: 12 }}>
        <p style={{ fontSize: 16, color: '#1D2B47', fontWeight: 600 }}>Trend not found</p>
        <Link to="/TrendLibrary" style={{ fontSize: 14, color: '#1D428A', textDecoration: 'underline' }}>← Back to Library</Link>
      </div>
    );
  }

  // ── Derived values ───────────────────────────────────────
  const isPending = !trend.is_active;
  const pendingCount = challenges.filter(c => c.review_status === 'pending').length;
  const sortedChallenges = [...challenges].sort((a, b) => {
    const order = { pending: 0, approved: 1, rejected: 2 };
    return (order[a.review_status] ?? 1) - (order[b.review_status] ?? 1);
  });

  const allSources = trend.sources || [];
  const visibleSources = allSources.filter(s => s.review_status !== 'rejected');
  const rejectedSources = allSources.filter(s => s.review_status === 'rejected');

  return (
    <div style={{ minHeight: '100vh', background: 'hsl(var(--background))' }}>
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 24px 64px' }}>

        {/* Back link */}
        <Link
          to="/TrendLibrary"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            fontSize: 13, color: 'hsl(var(--muted-foreground))',
            textDecoration: 'none', marginBottom: 20,
          }}
          onMouseEnter={e => e.currentTarget.style.color = '#1D428A'}
          onMouseLeave={e => e.currentTarget.style.color = 'hsl(var(--muted-foreground))'}
        >
          <ArrowLeft className="w-4 h-4" /> Library
        </Link>

        {/* ── HEADER ─────────────────────────────────────── */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <h1 style={{
              fontFamily: 'Lora, Georgia, serif',
              fontSize: 28, fontWeight: 600, color: '#1D2B47',
              letterSpacing: '-0.02em', lineHeight: 1.25, margin: 0,
            }}>
              {trend.trend_name}
            </h1>

            {/* Action buttons */}
            <div style={{ display: 'flex', gap: 8, flexShrink: 0, alignItems: 'center' }}>
              <Button variant="outline" size="sm" onClick={() => setEditModalOpen(true)}>
                <Pencil className="w-4 h-4" /> Edit
              </Button>
              {isPending ? (
                <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white" onClick={handleActivate}>
                  <CheckCircle className="w-4 h-4" /> Activate
                </Button>
              ) : (
                <Button variant="outline" size="sm" onClick={handleDeactivate}>
                  <XCircle className="w-4 h-4" /> Deactivate
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={handleArchive} className="text-slate-500">
                <Trash2 className="w-4 h-4" /> Archive
              </Button>
            </div>
          </div>

          {/* Chips row */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
            {trend.mega_trend && (
              <Chip bg="#1D428A" color="#fff" border="#1D428A">{trend.mega_trend}</Chip>
            )}
            {trend.category && (
              <Chip>{trend.category.replace(/_/g, ' ')}</Chip>
            )}
            {isPending ? (
              <Chip bg="#fef3c7" color="#92400e" border="#f59e0b">Pending review</Chip>
            ) : (
              <Chip bg="#eaf2e8" color="#3a6b2e" border="#86bc80">Active</Chip>
            )}
            {trend.confidence && (
              <Chip bg="hsl(var(--muted))" color="hsl(var(--muted-foreground))" border="hsl(var(--border))">
                {trend.confidence} confidence
              </Chip>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* ── SECTION 1: OVERVIEW ──────────────────────── */}
          <Section title="Overview">
            {/* Description */}
            <InfoRow label="Description">
              {trend.description ? (
                trend.description.split('\n\n').map((para, i) => (
                  <p key={i} style={{ margin: '0 0 8px' }}>{para}</p>
                ))
              ) : (
                <p style={{ color: 'hsl(var(--muted-foreground))', fontStyle: 'italic' }}>
                  No description yet — click Edit to add one.
                </p>
              )}
            </InfoRow>

            {/* Market signal */}
            {trend.market_signal && (
              <InfoRow label="Market signal">
                <p style={{ margin: 0 }}>{trend.market_signal}</p>
              </InfoRow>
            )}

            {/* Why now */}
            {trend.why_now && (
              <InfoRow label="Why now">
                <p style={{ margin: 0 }}>{trend.why_now}</p>
              </InfoRow>
            )}

            {/* Capability hypothesis */}
            {trend.capability_hypothesis && (
              <InfoRow label="Capability hypothesis">
                <div style={{ background: '#F7F4EE', border: '1px solid #e8e4da', borderRadius: 8, padding: '12px 14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: '#6F8263', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Capability hypothesis
                    </span>
                    <span style={{ fontSize: 11, fontWeight: 500, padding: '1px 7px', borderRadius: 4, background: '#fff7ed', color: '#c2410c' }}>
                      UNCONFIRMED — awaiting field validation
                    </span>
                  </div>
                  <p style={{ margin: 0, fontSize: 14, color: '#1D2B47', lineHeight: 1.6 }}>{trend.capability_hypothesis}</p>
                </div>
              </InfoRow>
            )}

            {/* Palsgaard angle */}
            {trend.palsgaard_angle && (
              <InfoRow label="Palsgaard angle">
                <p style={{ margin: 0 }}>{trend.palsgaard_angle}</p>
              </InfoRow>
            )}

            {/* Keywords */}
            {trend.trend_keywords?.length > 0 && (
              <InfoRow label="Keywords">
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {trend.trend_keywords.map((kw, i) => (
                    <span key={i} style={{
                      fontSize: 12, padding: '2px 8px', borderRadius: 9999,
                      background: '#EBF0F8', color: '#1D428A', border: '1px solid #C5D2EC',
                    }}>
                      {kw}
                    </span>
                  ))}
                </div>
              </InfoRow>
            )}

            {/* Regional manifestations */}
            {trend.regional_manifestations?.length > 0 && (
              <InfoRow label="Regional manifestations">
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10 }}>
                  {trend.regional_manifestations.map((rm, i) => (
                    <div key={i} style={{
                      background: 'hsl(var(--muted))', borderRadius: 8,
                      padding: '10px 12px', border: '1px solid hsl(var(--border))',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <span style={{ fontWeight: 600, fontSize: 13, color: '#1D2B47' }}>{rm.region}</span>
                        {rm.intensity && (
                          <span style={{
                            fontSize: 11, padding: '1px 6px', borderRadius: 4,
                            background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))',
                            color: 'hsl(var(--muted-foreground))', textTransform: 'capitalize',
                          }}>
                            {rm.intensity}
                          </span>
                        )}
                      </div>
                      {rm.signal && <p style={{ fontSize: 13, color: '#475569', margin: 0 }}>{rm.signal}</p>}
                    </div>
                  ))}
                </div>
              </InfoRow>
            )}
          </Section>

          {/* ── SECTION 2: SOURCES ───────────────────────── */}
          <Section title="Sources" count={visibleSources.length}>
            {visibleSources.length === 0 && rejectedSources.length === 0 ? (
              <p style={{ fontSize: 14, color: 'hsl(var(--muted-foreground))', fontStyle: 'italic', margin: 0 }}>
                No sources linked yet.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {visibleSources.map((src, i) => {
                  const isAuto = src.review_status === 'auto_applied';
                  const isPendingReview = src.review_status === 'pending';
                  return (
                    <div key={i} style={{
                      border: `1px solid ${isPendingReview ? '#fcd34d' : 'hsl(var(--border))'}`,
                      borderRadius: 8, padding: '12px 14px', background: 'hsl(var(--card))',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
                        <span style={{ fontWeight: 600, fontSize: 13, color: '#1D2B47' }}>{src.publisher}</span>
                        <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                          {isAuto && <span style={{ fontSize: 11, padding: '1px 6px', borderRadius: 4, background: '#EBF0F8', color: '#1D428A', border: '1px solid #C5D2EC', fontWeight: 600 }}>AUTO</span>}
                          {isPendingReview && <span style={{ fontSize: 11, padding: '1px 6px', borderRadius: 4, background: '#fef3c7', color: '#92400e', border: '1px solid #fcd34d', fontWeight: 600 }}>PENDING</span>}
                          {src.source_type && (
                            <span style={{ fontSize: 11, padding: '1px 6px', borderRadius: 4, background: 'hsl(var(--muted))', color: 'hsl(var(--muted-foreground))', border: '1px solid hsl(var(--border))' }}>
                              {src.source_type.replace(/_/g, ' ')}
                            </span>
                          )}
                        </div>
                      </div>
                      {src.title && (
                        src.url
                          ? <a href={src.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, color: '#1D428A', display: 'block', marginBottom: 4 }}>{src.title}</a>
                          : <p style={{ fontSize: 13, color: '#475569', marginBottom: 4 }}>{src.title}</p>
                      )}
                      {src.date && <p style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))', marginBottom: 4 }}>{src.date}</p>}
                      {src.key_finding && <p style={{ fontSize: 13, fontStyle: 'italic', color: '#475569', margin: 0 }}>{src.key_finding}</p>}
                      {src.quote && (
                        <blockquote style={{ borderLeft: '2px solid hsl(var(--border))', paddingLeft: 10, margin: '8px 0 0', fontSize: 12, color: 'hsl(var(--muted-foreground))', fontStyle: 'italic' }}>
                          "{src.quote}"
                        </blockquote>
                      )}
                    </div>
                  );
                })}

                {rejectedSources.length > 0 && (
                  <div>
                    <button
                      onClick={() => setShowRejectedSources(v => !v)}
                      style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))', textDecoration: 'underline', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                    >
                      {showRejectedSources ? 'Hide' : 'Show'} rejected ({rejectedSources.length})
                    </button>
                    {showRejectedSources && (
                      <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {rejectedSources.map((src, i) => (
                          <div key={i} style={{ border: '1px solid hsl(var(--border))', borderRadius: 6, padding: '8px 12px', background: 'hsl(var(--muted))', opacity: 0.6 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span style={{ fontSize: 11, padding: '1px 6px', borderRadius: 4, background: 'hsl(var(--border))', color: 'hsl(var(--muted-foreground))' }}>REJECTED</span>
                              <span style={{ fontSize: 12, fontWeight: 500, color: 'hsl(var(--muted-foreground))' }}>{src.publisher}</span>
                              <span style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{src.title}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </Section>

          {/* ── SECTION 2b: REGIONAL EVIDENCE ────────────── */}
          <Section title="Regional evidence">
            <RegionalEvidence trendId={trendId} trend={trend} />
          </Section>

          {/* ── SECTION 3: CHALLENGES ────────────────────── */}
          <Section
            title="Challenges"
            count={challenges.length}
            countColor={pendingCount > 0 ? '#92600A' : undefined}
            action={
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {selectedForDispatch.length > 0 && (
                  <button
                    onClick={() => setShowDispatch(true)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      fontSize: 12, fontWeight: 600, padding: '5px 12px',
                      borderRadius: 7, background: '#1D428A', color: '#fff', border: 'none', cursor: 'pointer',
                    }}
                  >
                    <Send className="w-3 h-3" />
                    Dispatch {selectedForDispatch.length}
                  </button>
                )}
                <button
                  onClick={handleProposeChallenges}
                  disabled={proposing}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    fontSize: 12, fontWeight: 500, padding: '5px 12px',
                    borderRadius: 7, border: '1px solid #1D428A',
                    background: 'transparent', color: '#1D428A', cursor: proposing ? 'default' : 'pointer',
                    opacity: proposing ? 0.6 : 1,
                  }}
                >
                  {proposing
                    ? <div className="w-3 h-3 border-2 border-[#1D428A] border-t-transparent rounded-full animate-spin" />
                    : <Zap className="w-3 h-3" />
                  }
                  {proposing ? 'Proposing…' : 'Propose candidates'}
                </button>
              </div>
            }
          >
            {loadingChallenges ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}>
                <div className="w-6 h-6 border-4 border-slate-200 border-t-[#1D428A] rounded-full animate-spin" />
              </div>
            ) : sortedChallenges.length === 0 ? (
              <p style={{ fontSize: 14, color: 'hsl(var(--muted-foreground))', fontStyle: 'italic', textAlign: 'center', padding: '24px 0' }}>
                No challenges yet — click "Propose candidates" to get started.
              </p>
            ) : (
              <div style={{ border: '1px solid hsl(var(--border))', borderRadius: 8, overflow: 'hidden' }}>
                {sortedChallenges.map((challenge, i) => (
                  <div key={challenge.id} style={{
                    borderBottom: i < sortedChallenges.length - 1 ? '1px solid hsl(var(--border))' : 'none',
                    display: 'flex', alignItems: 'flex-start',
                  }}>
                    {/* Dispatch checkbox for approved challenges */}
                    {challenge.review_status === 'approved' && (
                      <label style={{ paddingLeft: 12, paddingTop: 16, cursor: 'pointer', flexShrink: 0 }}>
                        <input
                          type="checkbox"
                          checked={selectedForDispatch.some(c => c.id === challenge.id)}
                          onChange={e => {
                            setSelectedForDispatch(prev =>
                              e.target.checked ? [...prev, challenge] : prev.filter(c => c.id !== challenge.id)
                            );
                          }}
                        />
                      </label>
                    )}
                    <div style={{ flex: 1 }}>
                      <ChallengeCard
                        challenge={challenge}
                        onApprove={handleApproveChallenge}
                        onReject={handleRejectChallenge}
                        onViewDetails={setSelectedChallenge}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Section>

          {/* ── SECTION 4: VALIDATION SUMMARY ────────────── */}
          <Section title="Validation summary">
            <ValidationSummary challenges={challenges} assignments={assignments} />
          </Section>

          {/* ── SECTION 5: GENERATE REPORT CTA ───────────── */}
          <div style={{
            background: 'hsl(var(--card))',
            border: '2px solid #1D428A',
            borderRadius: 10,
            padding: '20px 24px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
            boxShadow: '0 1px 4px 0 rgba(29,66,138,0.08)',
          }}>
            <div>
              <h2 style={{ fontSize: 15, fontWeight: 600, color: '#1D2B47', margin: '0 0 4px' }}>Generate report</h2>
              <p style={{ fontSize: 13, color: 'hsl(var(--muted-foreground))', margin: 0 }}>
                Builds from approved challenges and current sources.
              </p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
            <select
              value={reportRegion}
              onChange={e => setReportRegion(e.target.value)}
              style={{
                border: '1px solid hsl(var(--border))', background: 'hsl(var(--card))',
                borderRadius: 8, padding: '9px 12px', fontSize: 13, color: '#1D2B47',
              }}
            >
              <option value="all">All regions</option>
              {COMMERCIAL_REGIONS.map(r => (
                <option key={r.key} value={r.key}>{r.label}</option>
              ))}
            </select>
            <button
              onClick={handleGenerateReport}
              disabled={generatingReport}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                fontSize: 14, fontWeight: 600, padding: '10px 20px',
                borderRadius: 8, background: generatingReport ? '#93a4c4' : '#1D428A',
                color: '#fff', border: 'none', cursor: generatingReport ? 'default' : 'pointer',
                flexShrink: 0,
              }}
            >
              {generatingReport
                ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                : <ChevronRight className="w-4 h-4" />
              }
              {generatingReport ? 'Generating…' : 'Generate'}
            </button>
            </div>
          </div>

          {reportError && (
            <div style={{ background: '#FAE9E5', border: '1px solid #C15338', borderRadius: 8, padding: '12px 16px', fontSize: 13, color: '#A33B24' }}>
              <strong>Error:</strong> {reportError}
            </div>
          )}

          {reportData && !generatingReport && (
            <TrendReportSections report={reportData} />
          )}
        </div>
      </div>

      {/* Challenge detail panel */}
      {selectedChallenge && (
        <ChallengeDetailPanel
          challenge={selectedChallenge}
          onClose={() => setSelectedChallenge(null)}
          onApprove={handleApproveChallenge}
          onReject={handleRejectChallenge}
          onSaveValidation={handleSaveValidation}
        />
      )}

      {/* Dispatch panel */}
      {showDispatch && (
        <DispatchPanel
          selectedChallenges={selectedForDispatch}
          allChallenges={challenges}
          onClose={() => { setShowDispatch(false); setSelectedForDispatch([]); }}
        />
      )}

      {/* Edit modal */}
      {editModalOpen && (
        <TrendEditModal
          trend={trend}
          onSave={handleSaveEdit}
          onClose={() => setEditModalOpen(false)}
          saving={isSaving}
        />
      )}
    </div>
  );
}