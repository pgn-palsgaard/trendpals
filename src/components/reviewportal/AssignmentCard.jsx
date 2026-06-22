import React, { useState } from 'react';
import { Check, X } from 'lucide-react';

const CAT_LABELS = {
  bakery: 'Bakery', condiments: 'Condiments', chocolate_confectionery: 'Chocolate & Confectionery',
  dairy: 'Dairy', ice_cream: 'Ice Cream', meat: 'Processed Meat', oils_fats: 'Oils & Fats',
  plant_based: 'Plant-based', rutf_rusf: 'RUTF/RUSF', needs_human_review: 'Needs review',
};

const CAP_AREA_LABELS = {
  sustainability: 'Sustainability', texture_quality: 'Texture & quality', cost_efficiency: 'Cost efficiency',
  compliance_regulatory: 'Compliance', new_product_development: 'NPD', food_safety: 'Food safety',
  supply_chain: 'Supply chain', plant_based: 'Plant-based', general: 'General',
};

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

export default function AssignmentCard({ assignment, challenge, trend, onSubmit, isSubmitting }) {
  const [verdict, setVerdict] = useState(null);
  const [comment, setComment] = useState('');

  const name = challenge?.name || assignment.challenge_name || 'Challenge';
  const category = challenge?.category || assignment.category;

  return (
    <div className="pal-card" style={{ padding: 20 }}>
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-2">
        <h3 style={{ fontFamily: "'Inter', sans-serif", fontWeight: 600, fontSize: 15, color: '#1D2B47', lineHeight: 1.4 }}>
          {name}
        </h3>
        <Badge bg="#FEF3C7" color="#92600A">Awaiting your review</Badge>
      </div>

      {/* Meta badges */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        {category && <Badge bg="hsl(var(--muted))" color="hsl(var(--muted-foreground))">{CAT_LABELS[category] || category}</Badge>}
        {challenge?.capability_area && (
          <Badge bg="#EBF0F8" color="#1D428A">{CAP_AREA_LABELS[challenge.capability_area] || challenge.capability_area}</Badge>
        )}
      </div>

      {/* Description */}
      {challenge?.description && (
        <p style={{ fontSize: 13.5, lineHeight: 1.6, color: '#3A4A66', marginBottom: challenge?.capability_observation ? 8 : 14 }}>
          {challenge.description}
        </p>
      )}
      {challenge?.capability_observation && (
        <p style={{ fontSize: 12.5, lineHeight: 1.55, color: '#6F7B90', fontStyle: 'italic', marginBottom: 14 }}>
          {challenge.capability_observation}
        </p>
      )}

      {/* Trend context card */}
      {trend && (
        <div style={{ background: 'hsl(var(--muted)/0.6)', border: '1px solid hsl(var(--border))', borderRadius: 8, padding: 14, marginBottom: 16 }}>
          <p className="section-label" style={{ marginBottom: 6 }}>Trend context</p>
          <p style={{ fontSize: 13.5, fontWeight: 600, color: '#1D2B47', marginBottom: 4 }}>{trend.trend_name}</p>
          {trend.description && (
            <p style={{ fontSize: 12.5, lineHeight: 1.55, color: '#3A4A66', marginBottom: 8 }}>
              {truncateSentences(trend.description, 3)}
            </p>
          )}
          <div className="flex items-center gap-2 flex-wrap">
            {trend.mega_trend && <Badge bg="#EEF1EC" color="#4A6040">{trend.mega_trend}</Badge>}
          </div>
          {Array.isArray(trend.regional_manifestations) && trend.regional_manifestations.length > 0 && (
            <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {trend.regional_manifestations.map((m, i) => (
                <p key={i} style={{ fontSize: 12, lineHeight: 1.5, color: '#6F7B90' }}>
                  <span style={{ fontWeight: 600, color: '#3A4A66' }}>{m.region}:</span> {m.signal}
                </p>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Verdict form */}
      <div className="flex gap-2 mb-3">
        <button
          onClick={() => setVerdict('validated')}
          className="flex-1 flex items-center justify-center gap-1.5 transition-all"
          style={{
            padding: '9px 12px', borderRadius: 8, fontSize: 13, fontWeight: 600,
            border: verdict === 'validated' ? '1.5px solid #4A6040' : '1.5px solid hsl(var(--border))',
            background: verdict === 'validated' ? '#EEF1EC' : 'transparent',
            color: verdict === 'validated' ? '#4A6040' : '#6F7B90', cursor: 'pointer',
          }}
        >
          <Check className="w-4 h-4" /> Validated — I see this in my market
        </button>
        <button
          onClick={() => setVerdict('not_validated')}
          className="flex items-center justify-center gap-1.5 transition-all"
          style={{
            padding: '9px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600,
            border: verdict === 'not_validated' ? '1.5px solid #A33B24' : '1.5px solid hsl(var(--border))',
            background: verdict === 'not_validated' ? '#FAE9E5' : 'transparent',
            color: verdict === 'not_validated' ? '#A33B24' : '#6F7B90', cursor: 'pointer',
          }}
        >
          <X className="w-4 h-4" /> Not validated
        </button>
      </div>

      <textarea
        value={comment}
        onChange={e => setComment(e.target.value)}
        placeholder="What are you seeing? What nuance would you add? Your observations help us refine the insight."
        rows={3}
        style={{
          width: '100%', fontSize: 13, lineHeight: 1.5, color: '#1D2B47', background: '#ffffff',
          border: '1px solid hsl(var(--border))', borderRadius: 8, padding: '8px 10px', resize: 'vertical',
          marginBottom: 12, outline: 'none',
        }}
      />

      <button
        onClick={() => onSubmit(assignment, verdict, comment)}
        disabled={!verdict || isSubmitting}
        className="w-full transition-all disabled:opacity-50"
        style={{ padding: '10px', borderRadius: 8, fontSize: 13.5, fontWeight: 600, color: '#fff', background: '#1D428A', border: 'none', cursor: verdict && !isSubmitting ? 'pointer' : 'not-allowed' }}
      >
        {isSubmitting ? 'Submitting…' : 'Submit verdict'}
      </button>
    </div>
  );
}