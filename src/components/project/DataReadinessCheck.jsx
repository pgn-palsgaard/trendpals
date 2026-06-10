import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronUp, AlertCircle, CheckCircle2, Info } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export default function DataReadinessCheck({ project, sources }) {
  const [expanded, setExpanded] = useState(false);

  // GNPD coverage from canonical GNPDProduct records (matching project category + region)
  const { data: gnpdStats } = useQuery({
    queryKey: ['gnpdStats', project.category, project.region_code],
    queryFn: async () => (await base44.functions.invoke('getGNPDStats', {
      category: project.category,
      region_code: project.region_code,
    })).data,
  });

  // Calculate coverage breakdown
  const mintelSources = sources.filter(s => s.source_type === 'mintel');
  const totalExcerpts = sources.reduce((sum, s) => sum + (s.excerpts?.length || 0), 0);
  const totalGnpdProducts = gnpdStats?.total || 0;
  const emulsifierProducts = gnpdStats?.with_emulsifier || 0;
  const totalImages = gnpdStats?.with_image || 0;

  // Compute score locally from actual sources (don't rely on stored project.data_sufficiency_score)
  const mintelScore = Math.min(30, mintelSources.length * 15);
  const gnpdScore = Math.min(40, Math.floor((totalGnpdProducts / 50) * 40));
  const excerptScore = Math.min(15, Math.floor((totalExcerpts / 20) * 15));
  const imageScore = Math.min(15, Math.floor((totalImages / 10) * 15));
  const score = mintelScore + gnpdScore + excerptScore + imageScore;

  // Determine status
  const getStatus = () => {
    if (score < 40) return { color: 'red', icon: AlertCircle, text: '🚫 Cannot generate trends', type: 'error' };
    if (score < 60) return { color: 'yellow', icon: AlertCircle, text: '⚠️ Action needed before trend generation', type: 'warning' };
    return { color: 'green', icon: CheckCircle2, text: '✓ Ready for trend generation', type: 'success' };
  };

  const status = getStatus();
  const StatusIcon = status.icon;

  // Required checks
  const hasMintel = mintelSources.length > 0;
  const hasGnpd = totalGnpdProducts > 0;
  const hasEnoughExcerpts = totalExcerpts >= 10;
  const hasImages = totalImages >= 5;

  return (
    <Card className={`border-2 ${
      status.type === 'error' ? 'border-red-300 bg-red-50/30' :
      status.type === 'warning' ? 'border-yellow-300 bg-yellow-50/30' :
      'border-green-300 bg-green-50/30'
    }`}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <StatusIcon className={`w-5 h-5 ${
              status.type === 'error' ? 'text-red-600' :
              status.type === 'warning' ? 'text-yellow-600' :
              'text-green-600'
            }`} />
            DATA READINESS CHECK
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setExpanded(!expanded)}
            className="text-slate-600"
          >
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Status Summary */}
        <div className="flex items-center justify-between p-3 bg-white rounded-lg border">
          <div>
            <div className="text-sm font-medium text-slate-900">Coverage: {score}%</div>
            <div className={`text-sm ${
              status.type === 'error' ? 'text-red-700' :
              status.type === 'warning' ? 'text-yellow-700' :
              'text-green-700'
            }`}>
              {status.text}
            </div>
          </div>
          <div className="w-24 h-2 bg-slate-200 rounded-full overflow-hidden">
            <div 
              className={`h-full transition-all ${
                status.type === 'error' ? 'bg-red-500' :
                status.type === 'warning' ? 'bg-yellow-500' :
                'bg-green-500'
              }`}
              style={{ width: `${score}%` }}
            />
          </div>
        </div>

        {/* Expanded Details */}
        {expanded && (
          <div className="space-y-4">
            {/* Required Section */}
            <div>
              <h4 className="text-sm font-semibold text-slate-900 mb-2">Required:</h4>
              <div className="space-y-2">
                <div className="flex items-start gap-2 text-sm">
                  {hasMintel ? (
                    <CheckCircle2 className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-red-600 mt-0.5 flex-shrink-0" />
                  )}
                  <div className="flex-1">
                    <div className={hasMintel ? 'text-slate-900' : 'text-red-900'}>
                      Mintel report ({project.category}, {project.region_code})
                    </div>
                    <div className="text-xs text-slate-600">
                      {mintelSources.length} source{mintelSources.length !== 1 ? 's' : ''} • {totalExcerpts} excerpts
                    </div>
                  </div>
                </div>

                <div className="flex items-start gap-2 text-sm">
                  {hasGnpd ? (
                    <CheckCircle2 className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-red-600 mt-0.5 flex-shrink-0" />
                  )}
                  <div className="flex-1">
                    <div className={hasGnpd ? 'text-slate-900' : 'text-red-900'}>
                      GNPD exports ({project.category}, {project.region_code})
                    </div>
                    <div className="text-xs text-slate-600">
                      {totalGnpdProducts.toLocaleString()} products • {emulsifierProducts.toLocaleString()} emulsifier-flagged • {totalImages} with images
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Recommended Section */}
            <div>
              <h4 className="text-sm font-semibold text-slate-900 mb-2">Recommended:</h4>
              <div className="space-y-2">
                <div className="flex items-start gap-2 text-sm">
                  {mintelSources.length >= 2 ? (
                    <CheckCircle2 className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                  ) : (
                    <Info className="w-4 h-4 text-slate-400 mt-0.5 flex-shrink-0" />
                  )}
                  <div className="text-slate-600">
                    Additional Mintel sources (broaden trends)
                    {mintelSources.length >= 2 && <span className="text-green-700 ml-1">✓</span>}
                  </div>
                </div>

                <div className="flex items-start gap-2 text-sm">
                  {hasImages ? (
                    <CheckCircle2 className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                  ) : (
                    <Info className="w-4 h-4 text-slate-400 mt-0.5 flex-shrink-0" />
                  )}
                  <div className="text-slate-600">
                    Recent launches with images (visual proof)
                    {hasImages && <span className="text-green-700 ml-1">✓</span>}
                  </div>
                </div>
              </div>
            </div>

            {/* Coverage Breakdown */}
            <div className="p-3 bg-white rounded-lg border border-slate-200">
              <div className="text-xs font-medium text-slate-700 mb-2">Coverage Breakdown:</div>
              <div className="space-y-1 text-xs text-slate-600">
                <div className="flex justify-between">
                  <span>Mintel reports:</span>
                  <span className="font-medium">{mintelScore}%</span>
                </div>
                <div className="flex justify-between">
                  <span>GNPD products:</span>
                  <span className="font-medium">{gnpdScore}%</span>
                </div>
                <div className="flex justify-between">
                  <span>Text excerpts:</span>
                  <span className="font-medium">{excerptScore}%</span>
                </div>
                <div className="flex justify-between">
                  <span>Product images:</span>
                  <span className="font-medium">{imageScore}%</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Action Messages */}
        {!hasMintel && (
          <div className="p-3 bg-red-100 border border-red-200 rounded-lg">
            <p className="text-sm font-medium text-red-900">
              ⚠️ No Mintel report linked. Trends will lack narrative framing. Upload Mintel reports to fix this.
            </p>
          </div>
        )}

        {!hasGnpd && (
          <div className="p-3 bg-red-100 border border-red-200 rounded-lg">
            <p className="text-sm font-medium text-red-900">
              ⚠️ No GNPD product data linked. Trends will lack market validation. Upload GNPD exports to fix this.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}