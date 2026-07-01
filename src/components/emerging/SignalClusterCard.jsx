import React from 'react';
import { CATEGORY_LABELS } from '@/lib/palsgaardCategoryMapping';
import { Button } from '@/components/ui/button';
import { FileText, Building2, Layers, Package, ArrowUpRight, X, Clock } from 'lucide-react';

const SIGNAL_TYPE_LABELS = {
  consumer_driver: 'Consumer driver',
  category_movement: 'Category movement',
  regional_expression: 'Regional expression',
  competitive_activity: 'Competitive activity',
  other: 'Other',
};

const GNPD_BADGE = {
  strong: { label: 'Strong', cls: 'bg-pal-sage-10 text-[#4A6040]' },
  moderate: { label: 'Moderate', cls: 'bg-amber-50 text-[#92600A]' },
  none: { label: 'Not yet shipping', cls: 'bg-muted text-muted-foreground' },
};

function Chip({ children }) {
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-pal-blue-10 text-pal-blue">
      {children}
    </span>
  );
}

export default function SignalClusterCard({ cluster, onPromote, onDismiss, onSnooze, busy }) {
  const excerptCount = cluster.excerpt_refs?.length || 0;
  const gnpdCount = cluster.gnpd_product_ids?.length || 0;
  const badge = GNPD_BADGE[cluster.gnpd_evidence_strength] || GNPD_BADGE.none;

  return (
    <div className="pal-card p-4 flex flex-col gap-3">
      {/* Headline */}
      <div>
        <h3 className="text-base font-semibold text-foreground leading-snug">{cluster.theme_short_label}</h3>
        {cluster.theme_description && (
          <p className="text-sm text-muted-foreground mt-1 leading-relaxed">{cluster.theme_description}</p>
        )}
      </div>

      {/* Chips */}
      <div className="flex flex-wrap gap-1.5">
        <Chip>{CATEGORY_LABELS[cluster.category] || cluster.category}</Chip>
        <Chip>{SIGNAL_TYPE_LABELS[cluster.signal_type] || cluster.signal_type}</Chip>
        {cluster.driver_hypothesis && <Chip>{cluster.driver_hypothesis}</Chip>}
      </div>

      {/* Evidence strip */}
      <div className="flex items-center justify-between gap-3 py-2 px-3 rounded-lg bg-muted/50 text-xs">
        <div className="flex items-center gap-3 text-muted-foreground">
          <span className="inline-flex items-center gap-1"><FileText className="w-3.5 h-3.5" />{excerptCount} excerpts</span>
          <span className="inline-flex items-center gap-1"><Layers className="w-3.5 h-3.5" />{cluster.source_diversity_count || 0} sources</span>
          <span className="inline-flex items-center gap-1"><Building2 className="w-3.5 h-3.5" />{cluster.publisher_diversity_count || 0} publishers</span>
        </div>
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-medium ${badge.cls}`}>
          <Package className="w-3.5 h-3.5" />{badge.label}{gnpdCount > 0 ? ` · ${gnpdCount}` : ''}
        </span>
      </div>

      {/* Distance note */}
      {cluster.distance_from_existing_note && (
        <p className="text-xs italic text-muted-foreground leading-relaxed">{cluster.distance_from_existing_note}</p>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 pt-1">
        <Button size="sm" className="flex-1 bg-pal-blue hover:bg-pal-blue/90" onClick={() => onPromote(cluster)} disabled={busy}>
          <ArrowUpRight className="w-4 h-4 mr-1" />Promote to trend
        </Button>
        <Button size="sm" variant="outline" onClick={() => onSnooze(cluster)} disabled={busy} title="Snooze 30 days">
          <Clock className="w-4 h-4" />
        </Button>
        <Button size="sm" variant="outline" onClick={() => onDismiss(cluster)} disabled={busy} title="Dismiss">
          <X className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}