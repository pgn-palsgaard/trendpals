import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CATEGORY_LABELS } from '@/lib/palsgaardCategoryMapping';
import { toast } from 'sonner';
import { Save, Loader2, Pencil } from 'lucide-react';

const REGIONS = ['ASPAC', 'AMERICAS', 'EMEC', 'IMEA', 'Global'];
const CATEGORIES = [
  'bakery', 'condiments', 'chocolate_confectionery', 'dairy', 'ice_cream',
  'meat', 'oils_fats', 'plant_based', 'rutf_rusf', 'needs_human_review',
].map(value => ({ value, label: CATEGORY_LABELS[value] }));

// Manual metadata editor for a GNPD Source record (title, publisher, region, category, date).
export default function GnpdMetadataEditor({ source, onSaved }) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({});

  useEffect(() => {
    setForm({
      title: source?.title || '',
      publisher: source?.publisher || '',
      region_code: source?.region_code || '',
      category: source?.category || '',
      date_published: source?.date_published || '',
    });
    setEditing(false);
  }, [source?.id]);

  const set = (field, val) => setForm(f => ({ ...f, [field]: val }));

  const handleSave = async () => {
    if (!form.title.trim()) { toast.error('Title is required.'); return; }
    setSaving(true);
    try {
      const payload = {
        title: form.title.trim(),
        publisher: form.publisher.trim() || undefined,
        region_code: form.region_code || undefined,
        category: form.category || undefined,
        date_published: form.date_published || undefined,
      };
      await base44.entities.Source.update(source.id, payload);
      toast.success('Metadata updated');
      setEditing(false);
      onSaved?.();
    } catch (e) {
      toast.error('Save failed: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  if (!editing) {
    return (
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-slate-800">Metadata</h3>
          <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
            <Pencil className="w-3.5 h-3.5 mr-1.5" />
            Edit
          </Button>
        </div>
        <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 text-xs">
          {[
            ['Title', source?.title || '—'],
            ['Publisher', source?.publisher || '—'],
            ['Region', source?.region_code || '—'],
            ['Category', source?.category ? (CATEGORY_LABELS[source.category] || source.category) : '—'],
            ['Publication date', source?.date_published || '—'],
          ].map(([k, v]) => (
            <div key={k} className="flex px-3 py-1.5">
              <span className="w-32 shrink-0 text-slate-500">{k}</span>
              <span className="font-medium text-slate-700 break-words">{v}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <h3 className="text-sm font-semibold text-slate-800 mb-3">Edit metadata</h3>
      <div className="space-y-3">
        <div>
          <Label className="text-xs">Title</Label>
          <Input value={form.title} onChange={e => set('title', e.target.value)} className="mt-1" />
        </div>
        <div>
          <Label className="text-xs">Publisher</Label>
          <Input value={form.publisher} onChange={e => set('publisher', e.target.value)} className="mt-1" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Region</Label>
            <Select value={form.region_code || undefined} onValueChange={v => set('region_code', v)}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Select region" /></SelectTrigger>
              <SelectContent>
                {REGIONS.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Category</Label>
            <Select value={form.category || undefined} onValueChange={v => set('category', v)}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Select category" /></SelectTrigger>
              <SelectContent>
                {CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div>
          <Label className="text-xs">Publication date</Label>
          <Input type="date" value={form.date_published} onChange={e => set('date_published', e.target.value)} className="mt-1" />
        </div>
        <div className="flex gap-2 pt-1">
          <Button size="sm" onClick={handleSave} disabled={saving} className="bg-blue-600 hover:bg-blue-700">
            {saving ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Save className="w-3.5 h-3.5 mr-1.5" />}
            Save
          </Button>
          <Button size="sm" variant="outline" onClick={() => setEditing(false)} disabled={saving}>Cancel</Button>
        </div>
      </div>
    </div>
  );
}