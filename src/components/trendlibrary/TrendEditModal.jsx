import React, { useState, useEffect } from 'react';
import { CATEGORY_LABELS } from '@/lib/palsgaardCategoryMapping';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { X } from 'lucide-react';
import TrendSourcesEditor from './TrendSourcesEditor';

import { base44 } from '@/api/base44Client';

const CATEGORIES = [
  'bakery', 'condiments', 'chocolate_confectionery', 'dairy', 'ice_cream',
  'meat', 'oils_fats', 'plant_based', 'rutf_rusf', 'needs_human_review',
].map(value => ({ value, label: CATEGORY_LABELS[value] }));
const CAPABILITY_AREAS = [
  'sustainability', 'texture_quality', 'cost_efficiency', 'compliance_regulatory',
  'new_product_development', 'food_safety', 'supply_chain', 'plant_based', 'general',
];
const CAPABILITY_LABELS = {
  sustainability: 'Sustainability', texture_quality: 'Texture & Quality',
  cost_efficiency: 'Cost Efficiency', compliance_regulatory: 'Compliance',
  new_product_development: 'NPD', food_safety: 'Food Safety',
  supply_chain: 'Supply Chain', plant_based: 'Plant-Based', general: 'General',
};

export default function TrendEditModal({ trend, onSave, onClose, saving }) {
  const [megaTrendOptions, setMegaTrendOptions] = useState([]);
  useEffect(() => {
    base44.entities.MegaTrend.filter({ is_active: true }).then(mts => {
      setMegaTrendOptions(mts.map(mt => mt.mega_trend_name).sort());
    }).catch(() => {});
  }, []);

  const [form, setForm] = useState({
    trend_name: trend.trend_name || '',
    market_signal: trend.market_signal || '',
    whats_changing: (trend.whats_changing || []).join('\n'),
    why_now: trend.why_now || '',
    capability_area: trend.capability_area || 'general',
    trend_keywords: (trend.trend_keywords || []).join(', '),
    confidence: trend.confidence || 'medium',
    category: trend.category || 'Other',
    mega_trend: trend.mega_trend || '',
    description: trend.description || '',
    sources: trend.sources || [],
    is_active: trend.is_active || false,
    // Nullable by design — see GlobalTrend.product_observable. The trend-link drain
    // treats null as false (skips the trend), so activation requires an explicit answer.
    product_observable: typeof trend.product_observable === 'boolean' ? trend.product_observable : null,
  });
  const [error, setError] = useState(null);

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }));

  const handleSave = () => {
    if (form.is_active && form.product_observable === null) {
      setError('An active trend must state whether it is observable in GNPD product data. Unmarked trends are skipped by the trend-link drain.');
      return;
    }
    setError(null);
    const payload = {
      ...form,
      whats_changing: form.whats_changing.split('\n').map(s => s.trim()).filter(Boolean),
      trend_keywords: form.trend_keywords.split(',').map(s => s.trim()).filter(Boolean),
      mega_trend: form.mega_trend || null,
      description: form.description || null,
    };
    onSave(payload);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="font-semibold text-slate-900">Edit Trend</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-slate-100 text-slate-500">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <div>
            <label className="text-xs font-medium text-slate-600 mb-1 block">Trend Name</label>
            <Input value={form.trend_name} onChange={e => set('trend_name', e.target.value)} />
          </div>

          <div>
            <label className="text-xs font-medium text-slate-600 mb-1 block">
              Description
              <span className="ml-1 text-slate-400 font-normal">— 3-5 paragraphs covering context, drivers, evidence, and what this means for ingredient suppliers</span>
            </label>
            <textarea
              className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[200px] resize-y"
              placeholder="Write a narrative description of this trend. Separate paragraphs with a blank line."
              value={form.description}
              onChange={e => set('description', e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1 block">Category</label>
              <select className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={form.category} onChange={e => set('category', e.target.value)}>
                {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1 block">Capability Area</label>
              <select className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={form.capability_area} onChange={e => set('capability_area', e.target.value)}>
                {CAPABILITY_AREAS.map(a => <option key={a} value={a}>{CAPABILITY_LABELS[a]}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-slate-600 mb-1 block">Market Signal</label>
            <textarea className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[80px] resize-none"
              value={form.market_signal} onChange={e => set('market_signal', e.target.value)} />
          </div>

          <div>
            <label className="text-xs font-medium text-slate-600 mb-1 block">What's Changing (one bullet per line)</label>
            <textarea className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[80px] resize-none"
              value={form.whats_changing} onChange={e => set('whats_changing', e.target.value)} />
          </div>

          <div>
            <label className="text-xs font-medium text-slate-600 mb-1 block">Why Now</label>
            <textarea className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[60px] resize-none"
              value={form.why_now} onChange={e => set('why_now', e.target.value)} />
          </div>

          <div>
            <label className="text-xs font-medium text-slate-600 mb-1 block">Trend Keywords (comma-separated)</label>
            <Input value={form.trend_keywords} onChange={e => set('trend_keywords', e.target.value)} placeholder="e.g. sustainability, clean label, plant-based" />
          </div>

          <div>
            <label className="text-xs font-medium text-slate-600 mb-1 block">Mega-trend (optional)</label>
            <select className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={form.mega_trend} onChange={e => set('mega_trend', e.target.value)}>
              <option value="">None</option>
              {megaTrendOptions.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <label className="text-xs font-medium text-slate-700 mb-1 block">Observable in GNPD product data?</label>
            <p className="text-xs text-slate-500 mb-2">
              Required before a trend can be Active. Some trends are real but invisible on packaging — nobody labels a product "value engineered". Unobservable trends are skipped by the trend-link drain and carried as narrative evidence instead of returning zero links.
            </p>
            <div className="flex flex-col gap-1.5">
              <label className="flex items-start gap-2 text-xs text-slate-700 cursor-pointer">
                <input type="radio" className="mt-0.5" checked={form.product_observable === true}
                  onChange={() => set('product_observable', true)} />
                <span><span className="font-medium">Yes</span> — identifiable from product names, descriptions or claims.</span>
              </label>
              <label className="flex items-start gap-2 text-xs text-slate-700 cursor-pointer">
                <input type="radio" className="mt-0.5" checked={form.product_observable === false}
                  onChange={() => set('product_observable', false)} />
                <span><span className="font-medium">No</span> — narrative trend only; not visible in product data.</span>
              </label>
            </div>
            {form.product_observable === null && (
              <p className="text-xs text-amber-700 mt-2">Not set — this trend is currently skipped by the drain.</p>
            )}
          </div>

          <TrendSourcesEditor
            sources={form.sources}
            onChange={v => set('sources', v)}
          />

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1 block">Confidence</label>
              <select className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={form.confidence} onChange={e => set('confidence', e.target.value)}>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1 block">Status</label>
              <select className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={form.is_active ? 'active' : 'pending'} onChange={e => set('is_active', e.target.value === 'active')}>
                <option value="pending">Pending Review</option>
                <option value="active">Active</option>
              </select>
            </div>
          </div>
        </div>

        {error && <p className="px-5 pb-2 text-xs text-red-600">{error}</p>}
        <div className="px-5 py-4 border-t border-slate-200 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save Changes'}
          </Button>
        </div>
      </div>
    </div>
  );
}