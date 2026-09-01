import React from 'react';
import { Briefcase, BarChart3, Search, FlaskConical, MessageCircle } from 'lucide-react';

// The canonical job-to-be-done options. Shared by the brief intake (SubmitBrief)
// and the Report Architect so both flows open on the same question. The ids are
// the ReportRequest.jtbd enum values — never rename them.
export const JTBD_OPTIONS = [
  { id: 'prepare_customer_meeting', icon: Briefcase, label: 'Prepare a customer meeting', desc: 'Get insight for an upcoming customer visit.' },
  { id: 'build_trend_deck', icon: BarChart3, label: 'Build a trend deck', desc: 'Shape a trend overview for your team or customer.' },
  { id: 'understand_market', icon: Search, label: 'Understand a market', desc: "Explore what's happening in a category or region." },
  { id: 'support_innovation_pipeline', icon: FlaskConical, label: 'Support innovation', desc: 'Find evidence to back an NPD direction.' },
  { id: 'other', icon: MessageCircle, label: 'Something else', desc: 'Describe what you need — the assistant will help.' },
];

export function jtbdLabelFor(id) {
  return JTBD_OPTIONS.find(o => o.id === id)?.label || '';
}

export default function JtbdPicker({ selectedId, onSelect, heading = 'Select what you need help with.', descriptions }) {
  return (
    <div className="max-w-3xl mx-auto">
      <h2 className="text-lg font-semibold text-stone-800 text-center">{heading}</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-6">
        {JTBD_OPTIONS.map(opt => {
          const Icon = opt.icon;
          const selected = selectedId === opt.id;
          return (
            <button
              key={opt.id}
              onClick={() => onSelect(opt.id)}
              className={`text-left rounded-xl p-4 border transition cursor-pointer ${
                selected ? 'border-[#1D428A] bg-blue-50' : 'border-stone-200 bg-white hover:border-[#1D428A] hover:bg-blue-50'
              }`}
            >
              <Icon className="w-6 h-6 text-[#1D428A] mb-2" />
              <p className="text-sm font-semibold text-stone-800">{opt.label}</p>
              <p className="text-xs text-stone-500 mt-1 leading-relaxed">{descriptions?.[opt.id] || opt.desc}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}