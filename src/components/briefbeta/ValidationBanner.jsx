import React, { useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';

// Hybrid fallback notice — the deck is shown even though it still breaks rules
// after every rewrite attempt, so the analyst can fix the fields by hand instead
// of being hard-blocked at save.
export default function ValidationBanner({ rejections, attempts }) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed || !rejections || rejections.length === 0) return null;

  return (
    <div className="rounded-[10px] border p-4" style={{ background: '#FDF6E3', borderColor: '#F2C75C' }}>
      <div className="flex items-start gap-2">
        <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" style={{ color: '#92600A' }} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold" style={{ color: '#92600A' }}>
            Dækket består ikke valideringen efter {attempts} forsøg
          </p>
          <p className="text-xs mt-0.5" style={{ color: '#92600A' }}>
            Det vises alligevel, så du kan rette felterne direkte eller bede arkitekten prøve igen. Gemning blokeres indtil de er rettet.
          </p>
          <ul className="mt-2 space-y-1">
            {rejections.slice(0, 8).map((r, i) => (
              <li key={i} className="text-xs" style={{ color: '#7A5208' }}>
                <span className="font-semibold">[{r.rule}]</span> {r.field}: {r.why}
                {r.text ? <span className="block truncate opacity-80">“{r.text}”</span> : null}
              </li>
            ))}
          </ul>
        </div>
        <button onClick={() => setDismissed(true)} className="p-1 rounded shrink-0" style={{ color: '#92600A' }}>
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}