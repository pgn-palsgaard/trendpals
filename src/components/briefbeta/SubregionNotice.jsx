import React from 'react';
import { AlertTriangle } from 'lucide-react';

const LABELS = {
  europe: 'European markets', turkey: 'Turkey', cis: 'CIS countries',
  aspac: 'ASPAC markets', americas: 'Americas markets', imea: 'IMEA markets',
  named_countries: 'Individually named countries',
};

// Shown at generation time when the brief spans several sub-regions but the
// rendered evidence comes from only one of them. Surfaced before the deck is built,
// so the analyst decides knowingly instead of discovering it in the appendix.
export default function SubregionNotice({ gate }) {
  const diag = gate?.subregion_diagnosis || [];
  if (diag.length < 2) return null;
  const contributing = diag.filter(d => d.rendered > 0);
  if (contributing.length !== 1) return null;

  const carrier = LABELS[contributing[0].subregion] || contributing[0].subregion;
  const zeros = diag.filter(d => d.rendered === 0);

  return (
    <div className="rounded-[10px] p-4" style={{ background: '#FEF6E7', border: '1px solid #F2C75C' }}>
      <p className="text-sm font-semibold" style={{ color: '#92600A' }}>
        <AlertTriangle className="w-4 h-4 inline mr-1.5" />
        All rendered evidence comes from {carrier} alone
      </p>
      <ul className="mt-2 space-y-1">
        {zeros.map(d => (
          <li key={d.subregion} className="text-xs" style={{ color: '#92600A' }}>
            {LABELS[d.subregion] || d.subregion} —{' '}
            {d.eligible === 0
              ? 'no records in the data (coverage gap)'
              : `${d.eligible} eligible record${d.eligible === 1 ? '' : 's'}, 0 matched a trend (matching gap)`}
          </li>
        ))}
      </ul>
      <p className="text-xs mt-2" style={{ color: '#92600A' }}>
        The brief scope is not narrowed automatically. This is written into the report's methodology slide as stated.
      </p>
    </div>
  );
}