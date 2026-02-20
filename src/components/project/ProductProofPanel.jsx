import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  Sparkles, Copy, Pin, X, ExternalLink, CheckCircle, AlertCircle, 
  Loader2, Image, FileText 
} from 'lucide-react';
import { toast } from 'sonner';

export default function ProductProofPanel({ trend, projectId }) {
  const queryClient = useQueryClient();
  const [generating, setGenerating] = useState(false);

  // Fetch product candidates for this trend
  const { data: candidates = [], isLoading } = useQuery({
    queryKey: ['productCandidates', trend.id],
    queryFn: () => base44.entities.ProductCandidate.filter({ trend_id: trend.id }),
    enabled: !!trend.id
  });

  // Generate shortlist mutation
  const generateMutation = useMutation({
    mutationFn: async () => {
      setGenerating(true);
      const response = await base44.functions.invoke('generateProductShortlist', {
        project_id: projectId,
        trend_id: trend.id
      });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['productCandidates', trend.id]);
      toast.success('Product shortlist generated');
      setGenerating(false);
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to generate shortlist');
      setGenerating(false);
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

  const heroCandidates = candidates.filter(c => c.is_hero && !c.is_excluded);
  const supportCandidates = candidates.filter(c => !c.is_hero && !c.is_excluded);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6 text-center">
          <Loader2 className="w-6 h-6 animate-spin mx-auto text-slate-400" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="border-b">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-blue-600" />
            Product Proof Shortlist
          </CardTitle>
          <Button 
            onClick={() => generateMutation.mutate()}
            disabled={generating}
            size="sm"
            className="gap-2"
          >
            {generating ? (
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
      </CardHeader>

      {candidates.length === 0 ? (
        <CardContent className="p-8 text-center">
          <div className="text-4xl mb-4">📦</div>
          <p className="text-slate-600 mb-4">
            No product shortlist yet. Generate one to find the best product evidence for this trend.
          </p>
          <Button onClick={() => generateMutation.mutate()} className="gap-2">
            <Sparkles className="w-4 h-4" />
            Generate Product Shortlist
          </Button>
        </CardContent>
      ) : (
        <CardContent className="p-6 space-y-6">
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
        </CardContent>
      )}
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
              {product.mintel_record_id && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onCopyId(product.mintel_record_id)}
                  className="h-7 text-xs gap-1"
                >
                  <Copy className="w-3 h-3" />
                  Copy Record ID: {product.mintel_record_id}
                </Button>
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