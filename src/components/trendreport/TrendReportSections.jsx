import React, { useState } from 'react';
import { CheckCircle, Clock, AlertTriangle, XCircle, ChevronDown, ChevronRight, Lightbulb } from 'lucide-react';

const CATEGORY_LABELS = {
  bakery: 'Bakery', condiments: 'Condiments', chocolate_confectionery: 'Chocolate & Confectionery',
  dairy: 'Dairy', ice_cream: 'Ice Cream', meat: 'Processed Meat', oils_fats: 'Oils & Fats',
  plant_based: 'Plant-based', rutf_rusf: 'RUTF/RUSF', needs_human_review: 'Needs Review',
};

const CAP_FIT_STYLES = {
  strong:  { bg: '#eaf2e8', text: '#3a6b2e', label: 'Strong fit' },
  possible:{ bg: '#fef3c7', text: '#92400e', label: 'Possible fit' },
  none:    { bg: '#f1f5f9', text: '#64748b', label: 'No fit' },
  unknown: { bg: '#f8fafc', text: '#94a3b8', label: 'Fit unknown' },
};

const VALIDATION_STYLES = {
  confirmed:   { bg: '#eaf2e8', text: '#3a6b2e', icon: CheckCircle, label: 'Confirmed' },
  in_field:    { bg: '#fff7ed', text: '#c2410c', icon: AlertTriangle, label: 'In field' },
  rejected:    { bg: '#f1f5f9', text: '#64748b', icon: XCircle, label: 'Rejected' },
  unvalidated: { bg: '#f8fafc', text: '#94a3b8', icon: Clock, label: 'Unvalidated' },
};

const RECIPE_STATUS_STYLES = {
  existing:        { bg: '#eaf2e8', text: '#3a6b2e', label: 'Recipe exists' },
  concept_needed:  { bg: '#fef3c7', text: '#92400e', label: 'Concept needed' },
  unmapped:        { bg: '#f8fafc', text: '#94a3b8', label: 'Unmapped' },
};

const CONFIDENCE_STYLES = {
  high:   { color: '#3a6b2e', label: 'High confidence' },
  medium: { color: '#92400e', label: 'Medium confidence' },
  low:    { color: '#94a3b8', label: 'Low confidence' },
};

function SectionLabel({ number, title, badge }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <span className="flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold text-white shrink-0" style={{ backgroundColor: '#1D2B47' }}>
        {number}
      </span>
      <h2 className="font-bold text-base" style={{ color: '#1D2B47' }}>{title}</h2>
      {badge && <span className="text-xs px-2 py-0.5 rounded-full font-medium ml-auto" style={{ backgroundColor: '#F7F4EE', color: '#6F8263', border: '1px solid #ddd' }}>{badge}</span>}
    </div>
  );
}

function Section({ children, className = '' }) {
  return (
    <div className={`bg-white border border-slate-200 rounded-xl p-6 shadow-sm ${className}`}>
      {children}
    </div>
  );
}

export default function TrendReportSections({ report }) {
  const [showCandidates, setShowCandidates] = useState(false);

  const {
    section1_header: s1,
    section2_why_it_matters: s2,
    section3_approved_challenges: s3,
    section4_solvability: s4,
    section5_white_space: s5,
    section6_candidates: s6,
    summary,
    generated_at,
  } = report;

  const confStyle = CONFIDENCE_STYLES[s1.confidence] || CONFIDENCE_STYLES.medium;
  const s4Map = Object.fromEntries((s4 || []).map(x => [x.challenge_id, x]));

  return (
    <div className="space-y-5">
      {/* Meta */}
      <div className="text-xs text-slate-400 text-right">
        Generated {new Date(generated_at).toLocaleString()} — internal use only
      </div>

      {/* Section 1: Header */}
      <Section>
        <SectionLabel number={1} title="Trend Overview" />
        <div className="space-y-3">
          <div>
            <h3 className="text-xl font-bold" style={{ color: '#1D2B47' }}>{s1.trend_name}</h3>
            <div className="flex items-center gap-3 mt-2 flex-wrap">
              {s1.category && (
                <span className="text-xs px-2.5 py-1 rounded-full font-medium bg-blue-50 text-blue-700 border border-blue-200">
                  {CATEGORY_LABELS[s1.category] || s1.category}
                </span>
              )}
              {s1.driver && (
                <span className="text-xs px-2.5 py-1 rounded-full bg-slate-100 text-slate-600">
                  Driver: {s1.driver}
                </span>
              )}
              {s1.confidence && (
                <span className="text-xs font-medium" style={{ color: confStyle.color }}>
                  ● {confStyle.label}
                </span>
              )}
              {s1.capability_area && (
                <span className="text-xs px-2.5 py-1 rounded-full bg-slate-100 text-slate-500 capitalize">
                  {s1.capability_area.replace(/_/g, ' ')}
                </span>
              )}
              {!s1.is_active && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                  Inactive trend
                </span>
              )}
            </div>
          </div>
          {/* Internal scores note */}
          <p className="text-xs text-slate-400 italic">Confidence and driver scores are internal — not for customer-facing use.</p>
        </div>
      </Section>

      {/* Section 2: Why it matters */}
      <Section>
        <SectionLabel number={2} title="Why It May Matter" />
        <div className="space-y-4">
          {s2.market_signal && (
            <div>
              <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Market Signal</h4>
              <p className="text-sm text-slate-700 leading-relaxed">{s2.market_signal}</p>
            </div>
          )}
          {s2.whats_changing?.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">What's Changing</h4>
              <ul className="space-y-1.5">
                {s2.whats_changing.map((item, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
                    <span className="mt-1.5 w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: '#1D428A' }} />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {s2.why_now && (
            <div>
              <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Why Now</h4>
              <p className="text-sm text-slate-700 leading-relaxed">{s2.why_now}</p>
            </div>
          )}
          {s2.regional_manifestations?.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Regional Signals</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {s2.regional_manifestations.map((r, i) => (
                  <div key={i} className="bg-slate-50 rounded-lg px-3 py-2">
                    <span className="text-xs font-semibold text-slate-500">{r.region}</span>
                    {r.intensity && (
                      <span className="ml-2 text-xs capitalize text-slate-400">{r.intensity}</span>
                    )}
                    {r.signal && <p className="text-xs text-slate-600 mt-0.5">{r.signal}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </Section>

      {/* Section 3: Approved challenges */}
      <Section>
        <SectionLabel number={3} title="Approved Challenges" badge={`${s3.length} approved`} />
        {s3.length === 0 ? (
          <p className="text-sm text-slate-500 italic">No approved challenges yet. Review candidates in section 6 below.</p>
        ) : (
          <div className="space-y-4">
            {s3.map(c => {
              const fitStyle = CAP_FIT_STYLES[c.capability_fit] || CAP_FIT_STYLES.unknown;
              const valStyle = VALIDATION_STYLES[c.validation_status || 'unvalidated'];
              const ValIcon = valStyle.icon;
              const solvability = s4Map[c.id];

              return (
                <div key={c.id} className="rounded-xl border border-slate-200 p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <h4 className="font-semibold text-sm" style={{ color: '#1D2B47' }}>{c.name}</h4>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: fitStyle.bg, color: fitStyle.text }}>
                        {fitStyle.label}
                      </span>
                      <span className="text-xs flex items-center gap-1 px-2 py-0.5 rounded-full" style={{ backgroundColor: valStyle.bg, color: valStyle.text }}>
                        <ValIcon className="w-3 h-3" />
                        {valStyle.label}
                      </span>
                    </div>
                  </div>
                  {c.description && <p className="text-sm text-slate-600">{c.description}</p>}
                  {c.capability_observation && (
                    <div>
                      <span className="text-xs font-semibold text-slate-400">Observation: </span>
                      <span className="text-xs text-slate-600">{c.capability_observation}</span>
                    </div>
                  )}
                  {c.capability_hypothesis && (
                    <div className="rounded-lg px-3 py-2 border" style={{ backgroundColor: '#F7F4EE', borderColor: '#e8e4da' }}>
                      <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#6F8263' }}>Hypothesis</span>
                      <span className="ml-2 text-xs font-medium px-1.5 py-0.5 rounded" style={{ backgroundColor: '#fff7ed', color: '#c2410c' }}>UNCONFIRMED</span>
                      <p className="text-xs mt-1 leading-relaxed" style={{ color: '#1D2B47' }}>{c.capability_hypothesis}</p>
                    </div>
                  )}
                  {solvability && solvability.recipes.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {solvability.recipes.map(r => {
                        const rs = RECIPE_STATUS_STYLES[r.recipe_match_status] || RECIPE_STATUS_STYLES.unmapped;
                        return (
                          <span key={r.id} className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: rs.bg, color: rs.text }}>
                            {r.name} — {rs.label}
                          </span>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Section>

      {/* Section 4: Solvability */}
      {s3.length > 0 && (
        <Section>
          <SectionLabel number={4} title="Solvability & Recipe Match" />
          <div className="space-y-3">
            {s4.map(item => (
              <div key={item.challenge_id} className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
                <span className="text-sm text-slate-700">{item.challenge_name}</span>
                <div className="flex items-center gap-2">
                  {item.recipe_count === 0 ? (
                    <span className="text-xs text-slate-400">No recipes linked</span>
                  ) : (
                    item.recipes.map(r => {
                      const rs = RECIPE_STATUS_STYLES[r.recipe_match_status] || RECIPE_STATUS_STYLES.unmapped;
                      return (
                        <span key={r.id} className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: rs.bg, color: rs.text }}>
                          {rs.label}
                        </span>
                      );
                    })
                  )}
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Section 5: WHITE SPACE — visual hero */}
      <div className="rounded-xl p-6 shadow-md" style={{ background: 'linear-gradient(135deg, #1D2B47 0%, #1D428A 100%)' }}>
        <div className="flex items-center gap-3 mb-5">
          <div className="p-2 rounded-lg" style={{ backgroundColor: 'rgba(255,255,255,0.15)' }}>
            <Lightbulb className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.6)' }}>Section 5</span>
            </div>
            <h2 className="text-lg font-bold text-white">White Space — Development Priorities</h2>
          </div>
          <span className="ml-auto text-sm font-bold text-white bg-white/20 px-3 py-1 rounded-full">
            {s5.length} {s5.length === 1 ? 'gap' : 'gaps'}
          </span>
        </div>

        {s3.length === 0 ? (
          <p className="text-white/70 text-sm italic">No approved challenges yet — approve challenges to surface white space.</p>
        ) : s5.length === 0 ? (
          <p className="text-white/70 text-sm italic">No white space identified — all strong/possible-fit challenges have an existing recipe mapped.</p>
        ) : (
          <div className="space-y-3">
            {s5.map((item, i) => {
              const fitStyle = CAP_FIT_STYLES[item.capability_fit] || CAP_FIT_STYLES.unknown;
              return (
                <div key={item.challenge_id} className="rounded-xl p-4" style={{ backgroundColor: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)' }}>
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <h4 className="font-bold text-white text-sm">{item.challenge_name}</h4>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: fitStyle.bg, color: fitStyle.text }}>
                        {fitStyle.label}
                      </span>
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: '#C15338', color: 'white' }}>
                        {item.priority_reason}
                      </span>
                    </div>
                  </div>
                  {item.description && <p className="text-white/75 text-xs leading-relaxed">{item.description}</p>}
                  {item.capability_hypothesis && (
                    <div className="mt-2 pt-2 border-t border-white/10">
                      <p className="text-white/60 text-xs"><span className="font-semibold">Hypothesis:</span> {item.capability_hypothesis}</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Section 6: Candidates awaiting approval */}
      <div className="rounded-xl border-2 border-dashed border-slate-300 overflow-hidden">
        <button
          onClick={() => setShowCandidates(!showCandidates)}
          className="w-full flex items-center justify-between px-6 py-4 bg-slate-50 hover:bg-slate-100 transition-colors"
        >
          <div className="flex items-center gap-3">
            {showCandidates ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
            <span className="font-semibold text-sm text-slate-500">
              Section 6 — Candidates Awaiting Approval
            </span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 font-medium">
              {s6.length} pending
            </span>
          </div>
          <span className="text-xs text-slate-400">Not included in active analysis — approve in Challenge Library first</span>
        </button>

        {showCandidates && (
          <div className="p-6 space-y-3 bg-white">
            {s6.length === 0 ? (
              <p className="text-sm text-slate-400 italic">No candidates pending. Run "Propose new candidates" from the Challenge Library.</p>
            ) : (
              s6.map(c => {
                const fitStyle = CAP_FIT_STYLES[c.capability_fit] || CAP_FIT_STYLES.unknown;
                return (
                  <div key={c.id} className="rounded-lg border border-slate-200 p-4 bg-slate-50">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <h4 className="font-semibold text-sm text-slate-600">{c.name}</h4>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: fitStyle.bg, color: fitStyle.text }}>
                          {fitStyle.label}
                        </span>
                        <span className="text-xs text-slate-400 capitalize">{c.review_status}</span>
                      </div>
                    </div>
                    {c.description && <p className="text-xs text-slate-500">{c.description}</p>}
                    {c.defaulted_conservatively && (
                      <p className="text-xs mt-1" style={{ color: '#c2410c' }}>⚠ Conservative default applied</p>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>
    </div>
  );
}