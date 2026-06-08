import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { X } from 'lucide-react';

const CATEGORIES = ['Ice Cream', 'Dairy', 'Confectionery', 'Bakery', 'Spreads', 'Dressings', 'Other'];
const MEGA_TRENDS = ['GLP-1', 'Cost reformulation', 'Sustainability', 'Plant-based parity', 'Functional & gut health', 'Premium indulgence', 'Protein-as-default'];
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
    is_active: trend.is_active || false,
  });

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }));

  const handleSave = () => {
    const payload = {
      ...form,
      whats_changing: form.whats_changing.split('\n').map(s => s.trim()).filter(Boolean),
      trend_keywords: form.trend_keywords.split(',').map(s => s.trim()).filter(Boolean),
      mega_trend: form.mega_trend || null,
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

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1 block">Category</label>
              <select className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={form.category} onChange={e => set('category', e.target.value)}>
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
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
              {MEGA_TRENDS.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>

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