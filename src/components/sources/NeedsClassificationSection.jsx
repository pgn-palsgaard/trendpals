import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sparkles, Check, Loader2, FileText } from 'lucide-react';
import { toast } from 'sonner';

const TYPE_LABELS = {
  knowledge: 'Knowledge / Internal Doc',
  mintel: 'Mintel Report',
  market_intel: 'Market Intelligence',
  url: 'Web Article',
};

function ClassifyRow({ source, onDone }) {
  const proposed = source.classification?.proposed_source_type || 'market_intel';
  const [chosenType, setChosenType] = useState(proposed);
  const [applying, setApplying] = useState(false);

  const apply = async () => {
    setApplying(true);
    try {
      const corrected = chosenType !== proposed;
      await base44.entities.Source.update(source.id, {
        source_type: chosenType,
        pipeline_stage: 'uploaded',
        review_status: 'pending',
        classification: {
          ...(source.classification || {}),
          status: corrected ? 'corrected' : 'confirmed',
          proposed_source_type: chosenType,
          decided_at: new Date().toISOString(),
        },
      });
      // Enter the normal flow: metadata extraction routes per type
      base44.functions.invoke('autoExtractMetadata', { source_id: source.id }).catch(() => {});
      toast.success(`Classified as ${TYPE_LABELS[chosenType]}`);
      onDone();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setApplying(false);
    }
  };

  const c = source.classification || {};

  return (
    <div className="flex items-start justify-between gap-4 p-4 bg-white border border-purple-200 rounded-xl">
      <div className="flex items-start gap-3 min-w-0">
        <FileText className="w-4 h-4 text-slate-400 shrink-0 mt-1" />
        <div className="min-w-0">
          <p className="font-medium text-slate-900 truncate">{source.title || 'Untitled'}</p>
          <div className="flex flex-wrap items-center gap-2 mt-1">
            <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-purple-100 text-purple-700">
              <Sparkles className="w-3 h-3" />
              Proposed: {TYPE_LABELS[proposed] || proposed}
            </span>
            <span className="text-xs text-slate-500">{Math.round(c.confidence ?? 0)}% confidence</span>
            {c.document_type && <span className="text-xs px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">{c.document_type}</span>}
            {(c.category_relevance || []).slice(0, 3).map(cat => (
              <span key={cat} className="text-xs px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">{cat}</span>
            ))}
          </div>
          {c.reasoning && <p className="text-xs text-slate-500 italic mt-1">{c.reasoning}</p>}
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0" onClick={e => e.stopPropagation()}>
        <Select value={chosenType} onValueChange={setChosenType}>
          <SelectTrigger className="w-52 h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(TYPE_LABELS).map(([v, l]) => (
              <SelectItem key={v} value={v}>{l}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button size="sm" className="bg-purple-600 hover:bg-purple-700" disabled={applying} onClick={apply}>
          {applying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5 mr-1" />}
          {chosenType === proposed ? 'Confirm' : 'Apply correction'}
        </Button>
      </div>
    </div>
  );
}

export default function NeedsClassificationSection({ sources, onRefresh }) {
  if (!sources.length) return null;
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Sparkles className="w-4 h-4 text-purple-600" />
        <h3 className="text-sm font-semibold text-slate-900">
          Needs classification ({sources.length})
        </h3>
        <span className="text-xs text-slate-500">— AI was not confident enough to auto-classify. Confirm or correct.</span>
      </div>
      {sources.map(s => <ClassifyRow key={s.id} source={s} onDone={onRefresh} />)}
    </div>
  );
}