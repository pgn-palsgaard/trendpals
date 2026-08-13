import React from 'react';
import { Telescope, Check, X } from 'lucide-react';

const DOES = [
  'Market signals: what is moving in a category and region',
  'Consumer drivers and how they show up in real product launches',
  'Evidence you can bring into a customer conversation',
];

const DOES_NOT = [
  'Palsgaard product recommendations, names or dosages',
  'Recipes, formulations or technical specifications',
  'Answers on what to replace a competitor ingredient with',
];

export default function ScopeIntro() {
  return (
    <div className="max-w-3xl mx-auto mb-8 rounded-xl border border-stone-200 bg-white p-5">
      <div className="flex items-start gap-3">
        <Telescope className="w-5 h-5 shrink-0 mt-0.5" style={{ color: '#1D428A' }} />
        <div>
          <p className="text-sm font-semibold text-stone-800">This tool looks outside-in — at the market, not at our products</p>
          <p className="text-sm text-stone-600 mt-1 leading-relaxed">
            It turns your request into a market intelligence brief built on external evidence: trends,
            consumer drivers and real product launches. It holds <strong>no Palsgaard product knowledge</strong>,
            so describe the customer, their category and what they are trying to achieve — not the product you plan to sell.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4 pt-4 border-t border-stone-100">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-stone-400 mb-2">What you get</p>
          <ul className="space-y-1.5">
            {DOES.map(t => (
              <li key={t} className="flex gap-2 text-xs text-stone-700 leading-relaxed">
                <Check className="w-3.5 h-3.5 shrink-0 mt-0.5" style={{ color: '#6F8263' }} />
                <span>{t}</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-stone-400 mb-2">What it cannot answer</p>
          <ul className="space-y-1.5">
            {DOES_NOT.map(t => (
              <li key={t} className="flex gap-2 text-xs text-stone-700 leading-relaxed">
                <X className="w-3.5 h-3.5 shrink-0 mt-0.5" style={{ color: '#C15338' }} />
                <span>{t}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}