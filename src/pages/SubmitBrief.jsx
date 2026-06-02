import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';

const CATEGORIES = ['Ice Cream', 'Dairy', 'Confectionery', 'Bakery', 'Dressings', 'Spreads', 'Plant-based', 'Other'];
const REGIONS = ['Global', 'ASPAC', 'EMEA', 'Americas', 'LATAM'];
const REGION_ZOOMS = ['None — stay global', 'ASPAC', 'EMEA', 'Americas', 'LATAM', 'China', 'Southeast Asia', 'Northern Europe', 'Southern Europe'];
const PAINS = [
  'Clean label', 'Cost pressure', 'Texture & stability', 'Sugar / fat reduction',
  'Plant-based formulation', 'Speed to market', 'Sustainability / ESG',
  'Supply chain resilience', 'Regulatory compliance', 'New product development',
];

function addWorkingDays(date, days) {
  let d = new Date(date), count = 0;
  while (count < days) {
    d.setDate(d.getDate() + 1);
    if (d.getDay() !== 0 && d.getDay() !== 6) count++;
  }
  return d;
}

const minDateStr = addWorkingDays(new Date(), 15).toISOString().split('T')[0];

export default function SubmitBrief() {
  const [step, setStep] = useState(1);
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [form, setForm] = useState({
    report_type: '',
    // step 2 account
    purpose_account: '', account: '', category_account: '', region_account: '', contact_name: '',
    // step 2 category
    purpose_category: '', category_category: '', region_primary: '', region_zoom: '', account_optional: '',
    // step 3
    pains: [], context: '',
    // step 4
    first_name: '', last_name: '', deadline: '',
  });

  const set = (field, value) => setForm(f => ({ ...f, [field]: value }));

  const togglePain = (pain) =>
    setForm(f => ({
      ...f,
      pains: f.pains.includes(pain) ? f.pains.filter(p => p !== pain) : [...f.pains, pain],
    }));

  const validate = () => {
    if (step === 1) {
      if (!form.report_type) return 'Please select a report type to continue.';
    }
    if (step === 2) {
      if (form.report_type === 'account') {
        if (!form.purpose_account.trim()) return 'Please describe the purpose of the meeting.';
        if (!form.account.trim()) return 'Please enter the account / customer name.';
        if (!form.category_account) return 'Please select a category.';
        if (!form.region_account) return 'Please select a region.';
      } else {
        if (!form.purpose_category.trim()) return 'Please describe the purpose of this brief.';
        if (!form.category_category) return 'Please select a category.';
        if (!form.region_primary) return 'Please select a primary region.';
      }
    }
    if (step === 4) {
      if (!form.first_name.trim()) return 'Please enter your first name.';
      if (!form.last_name.trim()) return 'Please enter your last name.';
      if (!form.deadline) return 'Please select a meeting or deadline date.';
      if (form.deadline < minDateStr) return 'Please allow at least 15 working days for report preparation.';
    }
    return null;
  };

  const next = () => {
    const err = validate();
    if (err) { setError(err); return; }
    setError('');
    setStep(s => s + 1);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const back = () => {
    setError('');
    setStep(s => s - 1);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const submit = async () => {
    const err = validate();
    if (err) { setError(err); return; }
    setLoading(true);
    setError('');
    const isAccount = form.report_type === 'account';
    try {
      await base44.functions.invoke('submitBrief', {
        requester_name: `${form.first_name} ${form.last_name}`.trim(),
        report_type: form.report_type,
        purpose: isAccount ? form.purpose_account : form.purpose_category,
        account: isAccount ? form.account : form.account_optional,
        categories: isAccount ? form.category_account : form.category_category,
        region: isAccount ? form.region_account : form.region_primary,
        region_zoom: isAccount ? '' : (form.region_zoom === 'None — stay global' ? '' : form.region_zoom),
        contact_name: isAccount ? form.contact_name : '',
        pains: form.pains.join(', '),
        context: form.context,
        deadline: form.deadline || null,
        submitted_at: new Date().toISOString(),
      });
      setSubmitted(true);
    } catch (e) {
      setError('Something went wrong — please try again. ' + (e.message || ''));
    } finally {
      setLoading(false);
    }
  };

  // ── Styles (inline to match the HTML template exactly) ──
  const blue = '#1D428A';
  const blueDark = '#162f63';
  const blueMid = '#2a52a8';
  const blueLight = '#eef2f9';
  const bluePale = '#f5f7fc';
  const red = '#c0392b';
  const textColor = '#111111';
  const text2 = '#444444';
  const text3 = '#888888';
  const border = '#e0e0e0';
  const border2 = '#cccccc';
  const inputBg = '#f6f6f6';

  const fieldStyle = { marginBottom: 20 };
  const labelStyle = { display: 'block', fontSize: 13, fontWeight: 600, color: textColor, marginBottom: 6 };
  const inputStyle = {
    width: '100%', padding: '10px 13px', border: `1.5px solid ${border}`,
    borderRadius: 4, background: inputBg, fontSize: 14, color: textColor,
    outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
  };
  const selectStyle = {
    ...inputStyle,
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%23888' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E")`,
    backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center',
    paddingRight: 34, cursor: 'pointer', appearance: 'none',
  };
  const textareaStyle = { ...inputStyle, resize: 'vertical', minHeight: 80, lineHeight: 1.55 };
  const hintStyle = { fontSize: 12, color: text3, marginTop: 5, lineHeight: 1.4 };
  const optStyle = { fontWeight: 400, color: text3, fontSize: 12, marginLeft: 6 };
  const reqStyle = { color: red, marginLeft: 2 };

  if (submitted) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start', padding: '40px 20px 80px', background: '#f2f4f7', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif' }}>
        <div style={{ width: '100%', maxWidth: 680, background: '#fff', borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.08),0 4px 16px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
          <div style={{ padding: '60px 40px', textAlign: 'center' }}>
            <div style={{ width: 64, height: 64, background: `linear-gradient(135deg, ${blue}, ${blueMid})`, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px', fontSize: 28, color: 'white', boxShadow: '0 4px 20px rgba(29,66,138,0.3)' }}>✓</div>
            <h2 style={{ fontFamily: 'Georgia, serif', fontSize: 24, fontWeight: 700, color: textColor, marginBottom: 10 }}>Brief received</h2>
            <p style={{ fontSize: 14, color: text2, lineHeight: 1.7, maxWidth: 380, margin: '0 auto' }}>
              Your request has been logged. You'll receive a follow-up once the brief has been reviewed and work has begun.
            </p>
          </div>
        </div>
        <div style={{ marginTop: 28, fontSize: 12, color: '#999', textAlign: 'center', lineHeight: 1.6 }}>
          Palsgaard A/S &nbsp;·&nbsp; Market Intelligence &nbsp;·&nbsp; Internal use only
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start', padding: '40px 20px 80px', background: '#f2f4f7', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif', fontSize: 15, lineHeight: 1.5, color: textColor }}>
      <div style={{ width: '100%', maxWidth: 680, background: '#fff', borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.08),0 4px 16px rgba(0,0,0,0.06)', overflow: 'hidden' }}>

        {/* Header */}
        <div style={{ padding: '36px 40px 32px', borderBottom: `1px solid ${border}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
            <img
              src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/6987a5428ef229e6ee55cbb6/16cea8b8e_Palsgaardlogo_blue_250x250.png"
              alt="Palsgaard" style={{ height: 32 }}
            />
            <span style={{ fontFamily: 'inherit', fontSize: 10, fontWeight: 600, letterSpacing: '1.2px', textTransform: 'uppercase', color: text3, background: '#f0f0f0', padding: '3px 8px', borderRadius: 20 }}>Market Intelligence</span>
          </div>
          <h1 style={{ fontFamily: 'Georgia, serif', fontSize: 26, fontWeight: 700, color: textColor, lineHeight: 1.2, marginBottom: 8 }}>Market Intelligence Brief</h1>
          <p style={{ fontSize: 14, color: text2, lineHeight: 1.65 }}>Complete this form and the Market Intelligence team will prepare a tailored brief for your meeting.</p>
        </div>

        {/* Progress */}
        <div style={{ display: 'flex', alignItems: 'center', padding: '20px 40px', background: bluePale, borderBottom: `1px solid ${border}` }}>
          {['Report type', 'Context', 'Focus areas', 'Details'].map((label, i) => {
            const num = i + 1;
            const isDone = step > num;
            const isActive = step === num;
            return (
              <React.Fragment key={num}>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 12, fontWeight: 700, flexShrink: 0, transition: 'all 0.3s',
                    background: isDone || isActive ? blue : border,
                    color: isDone || isActive ? 'white' : text3,
                    boxShadow: isActive ? `0 0 0 4px ${blueLight}` : 'none',
                  }}>
                    {isDone ? '✓' : num}
                  </div>
                  <span style={{ position: 'absolute', top: 34, left: '50%', transform: 'translateX(-50%)', fontSize: 11, fontWeight: 500, color: isActive ? blue : text3, whiteSpace: 'nowrap' }}>{label}</span>
                </div>
                {num < 4 && (
                  <div style={{ flex: 1, height: 2, background: isDone ? blue : border, margin: '0 6px', transition: 'background 0.3s' }} />
                )}
              </React.Fragment>
            );
          })}
        </div>

        {/* Form body */}
        <div style={{ padding: '32px 40px 0' }}>

          {/* Step 1 */}
          {step === 1 && (
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: text3, marginBottom: 24, paddingBottom: 12, borderBottom: `1px solid ${border}` }}>Step 1 of 4 — What kind of report do you need?</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 8 }}>
                {[
                  { value: 'account', icon: '🏢', title: 'Account Intelligence', desc: "I'm preparing for a visit with a specific customer and want to show deep market understanding." },
                  { value: 'category', icon: '🌍', title: 'Category Intelligence', desc: "I want an overview of what's happening in a category — globally and in a specific region." },
                ].map(opt => {
                  const sel = form.report_type === opt.value;
                  return (
                    <div key={opt.value} onClick={() => set('report_type', opt.value)} style={{ border: `2px solid ${sel ? blue : border}`, borderRadius: 8, padding: '20px 18px', cursor: 'pointer', background: sel ? blueLight : '#fff', position: 'relative', transition: 'all 0.2s' }}>
                      <div style={{ position: 'absolute', top: 12, right: 12, width: 20, height: 20, borderRadius: '50%', border: `2px solid ${sel ? blue : border}`, background: sel ? blue : 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: sel ? 'white' : 'transparent' }}>✓</div>
                      <span style={{ fontSize: 24, display: 'block', marginBottom: 10 }}>{opt.icon}</span>
                      <div style={{ fontSize: 14, fontWeight: 700, color: textColor, marginBottom: 5 }}>{opt.title}</div>
                      <div style={{ fontSize: 12, color: text3, lineHeight: 1.5 }}>{opt.desc}</div>
                    </div>
                  );
                })}
              </div>
              <div style={hintStyle}>Not sure? Account Intelligence is best for named customer visits. Category Intelligence is best for market briefings and team preparation.</div>
            </div>
          )}

          {/* Step 2 */}
          {step === 2 && (
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: text3, marginBottom: 24, paddingBottom: 12, borderBottom: `1px solid ${border}` }}>
                {form.report_type === 'account' ? 'Step 2 of 4 — Tell us about the customer' : 'Step 2 of 4 — Tell us about the category and region'}
              </div>

              {form.report_type === 'account' ? (
                <>
                  <div style={fieldStyle}>
                    <label style={labelStyle}>Meeting purpose <span style={reqStyle}>*</span></label>
                    <textarea style={textareaStyle} rows={3} value={form.purpose_account} onChange={e => set('purpose_account', e.target.value)} placeholder="What is the goal of this meeting? What do you want the customer to walk away thinking or doing?" />
                  </div>
                  <div style={fieldStyle}>
                    <label style={labelStyle}>Account / customer name <span style={reqStyle}>*</span></label>
                    <input style={inputStyle} type="text" value={form.account} onChange={e => set('account', e.target.value)} placeholder="e.g. Nestlé, Unilever, Mengniu" />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                    <div style={fieldStyle}>
                      <label style={labelStyle}>Category focus <span style={reqStyle}>*</span></label>
                      <select style={selectStyle} value={form.category_account} onChange={e => set('category_account', e.target.value)}>
                        <option value="">Select category</option>
                        {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                      </select>
                    </div>
                    <div style={fieldStyle}>
                      <label style={labelStyle}>Region <span style={reqStyle}>*</span></label>
                      <select style={selectStyle} value={form.region_account} onChange={e => set('region_account', e.target.value)}>
                        <option value="">Select region</option>
                        {REGIONS.map(r => <option key={r}>{r}</option>)}
                      </select>
                    </div>
                  </div>
                  <div style={fieldStyle}>
                    <label style={labelStyle}>Key contact <span style={optStyle}>— Optional</span></label>
                    <input style={inputStyle} type="text" value={form.contact_name} onChange={e => set('contact_name', e.target.value)} placeholder="Name and role, e.g. Sarah Chen — Head of R&D" />
                  </div>
                </>
              ) : (
                <>
                  <div style={fieldStyle}>
                    <label style={labelStyle}>Meeting purpose <span style={reqStyle}>*</span></label>
                    <textarea style={textareaStyle} rows={3} value={form.purpose_category} onChange={e => set('purpose_category', e.target.value)} placeholder="What is the goal of this brief? Who is the audience and what should they take away?" />
                  </div>
                  <div style={fieldStyle}>
                    <label style={labelStyle}>Category <span style={reqStyle}>*</span></label>
                    <select style={selectStyle} value={form.category_category} onChange={e => set('category_category', e.target.value)}>
                      <option value="">Select category</option>
                      {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                    </select>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                    <div style={fieldStyle}>
                      <label style={labelStyle}>Primary region <span style={reqStyle}>*</span></label>
                      <select style={selectStyle} value={form.region_primary} onChange={e => set('region_primary', e.target.value)}>
                        <option value="">Select region</option>
                        {REGIONS.map(r => <option key={r}>{r}</option>)}
                      </select>
                    </div>
                    <div style={fieldStyle}>
                      <label style={labelStyle}>Regional zoom <span style={optStyle}>— Optional</span></label>
                      <select style={selectStyle} value={form.region_zoom} onChange={e => set('region_zoom', e.target.value)}>
                        {REGION_ZOOMS.map(r => <option key={r}>{r}</option>)}
                      </select>
                    </div>
                  </div>
                  <div style={fieldStyle}>
                    <label style={labelStyle}>Specific customer in mind? <span style={optStyle}>— Optional</span></label>
                    <input style={inputStyle} type="text" value={form.account_optional} onChange={e => set('account_optional', e.target.value)} placeholder="e.g. A bakery customer in Brazil — not named yet" />
                  </div>
                </>
              )}
            </div>
          )}

          {/* Step 3 */}
          {step === 3 && (
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: text3, marginBottom: 24, paddingBottom: 12, borderBottom: `1px solid ${border}` }}>Step 3 of 4 — What should the report focus on?</div>
              <div style={fieldStyle}>
                <label style={labelStyle}>Key challenge areas <span style={optStyle}>— Select all that apply</span></label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {PAINS.map(pain => {
                    const sel = form.pains.includes(pain);
                    return (
                      <div key={pain} onClick={() => togglePain(pain)} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '9px 13px', border: `1.5px solid ${sel ? blue : border}`, borderRadius: 4, cursor: 'pointer', fontSize: 13, color: sel ? blue : text2, background: sel ? blueLight : '#fff', fontWeight: sel ? 600 : 400, transition: 'all 0.15s', userSelect: 'none' }}>
                        <div style={{ width: 16, height: 16, border: `1.5px solid ${sel ? blue : border2}`, borderRadius: 3, background: sel ? blue : 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 10, color: sel ? 'white' : 'transparent', transition: 'all 0.15s' }}>✓</div>
                        {pain}
                      </div>
                    );
                  })}
                </div>
              </div>
              <div style={{ height: 1, background: border, margin: '24px 0' }} />
              <div style={fieldStyle}>
                <label style={labelStyle}>Anything specific we should know about this customer or situation? <span style={optStyle}>— Optional</span></label>
                <textarea style={textareaStyle} rows={3} value={form.context} onChange={e => set('context', e.target.value)} placeholder="e.g. They recently launched a reduced-sugar range that has texture issues. The meeting is with their Head of R&D who is very technically minded." />
              </div>
            </div>
          )}

          {/* Step 4 */}
          {step === 4 && (
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: text3, marginBottom: 24, paddingBottom: 12, borderBottom: `1px solid ${border}` }}>Step 4 of 4 — Your details and timing</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div style={fieldStyle}>
                  <label style={labelStyle}>First name <span style={reqStyle}>*</span></label>
                  <input style={inputStyle} type="text" value={form.first_name} onChange={e => set('first_name', e.target.value)} placeholder="First name" />
                </div>
                <div style={fieldStyle}>
                  <label style={labelStyle}>Last name <span style={reqStyle}>*</span></label>
                  <input style={inputStyle} type="text" value={form.last_name} onChange={e => set('last_name', e.target.value)} placeholder="Last name" />
                </div>
              </div>
              <div style={fieldStyle}>
                <label style={labelStyle}>Meeting / deadline date <span style={reqStyle}>*</span></label>
                <input style={inputStyle} type="date" value={form.deadline} min={minDateStr} onChange={e => set('deadline', e.target.value)} />
                <div style={hintStyle}>Please allow enough lead time — the earlier you submit, the richer the report.</div>
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div style={{ marginTop: 16, fontSize: 13, color: red, background: '#fdf0ef', border: `1px solid #f5c6c2`, borderRadius: 4, padding: '10px 14px' }}>{error}</div>
          )}
        </div>

        {/* Footer nav */}
        <div style={{ padding: '24px 40px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: `1px solid ${border}`, marginTop: 32 }}>
          <button
            onClick={back}
            style={{ visibility: step === 1 ? 'hidden' : 'visible', display: 'inline-flex', alignItems: 'center', gap: 8, padding: '11px 24px', borderRadius: 4, fontSize: 14, fontWeight: 600, cursor: 'pointer', border: `1.5px solid ${border}`, background: 'transparent', color: text2, fontFamily: 'inherit' }}
          >
            ← Back
          </button>
          <span style={{ fontSize: 12, color: text3, fontWeight: 500 }}>Step {step} of 4</span>
          <button
            onClick={step < 4 ? next : submit}
            disabled={loading}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '11px 24px', borderRadius: 4, fontSize: 14, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer', border: 'none', background: loading ? border : blue, color: loading ? text3 : 'white', fontFamily: 'inherit', transition: 'all 0.15s' }}
          >
            {loading ? 'Sending...' : step < 4 ? 'Continue →' : 'Submit brief ✓'}
          </button>
        </div>
      </div>

      <div style={{ marginTop: 28, fontSize: 12, color: '#999', textAlign: 'center', lineHeight: 1.6 }}>
        Palsgaard A/S &nbsp;·&nbsp; Market Intelligence &nbsp;·&nbsp; Internal use only
      </div>
    </div>
  );
}