import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';

const REGIONS = ['ASPAC', 'AMERICAS', 'EMEC', 'IMEA', 'Global'];
const CATEGORIES = ['Bakery', 'Confectionery', 'Dairy', 'Feed', 'Fine Food', 'Ice Cream', 'Lipid', 'Meat', 'Other Food Applications'];
const PURPOSES = [
  'Customer meeting preparation',
  'Innovation day',
  'Technical workshop',
  'Prospecting / new lead',
  'Other',
];
const PAINS = [
  'Clean label / natural ingredients',
  'Cost pressure / reformulation',
  'Texture & quality challenges',
  'Sustainability / CSRD compliance',
  'Plant-based formulation',
  'Sugar / fat / calorie reduction',
  'Regulatory changes',
  'Shelf life & food safety',
];

export default function SubmitBrief() {
  const [step, setStep] = useState(1);
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [form, setForm] = useState({
    requester_name: '',
    requester_email: '',
    report_type: 'account',
    account: '',
    contact_name: '',
    region: '',
    region_zoom: '',
    categories: '',
    purpose: '',
    pains: [],
    context: '',
    deadline: '',
  });

  const set = (field, value) => setForm(f => ({ ...f, [field]: value }));

  const togglePain = (pain) => {
    setForm(f => ({
      ...f,
      pains: f.pains.includes(pain) ? f.pains.filter(p => p !== pain) : [...f.pains, pain],
    }));
  };

  const validate = () => {
    if (step === 1) {
      if (!form.requester_name.trim()) return 'Angiv dit navn';
      if (form.report_type === 'account' && !form.account.trim()) return 'Angiv kundenavn';
    }
    if (step === 2) {
      if (!form.region) return 'Vælg region';
      if (!form.categories) return 'Vælg kategori';
      if (!form.purpose) return 'Vælg formål';
    }
    return null;
  };

  const next = () => {
    const err = validate();
    if (err) { setError(err); return; }
    setError('');
    setStep(s => s + 1);
  };

  const back = () => { setError(''); setStep(s => s - 1); };

  const submit = async () => {
    setLoading(true);
    setError('');
    try {
      await base44.functions.invoke('submitBrief', {
        requester_name: form.requester_name,
        requester_email: form.requester_email,
        report_type: form.report_type,
        account: form.account,
        contact_name: form.contact_name,
        region: form.region,
        region_zoom: form.region_zoom,
        categories: form.categories,
        purpose: form.purpose,
        pains: form.pains.join(', '),
        context: form.context,
        deadline: form.deadline || null,
        submitted_at: new Date().toISOString(),
      });
      setSubmitted(true);
    } catch (e) {
      setError('Noget gik galt — prøv igen. ' + (e.message || ''));
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl shadow-lg p-10 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-slate-900 mb-2">Brief modtaget!</h2>
          <p className="text-slate-600 mb-8">
            Tak, {form.requester_name.split(' ')[0]}. Vi vender tilbage hurtigst muligt med din market intelligence brief.
          </p>
          <button
            onClick={() => { setSubmitted(false); setStep(1); setForm({ requester_name: '', requester_email: '', report_type: 'account', account: '', contact_name: '', region: '', region_zoom: '', categories: '', purpose: '', pains: [], context: '', deadline: '' }); }}
            className="text-sm text-slate-500 hover:text-slate-700 underline"
          >
            Indsend et nyt brief
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl shadow-lg w-full max-w-xl overflow-hidden">
        {/* Header */}
        <div className="bg-blue-700 px-8 py-6">
          <img
            src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/6987a5428ef229e6ee55cbb6/16cea8b8e_Palsgaardlogo_blue_250x250.png"
            alt="Palsgaard"
            className="h-8 mb-4 brightness-0 invert"
          />
          <h1 className="text-white text-xl font-semibold">Market Intelligence Brief</h1>
          <p className="text-blue-200 text-sm mt-1">Udfyld formularen og vi udarbejder din brief</p>
        </div>

        {/* Progress */}
        <div className="flex border-b">
          {['Kontakt', 'Marked', 'Detaljer'].map((label, i) => (
            <div key={i} className={`flex-1 py-3 text-center text-xs font-medium transition-colors ${step === i + 1 ? 'text-blue-700 border-b-2 border-blue-700' : step > i + 1 ? 'text-green-600' : 'text-slate-400'}`}>
              {step > i + 1 ? '✓ ' : ''}{label}
            </div>
          ))}
        </div>

        <div className="p-8">
          {/* Step 1 */}
          {step === 1 && (
            <div className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Dit navn *</label>
                <input
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={form.requester_name}
                  onChange={e => set('requester_name', e.target.value)}
                  placeholder="Fornavn Efternavn"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Din email</label>
                <input
                  type="email"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={form.requester_email}
                  onChange={e => set('requester_email', e.target.value)}
                  placeholder="navn@palsgaard.com"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Type brief *</label>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { value: 'account', label: 'Account Intelligence', desc: 'Til et specifikt kunde-møde' },
                    { value: 'category', label: 'Category Intelligence', desc: 'Til en kategori / marked' },
                  ].map(opt => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => set('report_type', opt.value)}
                      className={`text-left p-3 rounded-lg border-2 transition-all ${form.report_type === opt.value ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:border-slate-300'}`}
                    >
                      <div className="text-sm font-medium text-slate-900">{opt.label}</div>
                      <div className="text-xs text-slate-500 mt-0.5">{opt.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {form.report_type === 'account' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Kundenavn *</label>
                    <input
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      value={form.account}
                      onChange={e => set('account', e.target.value)}
                      placeholder="f.eks. Arla Foods"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Kontaktperson hos kunden</label>
                    <input
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      value={form.contact_name}
                      onChange={e => set('contact_name', e.target.value)}
                      placeholder="Navn og titel"
                    />
                  </div>
                </>
              )}
            </div>
          )}

          {/* Step 2 */}
          {step === 2 && (
            <div className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Region *</label>
                <select
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={form.region}
                  onChange={e => set('region', e.target.value)}
                >
                  <option value="">Vælg region</option>
                  {REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>

              {form.report_type === 'category' && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Specifik geografisk fokus</label>
                  <input
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={form.region_zoom}
                    onChange={e => set('region_zoom', e.target.value)}
                    placeholder="f.eks. Nordvesteuropa, Sydøstasien..."
                  />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Kategori *</label>
                <select
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={form.categories}
                  onChange={e => set('categories', e.target.value)}
                >
                  <option value="">Vælg kategori</option>
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Formål *</label>
                <select
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={form.purpose}
                  onChange={e => set('purpose', e.target.value)}
                >
                  <option value="">Vælg formål</option>
                  {PURPOSES.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Deadline (møde-dato)</label>
                <input
                  type="date"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={form.deadline}
                  onChange={e => set('deadline', e.target.value)}
                />
              </div>
            </div>
          )}

          {/* Step 3 */}
          {step === 3 && (
            <div className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Hvilke udfordringer er relevante?</label>
                <div className="grid grid-cols-1 gap-2">
                  {PAINS.map(pain => (
                    <button
                      key={pain}
                      type="button"
                      onClick={() => togglePain(pain)}
                      className={`text-left px-3 py-2.5 rounded-lg border text-sm transition-all ${form.pains.includes(pain) ? 'border-blue-500 bg-blue-50 text-blue-800' : 'border-slate-200 text-slate-700 hover:border-slate-300'}`}
                    >
                      {form.pains.includes(pain) ? '✓ ' : ''}{pain}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Ekstra kontekst</label>
                <textarea
                  rows={3}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  value={form.context}
                  onChange={e => set('context', e.target.value)}
                  placeholder="Beskriv kort hvad du ved om kunden / situationen, som kan hjælpe os med at skræddersy briefen..."
                />
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="mt-4 text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</div>
          )}

          {/* Navigation */}
          <div className="flex items-center justify-between mt-8">
            {step > 1 ? (
              <button onClick={back} className="text-sm text-slate-500 hover:text-slate-700">← Tilbage</button>
            ) : <div />}

            {step < 3 ? (
              <button
                onClick={next}
                className="bg-blue-700 hover:bg-blue-800 text-white text-sm font-medium px-6 py-2.5 rounded-lg transition-colors"
              >
                Næste →
              </button>
            ) : (
              <button
                onClick={submit}
                disabled={loading}
                className="bg-blue-700 hover:bg-blue-800 disabled:opacity-60 text-white text-sm font-medium px-6 py-2.5 rounded-lg transition-colors"
              >
                {loading ? 'Sender...' : 'Indsend brief ✓'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}