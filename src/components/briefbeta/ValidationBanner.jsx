import React, { useState } from 'react';
import { AlertTriangle, ShieldAlert, X } from 'lucide-react';

// Build D — the two-layer notice. A LEN overrun is cosmetic and reversible, so it
// is an amber warning the analyst may save through. An integrity violation is a
// trust failure, so it is a red hard wall with no override.
export default function ValidationBanner({ rejections, attempts, verdict = 'blocked' }) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed || !rejections || rejections.length === 0) return null;

  const warnOnly = verdict === 'warnings_only';
  const skin = warnOnly
    ? { bg: '#FDF6E3', border: '#F2C75C', head: '#92600A', body: '#7A5208' }
    : { bg: '#FAE9E5', border: '#C15338', head: '#A33B24', body: '#8C3220' };
  const Icon = warnOnly ? AlertTriangle : ShieldAlert;

  return (
    <div className="rounded-[10px] border p-4" style={{ background: skin.bg, borderColor: skin.border }}>
      <div className="flex items-start gap-2">
        <Icon className="w-4 h-4 mt-0.5 shrink-0" style={{ color: skin.head }} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold" style={{ color: skin.head }}>
            {warnOnly
              ? `Tekst er for lang til skabelonen efter ${attempts} forsøg`
              : 'Dækket blokeres af evidens-validering'}
          </p>
          <p className="text-xs mt-0.5" style={{ color: skin.head }}>
            {warnOnly
              ? 'Du kan gemme alligevel — teksten bliver klippet i eksporten, indtil du forkorter felterne herunder i redigeringsvisningen.'
              : 'Dette kan ikke omgås: en kilde kan ikke spores i evidensen, hører til en anden trend eller et andet marked. Ret felterne herunder, eller bed arkitekten bygge igen.'}
          </p>
          <ul className="mt-2 space-y-1">
            {rejections.slice(0, 8).map((r, i) => (
              <li key={i} className="text-xs" style={{ color: skin.body }}>
                <span className="font-semibold">[{r.rule}]</span> {r.field}: {r.why}
                {r.text ? <span className="block truncate opacity-80">“{r.text}”</span> : null}
              </li>
            ))}
          </ul>
        </div>
        <button onClick={() => setDismissed(true)} className="p-1 rounded shrink-0" style={{ color: skin.head }}>
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}