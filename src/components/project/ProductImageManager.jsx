import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Loader2, Upload, CheckCircle2, Image as ImageIcon, Package } from 'lucide-react';
import { toast } from 'sonner';

export default function PackshotManager({ project, trendCandidates }) {
  const queryClient = useQueryClient();
  const [uploadingFor, setUploadingFor] = useState(null);
  const [collapsed, setCollapsed] = useState(true);

  const { data: productRequests = [], isLoading } = useQuery({
    queryKey: ['productImageRequests', project.id],
    queryFn: () => base44.entities.ProductImageRequest.filter({ project_id: project.id }),
    enabled: !!project.id
  });

  const identifyProductsMutation = useMutation({
    mutationFn: async () => {
      const selectedTrendIds = trendCandidates.filter(t => t.is_selected).map(t => t.id);
      const response = await base44.functions.invoke('identifyProductsForTrends', {
        project_id: project.id,
        selected_trend_ids: selectedTrendIds
      });
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['productImageRequests', project.id] });
      toast.success(`Identified ${data.count} products that support your selected trends`);
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to identify products');
    }
  });

  const uploadImageMutation = useMutation({
    mutationFn: async ({ requestId, file }) => {
      const upload = await base44.integrations.Core.UploadFile({ file });
      await base44.entities.ProductImageRequest.update(requestId, {
        image_url: upload.file_url,
        status: 'uploaded'
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['productImageRequests', project.id] });
      toast.success('Product image uploaded');
      setUploadingFor(null);
    },
    onError: (error) => {
      toast.error('Failed to upload image');
      setUploadingFor(null);
    }
  });

  const handleImageUpload = async (requestId, file) => {
    setUploadingFor(requestId);
    uploadImageMutation.mutate({ requestId, file });
  };

  const selectedCount = trendCandidates.filter(t => t.is_selected).length;
  const pendingCount = productRequests.filter(r => r.status === 'pending').length;
  const uploadedCount = productRequests.filter(r => r.status === 'uploaded').length;

  const pendingCount = productRequests.filter(r => r.status === 'pending').length;
  const uploadedCount = productRequests.filter(r => r.status === 'uploaded').length;

  if (collapsed && productRequests.length > 0) {
    return (
      <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
        <button
          onClick={() => setCollapsed(false)}
          className="w-full flex items-center justify-between hover:bg-green-100 rounded px-2 py-1 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Package className="w-4 h-4 text-green-600" />
            <span className="text-sm font-medium text-green-900">
              Packshots: {uploadedCount} uploaded / {pendingCount} pending
            </span>
          </div>
          <ChevronDown className="w-4 h-4 text-green-600" />
        </button>
      </div>
    );
  }

  return (
    <Card className="border-green-200 bg-green-50/30">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Package className="w-5 h-5 text-green-600" />
            Packshots (Packshot Manager)
          </CardTitle>
          {productRequests.length > 0 && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setCollapsed(true)}
              className="h-7"
            >
              <ChevronUp className="w-4 h-4" />
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {productRequests.length === 0 ? (
          <div className="text-center py-8">
            <div className="text-5xl mb-4">📦</div>
            <p className="text-slate-900 font-medium mb-2">Identify Products for Your Trends</p>
            <p className="text-slate-600 text-sm mb-4">
              AI will analyze your data to find 8-15 products that best support your selected trends
            </p>
            <Button
              onClick={() => identifyProductsMutation.mutate()}
              disabled={selectedCount < 3 || identifyProductsMutation.isPending}
              className="bg-green-600 hover:bg-green-700"
            >
              {identifyProductsMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Analyzing Data...
                </>
              ) : (
                <>
                  <Package className="w-4 h-4 mr-2" />
                  Identify Products
                </>
              )}
            </Button>
            {selectedCount < 3 && (
              <p className="text-sm text-slate-500 mt-4">
                💡 Select at least 3 trends first
              </p>
            )}
          </div>
        ) : (
          <>
            {/* Summary */}
            <div className="p-4 bg-white rounded-lg border border-green-200">
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <div className="text-2xl font-bold text-slate-900">{productRequests.length}</div>
                  <div className="text-xs text-slate-600">Total Products</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-green-600">{uploadedCount}</div>
                  <div className="text-xs text-slate-600">Images Uploaded</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-amber-600">{pendingCount}</div>
                  <div className="text-xs text-slate-600">Pending</div>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-700">
                Upload product images from Mintel for the products listed below
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => identifyProductsMutation.mutate()}
                disabled={identifyProductsMutation.isPending}
              >
                Re-identify
              </Button>
            </div>

            {/* Product List */}
            <div className="space-y-3">
              {productRequests.map((request) => (
                <div 
                  key={request.id} 
                  className={`p-4 rounded-lg border transition-all ${
                    request.status === 'uploaded' 
                      ? 'bg-white border-green-300' 
                      : 'bg-white border-slate-200'
                  }`}
                >
                  <div className="flex items-start gap-4">
                    {/* Image Preview or Upload */}
                    <div className="flex-shrink-0">
                      {request.image_url ? (
                        <div className="relative group">
                          <img 
                            src={request.image_url} 
                            alt={request.product_name}
                            className="w-20 h-20 object-cover rounded-lg border-2 border-green-500"
                          />
                          <div className="absolute top-1 right-1">
                            <CheckCircle2 className="w-5 h-5 text-green-600 bg-white rounded-full" />
                          </div>
                        </div>
                      ) : (
                        <div className="w-20 h-20 bg-slate-100 rounded-lg border-2 border-dashed border-slate-300 flex items-center justify-center">
                          <ImageIcon className="w-8 h-8 text-slate-400" />
                        </div>
                      )}
                    </div>

                    {/* Product Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div>
                          <h4 className="font-semibold text-slate-900">{request.product_name}</h4>
                          <div className="space-y-0.5 mt-1">
                            <p className="text-xs text-slate-600 font-mono">ID: {request.product_id}</p>
                            {request.company && <p className="text-xs text-slate-600">Company: {request.company}</p>}
                            {request.brand && <p className="text-xs text-slate-600">Brand: {request.brand}</p>}
                          </div>
                        </div>
                        <Badge variant="outline" className="text-xs">
                          {request.source.replace('_', ' ')}
                        </Badge>
                      </div>

                      {/* Supporting Trends */}
                      <div className="mb-3">
                        <p className="text-xs text-slate-600 mb-1">Supports trends:</p>
                        <div className="flex flex-wrap gap-1">
                          {request.supporting_trends.map((trend, idx) => (
                            <Badge key={idx} className="bg-blue-100 text-blue-700 text-xs">
                              {trend}
                            </Badge>
                          ))}
                        </div>
                      </div>

                      {/* Upload Button */}
                      {!request.image_url && (
                        <div className="flex items-center gap-2">
                          <Input
                            type="file"
                            accept="image/*"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) handleImageUpload(request.id, file);
                            }}
                            disabled={uploadingFor === request.id}
                            className="cursor-pointer text-xs h-8"
                            id={`upload-${request.id}`}
                          />
                          {uploadingFor === request.id && (
                            <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                          )}
                        </div>
                      )}

                      {/* Uploaded Badge */}
                      {request.image_url && (
                        <div className="flex items-center gap-2 text-green-700">
                          <CheckCircle2 className="w-4 h-4" />
                          <span className="text-xs font-medium">Image uploaded</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Instructions */}
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-sm text-blue-900 font-medium mb-2">📋 Instructions:</p>
              <ol className="text-xs text-blue-800 space-y-1 list-decimal list-inside">
                <li>Go to Mintel and search for each product using the Product ID</li>
                <li>Download or screenshot the product image</li>
                <li>Upload the image using the file input for each product</li>
                <li>Once all images are uploaded, proceed to generate your report</li>
              </ol>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}