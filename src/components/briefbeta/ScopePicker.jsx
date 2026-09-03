import React from 'react';
import { CANONICAL_CATEGORIES, BAKERY_SUB_CATEGORIES } from '@/components/briefbeta/architectPrompt';

const CATEGORY_LABELS = {
  bakery: 'Bakery', condiments: 'Condiments', chocolate_confectionery: 'Chocolate & confectionery',
  dairy: 'Dairy', ice_cream: 'Ice cream', meat: 'Meat', oils_fats: 'Oils & fats',
  plant_based: 'Plant-based', rutf_rusf: 'RUTF / RUSF',
};
const MAX_CATEGORIES = 2;

function Chip({ active, onClick, children, disabled }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-40 ${
        active ? 'bg-pal-blue border-pal-blue text-white' : 'bg-card border-border text-foreground hover:border-pal-blue/50'
      }`}
    >
      {children}
    </button>
  );
}

// Step 1: pick industries. Step 2: per industry, pick the formats the data can
// distinguish. Every click patches the contract directly — the architect reads the
// contract as authoritative, so the scope can be changed at any point of the chat.
export default function ScopePicker({ contract, formatsByCategory, disabled, onChange }) {
  const categories = Array.isArray(contract.categories) ? contract.categories : [];
  const subs = Array.isArray(contract.sub_categories) ? contract.sub_categories : [];

  const formatsFor = c => formatsByCategory?.[c] || (c === 'bakery' ? BAKERY_SUB_CATEGORIES : []);

  function toggleCategory(c) {
    const next = categories.includes(c) ? categories.filter(x => x !== c) : [...categories, c];
    // Dropping an industry also drops its formats — they would otherwise match nothing.
    const stillValid = new Set(next.flatMap(formatsFor));
    onChange({ categories: next, sub_categories: subs.filter(s => stillValid.has(s)) });
  }

  function toggleFormat(f) {
    onChange({ sub_categories: subs.includes(f) ? subs.filter(x => x !== f) : [...subs, f] });
  }

  function clearFormats(c) {
    const own = new Set(formatsFor(c));
    onChange({ sub_categories: subs.filter(s => !own.has(s)) });
  }

  return (
    <div className="pal-card p-5 space-y-4">
      <div>
        <p className="text-sm font-semibold text-foreground">Scope</p>
        <p className="text-xs text-muted-foreground">Step 1 — industries (max {MAX_CATEGORIES} — one is preferable, a second makes the deck heavier). Step 2 — formats per industry. Change anything, any time.</p>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="section-label">1 · Industry</p>
          {categories.length >= MAX_CATEGORIES && (
            <span className="text-[11px] text-muted-foreground">Max reached — one industry keeps the deck lighter</span>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {CANONICAL_CATEGORIES.map(c => (
            <Chip
              key={c}
              active={categories.includes(c)}
              disabled={disabled || (!categories.includes(c) && categories.length >= MAX_CATEGORIES)}
              onClick={() => toggleCategory(c)}
            >
              {CATEGORY_LABELS[c] || c}
            </Chip>
          ))}
        </div>
      </div>

      {categories.length > 0 && (
        <div className="space-y-3">
          <p className="section-label">2 · Formats</p>
          {categories.map(c => {
            const formats = formatsFor(c);
            const chosen = formats.filter(f => subs.includes(f));
            return (
              <div key={c}>
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-xs font-medium text-foreground">{CATEGORY_LABELS[c] || c}</p>
                  <span className="text-[11px] text-muted-foreground">
                    {chosen.length === 0 ? 'All formats' : `${chosen.length} selected`}
                  </span>
                </div>
                {formats.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">Format buckets appear once the region is set and evidence is retrieved.</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    <Chip active={chosen.length === 0} disabled={disabled} onClick={() => clearFormats(c)}>All</Chip>
                    {formats.map(f => (
                      <Chip key={f} active={subs.includes(f)} disabled={disabled} onClick={() => toggleFormat(f)}>{f}</Chip>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}