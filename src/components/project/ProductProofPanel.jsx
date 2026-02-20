import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  Sparkles, Copy, Pin, X, ExternalLink, CheckCircle, AlertCircle, 
  Loader2, Image, FileText, ChevronDown, ChevronUp, Bug 
} from 'lucide-react';
import { toast } from 'sonner';

export default function ProductProofPanel({ trend, projectId }) {
  const queryClient = useQueryClient();
  const [state, setState] = useState('idle'); // idle, generating, success, empty, error
  const [errorMessage, setErrorMessage] = useState('');
  const [debugInfo, setDebugInfo] = useState(null);
  const [showDebug, setShowDebug] = useState(false);

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

  // Pin product
  const pinMutation = useMutation({
    mutationFn: (productId) => 
      base44.entities.ProductCandidate.update(productId, { is_pinned: true }),
    onSuccess: () => {
      queryClient.invalidateQueries(['productCandidates', trend.id]);
      toast.success('Product pinned');
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

  const heroCandidates = candidates.filter(c => c.is_hero && !c.is_excluded);
  const supportCandidates = candidates.filter(c => !c.is_hero && !c.is_excluded);

  return (
    <Card>
      <CardHeader className="border-b">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-blue-600" />
            Product Proof Shortlist
            {state === 'success' && (
              <Badge variant="outline" className="ml-2 bg-green-50 text-green-700 border-green-300">
                {candidates.length} products
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

        {/* Empty State */}
        {state === 'empty' && (
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-amber-900 mb-2">No matching products found</p>
                {debugInfo && debugInfo.empty_reasons && debugInfo.empty_reasons.length > 0 && (
                  <ul className="text-sm text-amber-800 space-y-1">
                    {debugInfo.empty_reasons.map((reason, idx) => (
                      <li key={idx}>• {reason}</li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Idle State */}
        {state === 'idle' && candidates.length === 0 && (
          <div className="text-center py-8">
            <div className="text-4xl mb-4">📦</div>
            <p className="text-slate-600 mb-4">
              No product shortlist yet. Generate one to find the best product evidence for this trend.
            </p>
            <Button onClick={() => generateMutation.mutate()} className="gap-2">
              <Sparkles className="w-4 h-4" />
              Generate Product Shortlist
            </Button>
          </div>
        )}

        {/* Success State */}
        {state === 'success' && candidates.length > 0 && (
          <>
            {/* Hero Products */}
            {heroCandidates.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-600" />
                  Hero Products ({heroCandidates.length})
                </h4>
                <div className="space-y-3">
                  {heroCandidates.map(product => (
                    <ProductCard 
                      key={product.id}
                      product={product}
                      onCopyId={copyRecordId}
                      onPin={pinMutation.mutate}
                      onExclude={excludeMutation.mutate}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Support Products */}
            {supportCandidates.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-slate-900 mb-3">
                  Support Products ({supportCandidates.length})
                </h4>
                <div className="space-y-3">
                  {supportCandidates.map(product => (
                    <ProductCard 
                      key={product.id}
                      product={product}
                      onCopyId={copyRecordId}
                      onPin={pinMutation.mutate}
                      onExclude={excludeMutation.mutate}
                    />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function ProductCard({ product, onCopyId, onPin, onExclude }) {
  const [excluding, setExcluding] = useState(false);
  const [excludeReason, setExcludeReason] = useState('');

  const poolColors = {
    'PDF_CURATED': 'bg-purple-100 text-purple-700',
    'GNPD_EXCEL': 'bg-blue-100 text-blue-700',
    'BOTH': 'bg-green-100 text-green-700'
  };

  const supportColors = {
    'SUPPORTS': 'bg-green-100 text-green-700',
    'PARTIAL': 'bg-yellow-100 text-yellow-700',
    'NOT_SUPPORT': 'bg-red-100 text-red-700'
  };

  return (
    <div className="border rounded-lg p-4 bg-white hover:bg-slate-50 transition-colors">
      <div className="flex items-start gap-3">
        {/* Image placeholder */}
        <div className="w-16 h-16 bg-slate-100 rounded flex items-center justify-center flex-shrink-0">
          {product.image_url ? (
            <img src={product.image_url} alt={product.product_name} className="w-full h-full object-cover rounded" />
          ) : (
            <Image className="w-6 h-6 text-slate-400" />
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between mb-2">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <h5 className="font-semibold text-slate-900">{product.product_name}</h5>
                {product.is_pinned && <Pin className="w-3 h-3 text-blue-600" />}
              </div>
              <p className="text-sm text-slate-600">
                {product.brand} • {product.country} • {product.launch_date}
              </p>
            </div>
            
            <div className="flex gap-2">
              <Badge variant="outline" className={poolColors[product.source_pool]}>
                {product.source_pool.replace('_', ' ')}
              </Badge>
              {product.support_label && (
                <Badge variant="outline" className={supportColors[product.support_label]}>
                  {product.support_score}%
                </Badge>
              )}
            </div>
          </div>

          {/* Rationale */}
          {product.rationale_bullets && product.rationale_bullets.length > 0 && (
            <div className="text-xs text-slate-700 mb-3 space-y-1">
              {product.rationale_bullets.map((bullet, idx) => (
                <div key={idx} className="flex items-start gap-1">
                  <span className="text-slate-400">•</span>
                  <span>{bullet}</span>
                </div>
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
            <div className="flex gap-2">
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
              {!product.is_pinned && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => onPin(product.id)}
                  className="h-7 text-xs gap-1"
                >
                  <Pin className="w-3 h-3" />
                  Pin
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setExcluding(true)}
                className="h-7 text-xs gap-1 text-red-600 hover:text-red-700"
              >
                <X className="w-3 h-3" />
                Exclude
              </Button>
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