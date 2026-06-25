import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Sparkles, Loader2 } from 'lucide-react';
import { VALID_CATEGORY_VALUES, getDisplayLabel } from '@/lib/palsgaardCategoryMapping';

const SOURCE_TYPES = ['mintel', 'market_intel', 'gnpd', 'report', 'url', 'knowledge', 'other'];
const REGIONS = ['ASPAC', 'AMERICAS', 'EMEC', 'IMEA', 'Global'];
const CATEGORIES = VALID_CATEGORY_VALUES.map(v => ({ value: v, label: getDisplayLabel(v) }));

const FIELDS = [
  { key: 'title', label: 'Title', type: 'text' },
  { key: 'source_type', label: 'Source Type', type: 'select', options: SOURCE_TYPES },
  { key: 'publisher', label: 'Publisher', type: 'text' },
  { key: 'date_published', label: 'Published', type: 'date' },
  { key: 'region_code', label: 'Region', type: 'select', options: REGIONS },
  { key: 'category', label: 'Category', type: 'select', options: CATEGORIES },
];

/**
 * Inline metadata editor shown in the source detail drawer when the source is
 * awaiting metadata verification, or already approved (admin correction path).
 * Edits save immediately but never touch verified/approved, pipeline_stage or excerpts.
 */
export default function MetadataEditSection({ source, onSourceChange }) {
  const me = source.metadata_extraction || {};
  const correctedFields = me.corrected_fields || [];
  const [savingField, setSavingField] = useState(null);
  const [drafts, setDrafts] = useState({});

  const saveField = async (key, value) => {
    if (value === (source[key] ?? '')) return;
    setSavingField(key);
    try {
      // Snapshot original AI proposal once, never overwrite it
      const aiProposed = me.ai_proposed || Object.fromEntries(FIELDS.map(f => [f.key, source[f.key] ?? null]));
      const newMe = {
        ...me,
        ai_proposed: aiProposed,
        human_corrected: true,
        corrected_fields: Array.from(new Set([...correctedFields, key])),
      };
      await base44.entities.Source.update(source.id, {
        [key]: value || null,
        metadata_extraction: newMe,
      });
      onSourceChange?.({ ...source, [key]: value || null, metadata_extraction: newMe });
      toast.success('Saved');
    } catch (e) {
      toast.error(e.message);
    } finally {
      setSavingField(null);
    }
  };

  return (
    <div className="p-4 bg-white border border-slate-200 rounded-lg space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Metadata (editable)</p>
        {me.human_corrected && (
          <span className="text-xs text-blue-600 font-medium">human corrected</span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3">
        {FIELDS.map(({ key, label, type, options }) => {
          const aiProposed = !correctedFields.includes(key);
          const value = drafts[key] !== undefined ? drafts[key] : (source[key] ?? '');
          return (
            <div key={key} className={key === 'title' ? 'col-span-2' : ''}>
              <div className="flex items-center gap-1.5 mb-0.5">
                <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{label}</label>
                {aiProposed && (
                  <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-px rounded-full bg-violet-50 text-violet-600 border border-violet-200">
                    <Sparkles className="w-2.5 h-2.5" />
                    AI-proposed
                  </span>
                )}
                {savingField === key && <Loader2 className="w-3 h-3 animate-spin text-slate-400" />}
              </div>
              {type === 'select' ? (
                <Select value={value || undefined} onValueChange={v => saveField(key, v)}>
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue placeholder="—" />
                  </SelectTrigger>
                  <SelectContent>
                    {options.map(o => {
                      const val = typeof o === 'string' ? o : o.value;
                      const lbl = typeof o === 'string' ? o : o.label;
                      return <SelectItem key={val} value={val}>{lbl}</SelectItem>;
                    })}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  type={type}
                  className="h-8 text-sm"
                  value={value}
                  onChange={e => setDrafts(d => ({ ...d, [key]: e.target.value }))}
                  onBlur={e => saveField(key, e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); }}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}