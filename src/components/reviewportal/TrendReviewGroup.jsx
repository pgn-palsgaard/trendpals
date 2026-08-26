import React, { useState } from 'react';
import { Check, X, TrendingUp, Sprout, EyeOff } from 'lucide-react';

import { CATEGORY_LABELS as CAT_LABELS } from '@/lib/palsgaardCategoryMapping';
import { CANONICAL_REGIONS, getRegionLabel } from '@/lib/regions';

const SIGNAL_OPTIONS = [
  { key: 'strong', label: 'Strong signal', desc: 'I clearly see this in my market', icon: TrendingUp, active: '#4A6040', bg: '#EEF1EC' },
  { key: 'emerging', label: 'Emerging', desc: 'Early signs, not mainstream yet', icon: Sprout, active: '#92600A', bg: '#FEF3C7' },
  { key: 'not_seeing_it', label: 'Not seeing it', desc: 'Not relevant in my market', icon: EyeOff, active: '#A33B24', bg: '#FAE9E5' },
];

function truncateSentences(text, max = 3) {
  if (!text) return '';
  const sentences = text.match(/[^.!?]+[.!?]+/g);
  if (!sentences) return text.length > 280 ? text.slice(0, 280).trimEnd() + '…' : text;
  return sentences.slice(0, max).join(' ').trim();
}

function Badge({ children, bg, color }) {
  return (
    <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 9px', borderRadius: 9999, background: bg, color }}>
      {children}
    </span>
  );
}

// One challenge row with its own verdict (confirmed / rejected) + optional comment
function ChallengeRow({ challenge, assignment, verdict, comment, onVerdict, onComment }) {
  const name = challenge?.name || assignment.challenge_name || 'Challenge';
  return (
    <div style={{ border: '1px solid hsl(var(--border))', borderRadius: 8, padding: 14, background: 'hsl(var(--card))' }}>
      <p style={{ fontSize: 14, fontWeight: 600, color: '#1D2B47', lineHeight: 1.4, marginBottom: challenge?.description ? 6 : 10 }}>
        {name}
      </p>
      {challenge?.description && (
        <p style={{ fontSize: 12.5, lineHeight: 1.55, color: '#3A4A66', marginBottom: 10 }}>
          {challenge.description}
        </p>
      )}
      <div className="flex gap-2 mb-2">
        <button
          onClick={() => onVerdict('confirmed')}
          className="flex-1 flex items-center justify-center gap-1.5 transition-all"
          style={{
            padding: '7px 10px', borderRadius: 8, fontSize: 12.5, fontWeight: 600,
            border: verdict === 'confirmed' ? '1.5px solid #4A6040' : '1.5px solid hsl(var(--border))',
            background: verdict === 'confirmed' ? '#EEF1EC' : 'transparent',
            color: verdict === 'confirmed' ? '#4A6040' : '#6F7B90', cursor: 'pointer',
          }}
        >
          <Check className="w-3.5 h-3.5" /> Confirmed
        </button>
        <button
          onClick={() => onVerdict('rejected')}
          className="flex items-center justify-center gap-1.5 transition-all"
          style={{
            padding: '7px 14px', borderRadius: 8, fontSize: 12.5, fontWeight: 600,
            border: verdict === 'rejected' ? '1.5px solid #A33B24' : '1.5px solid hsl(var(--border))',
            background: verdict === 'rejected' ? '#FAE9E5' : 'transparent',
            color: verdict === 'rejected' ? '#A33B24' : '#6F7B90', cursor: 'pointer',
          }}
        >
          <X className="w-3.5 h-3.5" /> Reject
        </button>
      </div>
      <textarea
        value={comment}
        onChange={e => onComment(e.target.value)}
        placeholder="Optional note on this specific challenge…"
        rows={2}
        style={{
          width: '100%', fontSize: 12.5, lineHeight: 1.5, color: '#1D2B47', background: '#ffffff',
          border: '1px solid hsl(var(--border))', borderRadius: 8, padding: '7px 9px', resize: 'vertical', outline: 'none',
        }}
      />
    </div>
  );
}

export default function TrendReviewGroup({ trend, assignments, challengeMap, onSubmitGroup, isSubmitting }) {
  const [signal, setSignal] = useState(null);
  // Per-assignment verdict + comment, keyed by assignment id
  const [verdicts, setVerdicts] = useState({});
  const [comments, setComments] = useState({});
  // Self-declared review region. Only offered when the dispatcher left it blank.
  const assignedRegion = assignments.find(a => a.reviewer_region)?.reviewer_region || null;
  const [region, setRegion] = useState('');

  const category = assignments[0]?.category;
  const allVerdictsSet = assignments.every(a => verdicts[a.id]);
  const canSubmit = !!signal && allVerdictsSet && !isSubmitting;

  const handleSubmit = () => {
    if (!canSubmit) return;
    onSubmitGroup({
      signal,
      region: assignedRegion ? null : (region || null),
      items: assignments.map(a => ({
        assignment: a,
        verdict: verdicts[a.id],
        comment: comments[a.id] || '',
      })),
    });
  };

  return (
    <div className="pal-card" style={{ padding: 20 }}>
      {/* Trend header */}
      <div className="flex items-start justify-between gap-3 mb-2">
        <div>
          <p className="section-label" style={{ marginBottom: 4 }}>Trend</p>
          <h3 style={{ fontFamily: "'Lora', Georgia, serif", fontWeight: 600, fontSize: 18, color: '#1D2B47', lineHeight: 1.3 }}>
            {trend?.trend_name || 'Untitled trend'}
          </h3>
        </div>
        <Badge bg="#FEF3C7" color="#92600A">{assignments.length} {assignments.length === 1 ? 'challenge' : 'challenges'}</Badge>
      </div>

      <div className="flex items-center gap-2 mb-3 flex-wrap">
        {category && <Badge bg="hsl(var(--muted))" color="hsl(var(--muted-foreground))">{CAT_LABELS[category] || category}</Badge>}
        {trend?.mega_trend && <Badge bg="#EEF1EC" color="#4A6040">{trend.mega_trend}</Badge>}
      </div>

      {trend?.description && (
        <p style={{ fontSize: 13, lineHeight: 1.6, color: '#3A4A66', marginBottom: 16 }}>
          {truncateSentences(trend.description, 3)}
        </p>
      )}

      {/* Trend-level signal */}
      <div style={{ marginBottom: 18 }}>
        <p style={{ fontSize: 13, fontWeight: 600, color: '#1D2B47', marginBottom: 8 }}>
          How strong is this trend in your market?
        </p>
        <div className="flex gap-2 flex-wrap">
          {SIGNAL_OPTIONS.map(opt => {
            const Icon = opt.icon;
            const isActive = signal === opt.key;
            return (
              <button
                key={opt.key}
                onClick={() => setSignal(opt.key)}
                className="flex-1 transition-all"
                style={{
                  minWidth: 150, padding: '10px 12px', borderRadius: 8, textAlign: 'left',
                  border: isActive ? `1.5px solid ${opt.active}` : '1.5px solid hsl(var(--border))',
                  background: isActive ? opt.bg : 'transparent', cursor: 'pointer',
                }}
              >
                <div className="flex items-center gap-1.5" style={{ marginBottom: 2 }}>
                  <Icon className="w-3.5 h-3.5" style={{ color: isActive ? opt.active : '#6F7B90' }} />
                  <span style={{ fontSize: 12.5, fontWeight: 600, color: isActive ? opt.active : '#3A4A66' }}>{opt.label}</span>
                </div>
                <p style={{ fontSize: 11, lineHeight: 1.4, color: '#6F7B90' }}>{opt.desc}</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Review region — pre-set by the dispatcher, or optionally self-declared */}
      <div style={{ marginBottom: 18 }}>
        <p style={{ fontSize: 13, fontWeight: 600, color: '#1D2B47', marginBottom: 8 }}>
          Which market are you reviewing from?
        </p>
        {assignedRegion ? (
          <Badge bg="hsl(var(--muted))" color="hsl(var(--muted-foreground))">{getRegionLabel(assignedRegion)}</Badge>
        ) : (
          <>
            <select
              value={region}
              onChange={e => setRegion(e.target.value)}
              style={{
                width: '100%', maxWidth: 340, fontSize: 12.5, padding: '8px 10px', borderRadius: 8,
                border: '1px solid hsl(var(--border))', background: '#ffffff',
                color: region ? '#1D2B47' : '#9CA3AF', outline: 'none',
              }}
            >
              <option value="">Prefer not to say</option>
              {CANONICAL_REGIONS.map(r => (
                <option key={r.key} value={r.key}>{r.label} — {r.description}</option>
              ))}
            </select>
            <p style={{ fontSize: 11, color: '#6F7B90', marginTop: 6 }}>
              Optional — it just adds context to your review.
            </p>
          </>
        )}
      </div>

      {/* Per-challenge verdicts */}
      <p style={{ fontSize: 13, fontWeight: 600, color: '#1D2B47', marginBottom: 8 }}>
        Validate each challenge
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
        {assignments.map(a => (
          <ChallengeRow
            key={a.id}
            assignment={a}
            challenge={challengeMap[a.challenge_id]}
            verdict={verdicts[a.id] || null}
            comment={comments[a.id] || ''}
            onVerdict={v => setVerdicts(prev => ({ ...prev, [a.id]: v }))}
            onComment={c => setComments(prev => ({ ...prev, [a.id]: c }))}
          />
        ))}
      </div>

      <button
        onClick={handleSubmit}
        disabled={!canSubmit}
        className="w-full transition-all disabled:opacity-50"
        style={{ padding: '10px', borderRadius: 8, fontSize: 13.5, fontWeight: 600, color: '#fff', background: '#1D428A', border: 'none', cursor: canSubmit ? 'pointer' : 'not-allowed' }}
      >
        {isSubmitting ? 'Submitting…' : (!signal ? 'Select a trend signal' : !allVerdictsSet ? 'Validate all challenges' : 'Submit review')}
      </button>
    </div>
  );
}