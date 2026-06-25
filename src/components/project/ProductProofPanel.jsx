import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Sparkles, Copy, Pin, PinOff, X, ExternalLink, AlertCircle,
  Loader2, Package, FileText, ChevronDown, ChevronUp, Bug, RotateCcw
} from 'lucide-react';
import { toast } from 'sonner';

export default function ProductProofPanel({ trend, projectId }) {
  const queryClient = useQueryClient();
  const [state, setState] = useState('idle'); // idle, generating, success, empty, error
  const [errorMessage, setErrorMessage] = useState('');
  const [debugInfo, setDebugInfo] = useState(null);
  const [showDebug, setShowDebug] = useState(false);
  const [showExcluded, setShowExcluded] = useState(false);

  // Fetch product candidates for this trend
  const { data: candidates = [], isLoading } = useQuery({
    queryKey: ['productCandidates', trend.id],
    queryFn: () => base44.entities.ProductCandidate.filter({ trend_id: trend.id }),
    enabled: !!trend.id
  });

  // Generate shortlist mutation
  const generateMutation = useMutation({
    mutationFn: async () => {
      setState('generating');
      setErrorMessage('');
      setDebugInfo(null);

      const response = await base44.functions.invoke('generateProductShortlist', {
        project_id: projectId,
        trend_id: trend.id
      });
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries(['productCandidates', trend.id]);
      setDebugInfo(data.debug);

      if (data.shortlist_count === 0) {
        setState('empty');
      } else {
        setState('success');
        toast.success(`Generated ${data.shortlist_count} products`);
      }
    },
    onError: (error) => {
      setState('error');
      const errorData = error.response?.data || {};

      if (errorData.error_code === 'MAPPING_INCOMPLETE' || errorData.error === 'GNPD column mapping incomplete') {
        setErrorMessage(`${errorData.message}\n\nSource: ${errorData.source_title || 'Unknown'}`);
      } else {
        setErrorMessage(error.message || 'Failed to generate shortlist');
      }

      toast.error('Shortlist generation failed');
    }
  });

  // Pin / unpin product
  const pinMutation = useMutation({
    mutationFn: ({ productId, pinned }) =>
      base44.entities.ProductCandidate.update(productId, { is_pinned: pinned }),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries(['productCandidates', trend.id]);
      toast.success(vars.pinned ? 'Product pinned' : 'Product unpinned');
    }
  });

  // Exclude product
  const excludeMutation = useMutation({
    mutationFn: ({ productId, reason }) =>
      base44.entities.ProductCandidate.update(productId, {
        is_excluded: true,
        exclusion_reason: reason
      }),
    onSuccess: () => {
      queryClient.invalidateQueries(['productCandidates', trend.id]);
      toast.success('Product excluded');
    }
  });

  const copyRecordId = (recordId) => {
    navigator.clipboard.writeText(recordId);
    toast.success('Record ID copied');
  };

  // Determine current state if not explicitly set
  React.useEffect(() => {
    if (!isLoading && candidates.length > 0 && state === 'idle') {
      setState('success');
    }
  }, [candidates, isLoading, state]);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6 text-center">
          <Loader2 className="w-6 h-6 animate-spin mx-auto text-slate-400" />
        </CardContent>
      </Card>
    );
  }

  // Sort by final_rank_score desc, then split active vs excluded and hero vs supporting
  const sorted = [...candidates].sort((a, b) => (b.final_rank_score ?? 0) - (a.final_rank_score ?? 0));
  const active = sorted.filter(c => !c.is_excluded);
  const excluded = sorted.filter(c => c.is_excluded);
  const heroes = active.filter(c => c.is_hero === true);
  const others = active.filter(c => c.is_hero !== true);

  const renderCard = (product, opts = {}) => (
    <ProductCard
      key={product.id}
      product={product}
      trendName={trend.trend_name}
      onCopyId={copyRecordId}
      onPin={(id, pinned) => pinMutation.mutate({ productId: id, pinned })}
      onExclude={excludeMutation.mutate}
      excludedStyle={opts.excludedStyle}
    />
  );

  return (
    <Card>
      <CardHeader className="border-b">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-blue-600" />
            Product Proof Shortlist
            {state === 'success' && candidates.length > 0 && (
              <Badge variant="outline" className="ml-2 bg-green-50 text-green-700 border-green-300">
                {active.length} products
              </Badge>
            )}
          </CardTitle>
          <div className="flex gap-2">
            {debugInfo && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setShowDebug(!showDebug)}
                className="h-7 text-xs gap-1"
              >
                <Bug className="w-3 h-3" />
                Debug
                {showDebug ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </Button>
            )}
            <Button
              onClick={() => generateMutation.mutate()}
              disabled={state === 'generating'}
              size="sm"
              className="gap-2"
            >
              {state === 'generating' ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  {candidates.length > 0 ? 'Regenerate' : 'Generate'} Shortlist
                </>
              )}
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-6 space-y-4">
        {/* Debug Panel */}
        {showDebug && debugInfo && (
          <div className="p-3 bg-slate-50 rounded-lg border text-xs space-y-2">
            <h4 className="font-semibold text-slate-900">Debug Information</h4>
            <div className="grid grid-cols-2 gap-2">
              <div className="text-slate-600">GNPD rows loaded:</div>
              <div className="font-medium">{debugInfo.gnpd_rows_loaded}</div>

              <div className="text-slate-600">After date filter:</div>
              <div className="font-medium">{debugInfo.rows_after_date_filter}</div>

              <div className="text-slate-600">After region filter:</div>
              <div className="font-medium">{debugInfo.rows_after_region_filter}</div>

              <div className="text-slate-600">Candidates (Stage A):</div>
              <div className="font-medium">{debugInfo.candidates_retrieved_stage_a}</div>

              <div className="text-slate-600">Scored (Stage B):</div>
              <div className="font-medium">{debugInfo.candidates_scored_stage_b}</div>

              <div className="text-slate-600">Final shortlist:</div>
              <div className="font-medium text-blue-600">{debugInfo.final_shortlist_size}</div>
            </div>

            {debugInfo.fields_searched && debugInfo.fields_searched.length > 0 && (
              <div>
                <div className="text-slate-600">Fields searched:</div>
                <div className="text-slate-800">{debugInfo.fields_searched.join(', ')}</div>
              </div>
            )}

            {debugInfo.trend_signals_used && debugInfo.trend_signals_used.length > 0 && (
              <div>
                <div className="text-slate-600">Trend signals (top 10):</div>
                <div className="text-slate-800">{debugInfo.trend_signals_used.join(', ')}</div>
              </div>
            )}
          </div>
        )}

        {/* Error State */}
        {state === 'error' && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-red-900 mb-1">Shortlist generation failed</p>
                <p className="text-sm text-red-800 whitespace-pre-line">{errorMessage}</p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => generateMutation.mutate()}
                  className="mt-3 h-7 text-xs border-red-300 hover:bg-red-50"
                >
                  Retry
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Full-area Generating State */}
        {state === 'generating' && (
          <div className="text-center py-12">
            <Loader2 className="w-8 h-8 animate-spin mx-auto text-blue-500 mb-4" />
            <p className="text-sm text-slate-600 max-w-md mx-auto">
              Scanning GNPD database for products that validate{' '}
              <span className="font-medium text-slate-800">"{trend.trend_name}"</span>…
            </p>
            <p className="text-xs text-slate-400 mt-1">This may take a moment.</p>
          </div>
        )}

        {/* Empty State (no matches found OR never generated) */}
        {state !== 'generating' && (state === 'empty' || (state === 'idle' && candidates.length === 0)) && (
          <div className="text-center py-10">
            <div className="text-4xl mb-3">📦</div>
            <p className="text-base font-medium text-slate-800 mb-1">No product evidence yet</p>
            <p className="text-sm text-slate-500 mb-5 max-w-md mx-auto">
              Scan the GNPD database to find real product launches that validate this trend.
            </p>
            {state === 'empty' && debugInfo?.empty_reasons?.length > 0 && (
              <ul className="text-xs text-amber-700 mb-5 space-y-1 inline-block text-left">
                {debugInfo.empty_reasons.map((reason, idx) => (
                  <li key={idx}>• {reason}</li>
                ))}
              </ul>
            )}
            <div>
              <Button onClick={() => generateMutation.mutate()} className="gap-2">
                <Sparkles className="w-4 h-4" />
                Generate Product Shortlist
              </Button>
            </div>
          </div>
        )}

        {/* Success State */}
        {state !== 'generating' && state !== 'empty' && candidates.length > 0 && (
          <>
            {/* Section header with count + regenerate */}
            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-600">
                <span className="font-semibold text-slate-900">{active.length}</span> product{active.length === 1 ? '' : 's'} found
              </p>
              <Button
                size="sm"
                variant="outline"
                onClick={() => generateMutation.mutate()}
                disabled={state === 'generating'}
                className="h-7 text-xs gap-1.5"
              >
                <RotateCcw className="w-3 h-3" />
                Regenerate
              </Button>
            </div>

            {heroes.length > 0 ? (
              <>
                <SectionDivider label="Hero evidence" />
                <div className="space-y-3">
                  {heroes.map(p => renderCard(p))}
                </div>
                {others.length > 0 && (
                  <>
                    <SectionDivider label="Supporting evidence" />
                    <div className="space-y-3">
                      {others.map(p => renderCard(p))}
                    </div>
                  </>
                )}
              </>
            ) : (
              <div className="space-y-3">
                {others.map(p => renderCard(p))}
              </div>
            )}

            {/* Show excluded toggle */}
            {excluded.length > 0 && (
              <div className="pt-2 border-t">
                <button
                  onClick={() => setShowExcluded(!showExcluded)}
                  className="text-xs text-slate-500 hover:text-slate-700 flex items-center gap-1"
                >
                  {showExcluded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  {showExcluded ? 'Hide' : 'Show'} excluded products ({excluded.length})
                </button>
                {showExcluded && (
                  <div className="space-y-3 mt-3">
                    {excluded.map(p => renderCard(p, { excludedStyle: true }))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function SectionDivider({ label }) {
  return (
    <div className="flex items-center gap-3 pt-1">
      <span className="text-xs font-semibold uppercase tracking-wide text-slate-400 whitespace-nowrap">{label}</span>
      <div className="flex-1 h-px bg-slate-200" />
    </div>
  );
}

const SUPPORT_CONFIG = {
  SUPPORTS: { cls: 'bg-green-600 text-white border-green-600', label: '✓ Strong match' },
  PARTIAL: { cls: 'bg-amber-500 text-white border-amber-500', label: '~ Partial match' },
  NOT_SUPPORT: { cls: 'bg-red-600 text-white border-red-600', label: '✗ Weak match' }
};

function ProductCard({ product, trendName, onCopyId, onPin, onExclude, excludedStyle }) {
  const [excluding, setExcluding] = useState(false);
  const [excludeReason, setExcludeReason] = useState('');
  const [showAllBullets, setShowAllBullets] = useState(false);

  const support = SUPPORT_CONFIG[product.support_label] || { cls: 'bg-slate-200 text-slate-600 border-slate-200', label: 'Unscored' };

  const identity = [product.brand, product.company, product.country, product.launch_date].filter(Boolean).join(' · ');

  const bullets = Array.isArray(product.rationale_bullets) ? product.rationale_bullets : [];
  const visibleBullets = showAllBullets ? bullets : bullets.slice(0, 3);

  return (
    <div className={`border rounded-lg p-4 bg-white hover:bg-slate-50 transition-colors ${excludedStyle ? 'opacity-50' : ''}`}>
      <div className="flex items-start gap-4">
        {/* Packshot */}
        <div className="relative w-20 h-20 bg-slate-100 rounded flex items-center justify-center flex-shrink-0 overflow-hidden">
          {product.image_url ? (
            <img src={product.image_url} alt={product.product_name} className="w-full h-full object-cover" />
          ) : (
            <div className="flex flex-col items-center gap-1">
              <Package className="w-6 h-6 text-slate-400" />
              <span className="text-[10px] text-slate-400">No packshot</span>
            </div>
          )}
          {product.asset_status === 'packshot_missing' && (
            <span className="absolute top-1 right-1 w-2.5 h-2.5 rounded-full bg-orange-500 border border-white" title="Packshot pending" />
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Badge row */}
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">{trendName}</Badge>
            <Badge variant="outline" className={support.cls}>{support.label}</Badge>
            {excludedStyle && (
              <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">Excluded</Badge>
            )}
            {product.is_hero === true && !excludedStyle && (
              <Badge variant="outline" className="bg-amber-100 text-amber-800 border-amber-300">⭐ Hero evidence</Badge>
            )}
          </div>

          {/* Identity */}
          <div className="flex items-center gap-2 mb-0.5">
            <h5 className="font-semibold text-slate-900">{product.product_name}</h5>
            {product.is_pinned && <Pin className="w-3 h-3 text-blue-600" />}
          </div>
          {identity && <p className="text-sm text-slate-500 mb-3">{identity}</p>}

          {/* Validation points */}
          <div className="mb-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-1">Validation points</p>
            {bullets.length > 0 ? (
              <>
                <ul className="text-xs text-slate-700 space-y-1">
                  {visibleBullets.map((bullet, idx) => (
                    <li key={idx} className="flex items-start gap-1.5">
                      <span className="text-slate-400 mt-0.5">•</span>
                      <span>{bullet}</span>
                    </li>
                  ))}
                </ul>
                {bullets.length > 3 && (
                  <button
                    onClick={() => setShowAllBullets(!showAllBullets)}
                    className="text-xs text-blue-600 hover:text-blue-800 mt-1"
                  >
                    {showAllBullets ? 'Show less' : `Show more (${bullets.length - 3} more)`}
                  </button>
                )}
              </>
            ) : (
              <p className="text-xs text-slate-400 italic">No validation notes available.</p>
            )}
          </div>

          {/* Matched evidence fields */}
          {Array.isArray(product.matched_evidence_fields) && product.matched_evidence_fields.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 mb-3">
              <span className="text-[11px] text-slate-400">Matched fields:</span>
              {product.matched_evidence_fields.map((f, idx) => (
                <span key={idx} className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">{f}</span>
              ))}
            </div>
          )}

          {/* Evidence links */}
          <div className="flex items-center gap-3 text-xs text-slate-500 mb-3">
            {product.evidence_links?.pdf_page && (
              <span className="flex items-center gap-1">
                <FileText className="w-3 h-3" />
                PDF pg. {product.evidence_links.pdf_page}
              </span>
            )}
            {product.evidence_links?.gnpd_source_id && (
              <span className="flex items-center gap-1">
                <ExternalLink className="w-3 h-3" />
                GNPD row {product.evidence_links.gnpd_row_index}
              </span>
            )}
          </div>

          {/* Actions */}
          {!excluding ? (
            <div className="flex flex-wrap gap-2">
              {product.mintel_record_id ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onCopyId(product.mintel_record_id)}
                  className="h-7 text-xs gap-1"
                >
                  <Copy className="w-3 h-3" />
                  Record ID: {product.mintel_record_id}
                </Button>
              ) : (
                <Badge variant="outline" className="bg-red-50 text-red-700 border-red-300 h-7 text-xs">
                  Record ID missing
                </Badge>
              )}
              {product.is_pinned ? (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => onPin(product.id, false)}
                  className="h-7 text-xs gap-1"
                >
                  <PinOff className="w-3 h-3" />
                  Unpin
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => onPin(product.id, true)}
                  className="h-7 text-xs gap-1"
                >
                  <Pin className="w-3 h-3" />
                  Pin
                </Button>
              )}
              {!excludedStyle && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setExcluding(true)}
                  className="h-7 text-xs gap-1 text-red-600 hover:text-red-700"
                >
                  <X className="w-3 h-3" />
                  Exclude
                </Button>
              )}
            </div>
          ) : (
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Why exclude this product?"
                value={excludeReason}
                onChange={(e) => setExcludeReason(e.target.value)}
                className="flex-1 text-xs border rounded px-2 py-1"
              />
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  onExclude({ productId: product.id, reason: excludeReason });
                  setExcluding(false);
                }}
                disabled={!excludeReason.trim()}
                className="h-7 text-xs"
              >
                Confirm
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setExcluding(false);
                  setExcludeReason('');
                }}
                className="h-7 text-xs"
              >
                Cancel
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}