import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { CATEGORY_LABELS } from '@/lib/palsgaardCategoryMapping';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { X } from 'lucide-react';

const CATEGORIES = [
  'bakery', 'condiments', 'chocolate_confectionery', 'dairy', 'ice_cream',
  'meat', 'oils_fats', 'plant_based', 'rutf_rusf', 'needs_human_review',
].map(value => ({ value, label: CATEGORY_LABELS[value] }));

// Pre-fill a GlobalTrend creation form from an EmergingSignalCluster.
// On submit: create GlobalTrend (is_active=true), then mark cluster promoted.
export default function PromoteSignalModal({ cluster, onClose, onPromoted }) {
  // Aggregate + dedupe keywords is done at fetch time in the parent and passed in;
  // here we seed straight from the cluster.
  const seededKeywords = cluster._aggregatedKeywords || [];

  const [form, setForm] = useState({
    trend_name: cluster.theme_short_label || '',
    category: cluster.category || 'needs_human_review',
    market_signal: cluster.theme_description || '',
    trend_keywords: seededKeywords.join(', '),
    description: cluster.theme_description || '',
    // Creation guard — deliberately starts unset. A trend created without this flag
    // would be structurally invisible to the trend-link drain (which treats null as
    // false) until someone remembered to set it, so the null default has to be a
    // gate at creation, not a trap discovered later.
    product_observable: null,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async () => {
    if (!form.trend_name.trim()) { setError('Trend name is required.'); return; }
    if (form.product_observable === null) {
      setError('Choose whether this trend is observable in GNPD product data. A trend cannot be activated without it — the drain skips unmarked trends.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const sourceIds = [...new Set((cluster.excerpt_refs || []).map(r => r.source_id))];
      const sources = sourceIds.map(id => ({ source_id: id, review_status: 'manual_curated' }));

      const gnpdEvidence = cluster.gnpd_product_ids || [];
      const regional_manifestations = gnpdEvidence.length
        ? [{ region: 'Global', signal: form.market_signal, intensity: 'emerging', gnpd_evidence: gnpdEvidence, last_updated: new Date().toISOString().slice(0, 10) }]
        : [];

      const trend = await base44.entities.GlobalTrend.create({
        trend_name: form.trend_name.trim(),
        category: form.category,
        market_signal: form.market_signal,
        description: form.description,
        trend_keywords: form.trend_keywords.split(',').map(s => s.trim()).filter(Boolean),
        signal_type: cluster.signal_type,
        sources,
        regional_manifestations,
        confidence: 'medium',
        product_observable: form.product_observable,
        is_active: true,
      });

      await base44.entities.EmergingSignalCluster.update(cluster.id, {
        status: 'promoted_to_trend',
        promoted_to_globaltrend_id: trend.id,
      });

      onPromoted(trend);
    } catch (err) {
      setError(err.message || 'Failed to promote.');
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="bg-card rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <h2 className="font-semibold text-foreground">Promote to trend</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-muted text-muted-foreground"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <p className="text-xs text-muted-foreground">
            Pre-filled from the emerging signal. Review and edit before creating the trend. The cluster's {(cluster.excerpt_refs || []).length} excerpts across {cluster.source_diversity_count || 0} sources will be linked.
          </p>

          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Trend name</label>
            <Input value={form.trend_name} onChange={e => set('trend_name', e.target.value)} />
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Category</label>
            <select className="w-full border border-border rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
              value={form.category} onChange={e => set('category', e.target.value)}>
              {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Market signal</label>
            <textarea className="w-full border border-border rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring min-h-[80px] resize-none"
              value={form.market_signal} onChange={e => set('market_signal', e.target.value)} />
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Description</label>
            <textarea className="w-full border border-border rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring min-h-[100px] resize-y"
              value={form.description} onChange={e => set('description', e.target.value)} />
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Trend keywords (comma-separated)</label>
            <Input value={form.trend_keywords} onChange={e => set('trend_keywords', e.target.value)} />
          </div>

          <div className="rounded-lg border border-border bg-muted/40 p-3">
            <label className="text-xs font-medium text-foreground mb-1 block">Observable in GNPD product data?</label>
            <p className="text-xs text-muted-foreground mb-2">
              Required. Some trends are real but invisible on packaging — nobody labels a product "value engineered". Unobservable trends are skipped by the trend-link drain and carried as narrative evidence instead of being attempted and returning zero.
            </p>
            <div className="flex flex-col gap-1.5">
              <label className="flex items-start gap-2 text-xs text-foreground cursor-pointer">
                <input type="radio" className="mt-0.5" checked={form.product_observable === true}
                  onChange={() => set('product_observable', true)} />
                <span><span className="font-medium">Yes</span> — products embodying this trend are identifiable from names, descriptions or claims.</span>
              </label>
              <label className="flex items-start gap-2 text-xs text-foreground cursor-pointer">
                <input type="radio" className="mt-0.5" checked={form.product_observable === false}
                  onChange={() => set('product_observable', false)} />
                <span><span className="font-medium">No</span> — narrative trend only; not visible in product data.</span>
              </label>
            </div>
          </div>

          {cluster.gnpd_product_ids?.length > 0 && (
            <p className="text-xs text-muted-foreground">{cluster.gnpd_product_ids.length} GNPD products will be attached as regional evidence.</p>
          )}

          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>

        <div className="px-5 py-4 border-t border-border flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button className="bg-pal-blue hover:bg-pal-blue/90" onClick={handleSubmit} disabled={saving}>
            {saving ? 'Creating…' : 'Create trend'}
          </Button>
        </div>
      </div>
    </div>
  );
}