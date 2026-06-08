import React, { useState, useMemo } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import RagSourceTable from './RagSourceTable';

const CAPABILITY_AREAS = [
  'sustainability', 'texture_quality', 'cost_efficiency', 'compliance_regulatory',
  'new_product_development', 'food_safety', 'supply_chain', 'plant_based', 'general',
];

const CAPABILITY_COLORS = {
  sustainability:          'bg-green-100 text-green-700',
  texture_quality:         'bg-blue-100 text-blue-700',
  cost_efficiency:         'bg-amber-100 text-amber-700',
  compliance_regulatory:   'bg-red-100 text-red-700',
  new_product_development: 'bg-purple-100 text-purple-700',
  food_safety:             'bg-red-100 text-red-700',
  supply_chain:            'bg-orange-100 text-orange-700',
  plant_based:             'bg-green-100 text-green-700',
  general:                 'bg-slate-100 text-slate-600',
};

function CapabilityBadges({ excerpts = [] }) {
  const areas = [...new Set((excerpts).map(e => e.capability_area).filter(Boolean))];
  const visible = areas.slice(0, 3);
  const extra = areas.length - visible.length;
  return (
    <div className="flex flex-wrap gap-1">
      {visible.map(a => (
        <span key={a} className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${CAPABILITY_COLORS[a] || 'bg-slate-100 text-slate-600'}`}>
          {a.replace(/_/g, ' ')}
        </span>
      ))}
      {extra > 0 && <span className="text-xs text-slate-400">+{extra}</span>}
    </div>
  );
}

export default function KnowledgeLibrary() {
  const [capabilityFilter, setCapabilityFilter] = useState('all');

  const applyExtraFilters = useMemo(() => {
    if (capabilityFilter === 'all') return undefined;
    return (rows) => rows.filter(s =>
      (s.excerpts || []).some(e => e.capability_area === capabilityFilter)
    );
  }, [capabilityFilter]);

  const extraColumns = [
    {
      key: 'capability_areas',
      header: 'Capability Areas',
      render: (s) => <CapabilityBadges excerpts={s.excerpts || []} />,
    },
  ];

  const ExtraFilterBar = (
    <div className="flex items-center gap-3">
      <Select value={capabilityFilter} onValueChange={setCapabilityFilter}>
        <SelectTrigger className="w-52">
          <SelectValue placeholder="All capability areas" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All capability areas</SelectItem>
          {CAPABILITY_AREAS.map(a => (
            <SelectItem key={a} value={a}>{a.replace(/_/g, ' ')}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );

  return (
    <RagSourceTable
      sourceTypeFilter="knowledge"
      title="Knowledge Sources"
      subtitle="Palsgaard product sheets, technical docs, capabilities, and internal references"
      applyExtraFilters={applyExtraFilters}
      ExtraFilterBar={ExtraFilterBar}
      extraColumns={extraColumns}
    />
  );
}