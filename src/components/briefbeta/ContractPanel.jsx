import React from 'react';
import { CheckCircle2, Circle } from 'lucide-react';
import { CONTRACT_FIELDS } from '@/components/briefbeta/architectPrompt';

export default function ContractPanel({ contract, trendCount }) {
  const isFilled = v => Array.isArray(v) ? v.length > 0 : !!v;
  const filled = CONTRACT_FIELDS.filter(f => isFilled(contract[f.key])).length;

  return (
    <div className="pal-card p-5">
      <div className="flex items-center justify-between mb-1">
        <p className="text-sm font-semibold text-foreground">Brief contract</p>
        <span className="badge-blue">{filled}/{CONTRACT_FIELDS.length}</span>
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        The architect must fill this before it can build the deck.
      </p>
      <div className="space-y-2.5">
        {CONTRACT_FIELDS.map(f => {
          const raw = contract[f.key];
          const value = Array.isArray(raw) ? (raw.length ? raw.join(', ') : null) : raw;
          return (
            <div key={f.key} className="flex items-start gap-2 text-sm">
              {value
                ? <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" style={{ color: '#6F8263' }} />
                : <Circle className="w-4 h-4 mt-0.5 shrink-0 text-muted-foreground/40" />}
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">{f.label}</p>
                <p className="text-foreground font-medium break-words">{value || '—'}</p>
              </div>
            </div>
          );
        })}
      </div>
      {trendCount > 0 && (
        <p className="text-xs mt-4 pt-3 border-t border-border" style={{ color: '#1D428A' }}>
          Grounded in {trendCount} verified trend{trendCount === 1 ? '' : 's'} from the library
        </p>
      )}
    </div>
  );
}