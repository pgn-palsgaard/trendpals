import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CheckCircle, XCircle, Pencil, ChevronRight } from 'lucide-react';
import SMEAnnotationBadge from '@/components/sme/SMEAnnotationBadge';

const CAPABILITY_LABELS = {
  sustainability: 'Sustainability',
  texture_quality: 'Texture & Quality',
  cost_efficiency: 'Cost Efficiency',
  compliance_regulatory: 'Compliance',
  new_product_development: 'NPD',
  food_safety: 'Food Safety',
  supply_chain: 'Supply Chain',
  plant_based: 'Plant-Based',
  general: 'General',
};

const CONFIDENCE_STYLES = {
  high: 'text-green-700 bg-green-50 border-green-200',
  medium: 'text-yellow-700 bg-yellow-50 border-yellow-200',
  low: 'text-red-700 bg-red-50 border-red-200',
};

export default function TrendCard({ trend, onActivate, onDeactivate, onArchive, onEdit, onViewDetails }) {
  const isPending = !trend.is_active;
  const keywords = trend.trend_keywords || [];
  const visibleKeywords = keywords.slice(0, 5);
  const extraCount = keywords.length - 5;
  const pendingSourceCount = (trend.sources || []).filter(s => s.review_status === 'pending').length;

  return (
    <div
      className="bg-white border border-slate-200 rounded-lg p-4 hover:shadow-md transition-shadow cursor-pointer"
      onClick={() => onViewDetails(trend)}
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-slate-900 text-base leading-snug">{trend.trend_name}</h3>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {pendingSourceCount > 0 && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-amber-500 text-white border border-amber-600">
              {pendingSourceCount} pending
            </span>
          )}
          {isPending ? (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800 border border-yellow-200">
              Pending review
            </span>
          ) : (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 border border-green-200">
              Active
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 mb-3 flex-wrap">
        {trend.capability_area && (
          <span className="text-xs px-2 py-0.5 bg-slate-100 text-slate-600 rounded border border-slate-200">
            {CAPABILITY_LABELS[trend.capability_area] || trend.capability_area}
          </span>
        )}
        {trend.confidence && (
          <span className={`text-xs px-2 py-0.5 rounded border font-medium ${CONFIDENCE_STYLES[trend.confidence] || ''}`}>
            {trend.confidence} confidence
          </span>
        )}
        {/* Advisory only — SME field verification, never a gate. */}
        <SMEAnnotationBadge trendId={trend.id} />
      </div>

      {trend.market_signal && (
        <p className="text-sm text-slate-600 line-clamp-2 mb-3">{trend.market_signal}</p>
      )}

      {visibleKeywords.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-4">
          {visibleKeywords.map((kw, i) => (
            <span key={i} className="text-xs px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full border border-blue-100">
              {kw}
            </span>
          ))}
          {extraCount > 0 && (
            <span className="text-xs px-2 py-0.5 text-slate-500">+{extraCount} more</span>
          )}
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap" onClick={e => e.stopPropagation()}>
        {isPending ? (
          <>
            <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white h-7 text-xs" onClick={() => onActivate(trend)}>
              <CheckCircle className="w-3 h-3 mr-1" /> Activate
            </Button>
            <Button size="sm" variant="outline" className="h-7 text-xs text-slate-600" onClick={() => onArchive(trend)}>
              Archive
            </Button>
          </>
        ) : (
          <>
            <Button size="sm" variant="outline" className="h-7 text-xs text-slate-600" onClick={() => onDeactivate(trend)}>
              <XCircle className="w-3 h-3 mr-1" /> Deactivate
            </Button>
            <Button size="sm" variant="outline" className="h-7 text-xs text-slate-600" onClick={() => onEdit(trend)}>
              <Pencil className="w-3 h-3 mr-1" /> Edit
            </Button>
          </>
        )}
        <Button size="sm" variant="ghost" className="h-7 text-xs text-blue-600 hover:text-blue-800 ml-auto" onClick={() => onViewDetails(trend)}>
          View details <ChevronRight className="w-3 h-3 ml-0.5" />
        </Button>
      </div>
    </div>
  );
}