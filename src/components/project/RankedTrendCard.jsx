import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2 } from 'lucide-react';

export default function RankedTrendCard({ trend, isSelected, relevanceScore, matchingExcerpts, onToggle, disabled }) {
  return (
    <Card className={`transition-all ${isSelected ? 'border-2 border-pal-blue shadow-md' : 'border-slate-200 hover:border-slate-300'}`}>
      <CardContent className="p-5">
        <div className="flex items-start gap-4">
          <button
            onClick={onToggle}
            disabled={disabled}
            className={`mt-0.5 flex-shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${
              isSelected ? 'bg-pal-blue border-pal-blue' : 'border-slate-300 hover:border-pal-blue'
            }`}
            aria-label={isSelected ? 'Deselect trend' : 'Select trend'}
          >
            {isSelected && <CheckCircle2 className="w-4 h-4 text-white" />}
          </button>

          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-3 mb-2">
              <h3 className="text-base font-semibold text-slate-900">{trend.trend_name}</h3>
              {trend.mega_trend && (
                <Badge variant="outline" className="text-xs shrink-0">{trend.mega_trend}</Badge>
              )}
            </div>

            {/* Evidence match indicator */}
            <div className="flex items-center gap-2 mb-2">
              <div className="flex-1 max-w-[160px] h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-pal-blue rounded-full transition-all"
                  style={{ width: `${relevanceScore}%` }}
                />
              </div>
              <span className="text-xs font-medium text-slate-500">Evidence match {relevanceScore}%</span>
            </div>

            {trend.market_signal && (
              <p className="text-sm text-slate-600 mb-2">{trend.market_signal}</p>
            )}

            <p className="text-xs text-slate-500">
              {matchingExcerpts} {matchingExcerpts === 1 ? 'excerpt' : 'excerpts'} from project sources
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}