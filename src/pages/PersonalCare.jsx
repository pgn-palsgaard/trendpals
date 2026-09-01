import React, { useState } from 'react';
import PersonalCareSourcesTab from '@/components/personalcare/PersonalCareSourcesTab';
import PersonalCareGnpdTab from '@/components/personalcare/PersonalCareGnpdTab';
import PersonalCareProductsTab from '@/components/personalcare/PersonalCareProductsTab';

const TABS = [
  ['sources', 'Sources'],
  ['gnpd', 'GNPD uploads'],
  ['products', 'Products'],
];

export default function PersonalCare() {
  const [tab, setTab] = useState('sources');

  return (
    <div className="page-shell">
      <div className="page-inner">
        <div className="page-header">
          <h1 className="page-title">Personal Care</h1>
          <p className="page-subtitle">
            BSA division data — kept fully separate from Food. Sources and product launches uploaded
            here are tagged BSA and never appear in the Food libraries.
          </p>
        </div>

        <div className="flex gap-1 border-b border-border mb-6">
          {TABS.map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className="px-4 py-2.5 text-sm font-semibold -mb-px border-b-2 transition-colors"
              style={{
                color: tab === key ? '#1D428A' : 'hsl(var(--muted-foreground))',
                borderColor: tab === key ? '#1D428A' : 'transparent',
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === 'sources' && <PersonalCareSourcesTab />}
        {tab === 'gnpd' && <PersonalCareGnpdTab />}
        {tab === 'products' && <PersonalCareProductsTab />}
      </div>
    </div>
  );
}