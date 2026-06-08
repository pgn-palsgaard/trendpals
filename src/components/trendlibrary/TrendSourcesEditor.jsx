import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, ChevronDown, ChevronUp, Trash2, Pencil } from 'lucide-react';

const SOURCE_TYPES = ['mintel', 'trade_press', 'industry_data', 'research_report', 'internal_palsgaard', 'gnpd', 'web_article', 'press_release', 'other'];
const SOURCE_TYPE_LABELS = {
  mintel: 'Mintel', trade_press: 'Trade Press', industry_data: 'Industry Data',
  research_report: 'Research Report', internal_palsgaard: 'Internal Palsgaard',
  gnpd: 'GNPD', web_article: 'Web Article', press_release: 'Press Release', other: 'Other',
};
const PUBLISHER_QUICKPICKS = ['Mintel', 'FoodNavigator', 'Innova Market Insights', 'Datassential', 'IDFA', 'Dairy Reporter', 'Future Market Insights'];

const EMPTY_SOURCE = { title: '', publisher: '', source_type: 'trade_press', url: '', date: '', key_finding: '', quote: '' };

function SourceForm({ initial, onSave, onCancel }) {
  const [s, setS] = useState(initial || { ...EMPTY_SOURCE });
  const set = (k, v) => setS(p => ({ ...p, [k]: v }));

  return (
    <div className="border border-blue-200 bg-blue-50/40 rounded-lg p-4 space-y-3">
      <div>
        <label className="text-xs font-medium text-slate-600 mb-1 block">Publisher</label>
        <div className="flex flex-wrap gap-1 mb-2">
          {PUBLISHER_QUICKPICKS.map(p => (
            <button key={p} type="button"
              onClick={() => set('publisher', p)}
              className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${s.publisher === p ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-200 hover:border-blue-300'}`}>
              {p}
            </button>
          ))}
        </div>
        <Input placeholder="Or type publisher name" value={s.publisher} onChange={e => set('publisher', e.target.value)} className="text-sm" />
      </div>

      <div>
        <label className="text-xs font-medium text-slate-600 mb-1 block">Title</label>
        <Input placeholder="Source title or article headline" value={s.title} onChange={e => set('title', e.target.value)} className="text-sm" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-slate-600 mb-1 block">Source Type</label>
          <select className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={s.source_type} onChange={e => set('source_type', e.target.value)}>
            {SOURCE_TYPES.map(t => <option key={t} value={t}>{SOURCE_TYPE_LABELS[t]}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs font-medium text-slate-600 mb-1 block">Date</label>
          <Input type="date" value={s.date} onChange={e => set('date', e.target.value)} className="text-sm" />
        </div>
      </div>

      <div>
        <label className="text-xs font-medium text-slate-600 mb-1 block">URL (optional)</label>
        <Input placeholder="https://…" value={s.url} onChange={e => set('url', e.target.value)} className="text-sm" />
      </div>

      <div>
        <label className="text-xs font-medium text-slate-600 mb-1 block">Key Finding <span className="text-slate-400 font-normal">(1-2 sentences — what does this source contribute?)</span></label>
        <textarea className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[64px] resize-none"
          placeholder="E.g. Confirms 34% YoY growth in plant-based ice cream launches across Europe…"
          value={s.key_finding} onChange={e => set('key_finding', e.target.value)} />
      </div>

      <div>
        <label className="text-xs font-medium text-slate-600 mb-1 block">Quote <span className="text-slate-400 font-normal">(optional verbatim data point)</span></label>
        <textarea className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[48px] resize-none"
          placeholder={'E.g. "34% of European consumers now regularly purchase plant-based dairy alternatives"'}
          value={s.quote} onChange={e => set('quote', e.target.value)} />
      </div>

      <div className="flex gap-2 justify-end pt-1">
        <Button variant="outline" size="sm" onClick={onCancel} type="button">Cancel</Button>
        <Button size="sm" onClick={() => onSave(s)} type="button" disabled={!s.title && !s.publisher}>Save Source</Button>
      </div>
    </div>
  );
}

export default function TrendSourcesEditor({ sources, onChange }) {
  const [adding, setAdding] = useState(false);
  const [editingIdx, setEditingIdx] = useState(null);
  const [expandedIdx, setExpandedIdx] = useState(null);

  const handleAdd = (s) => {
    onChange([...sources, s]);
    setAdding(false);
  };

  const handleEdit = (idx, s) => {
    const next = sources.map((src, i) => i === idx ? s : src);
    onChange(next);
    setEditingIdx(null);
  };

  const handleRemove = (idx) => {
    onChange(sources.filter((_, i) => i !== idx));
    if (expandedIdx === idx) setExpandedIdx(null);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="text-xs font-medium text-slate-600">Sources</label>
        {!adding && (
          <button type="button" onClick={() => setAdding(true)}
            className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium">
            <Plus className="w-3.5 h-3.5" /> Add source
          </button>
        )}
      </div>

      <div className="space-y-2">
        {sources.map((src, idx) => (
          <div key={idx}>
            {editingIdx === idx ? (
              <SourceForm initial={src} onSave={(s) => handleEdit(idx, s)} onCancel={() => setEditingIdx(null)} />
            ) : (
              <div className="border border-slate-200 rounded-lg bg-white overflow-hidden">
                <div className="flex items-center gap-2 px-3 py-2.5">
                  <button type="button" className="flex-1 text-left min-w-0" onClick={() => setExpandedIdx(expandedIdx === idx ? null : idx)}>
                    <span className="text-sm font-medium text-slate-800 truncate block">{src.publisher || '(no publisher)'}</span>
                    <span className="text-xs text-slate-500 truncate block">{src.title || '(no title)'}</span>
                  </button>
                  <button type="button" onClick={() => setEditingIdx(idx)} className="p-1 text-slate-400 hover:text-slate-600 shrink-0">
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button type="button" onClick={() => handleRemove(idx)} className="p-1 text-slate-400 hover:text-red-500 shrink-0">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                  <button type="button" onClick={() => setExpandedIdx(expandedIdx === idx ? null : idx)} className="p-1 text-slate-400 shrink-0">
                    {expandedIdx === idx ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  </button>
                </div>
                {expandedIdx === idx && src.key_finding && (
                  <div className="px-3 pb-2.5 border-t border-slate-100 pt-2">
                    <p className="text-xs text-slate-600 italic">{src.key_finding}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}

        {adding && (
          <SourceForm onSave={handleAdd} onCancel={() => setAdding(false)} />
        )}

        {sources.length === 0 && !adding && (
          <p className="text-xs text-slate-400 italic">No sources added yet.</p>
        )}
      </div>
    </div>
  );
}