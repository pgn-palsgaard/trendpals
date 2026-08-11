import React from 'react';
import { ACCESS_MAP, roleLabel, ROLE_BADGE_CLASS } from '@/lib/accessMap';
import { ShieldCheck } from 'lucide-react';

export default function AccessMapSection() {
  return (
    <div className="pal-card p-5">
      <div className="flex items-center gap-2 mb-1">
        <ShieldCheck className="w-4 h-4" style={{ color: '#1D428A' }} />
        <h2 className="text-sm font-semibold" style={{ color: '#1D2B47' }}>Access map</h2>
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        What each role sees and can reach. Changing a user's role takes effect the next time they log in.
      </p>

      <div className="grid gap-3 md:grid-cols-2">
        {ACCESS_MAP.map(entry => (
          <div key={entry.role} className="rounded-[10px] border border-border p-4">
            <span className={ROLE_BADGE_CLASS[entry.role]}>{roleLabel(entry.role)}</span>
            <p className="text-xs text-muted-foreground mt-2.5 leading-relaxed">{entry.ui}</p>
            <ul className="mt-2 space-y-1">
              {entry.routes.map(r => (
                <li key={r} className="text-xs" style={{ color: '#3A4A66' }}>· {r}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}