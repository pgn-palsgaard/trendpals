import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertCircle, CheckCircle2, Settings, ChevronDown, ChevronUp } from 'lucide-react';
import { toast } from 'sonner';

export default function GNPDMappingCard({ source, projectId }) {
  const queryClient = useQueryClient();
  const [showMapping, setShowMapping] = useState(false);
  const [showValidation, setShowValidation] = useState(false);
  const [editedMappings, setEditedMappings] = useState(null);

  const detectMutation = useMutation({
    mutationFn: async () => {
      const response = await base44.functions.invoke('detectGNPDColumns', {
        source_id: source.id,
        project_id: projectId
      });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['sources']);
      queryClient.invalidateQueries(['projectSources', projectId]);
      toast.success('Column mapping detected');
    },
    onError: (error) => {
      const errorData = error.response?.data || error;
      if (errorData.actionable) {
        toast.error(errorData.message || 'GNPD file not processed yet', {
          description: 'Please wait for processing to complete or re-upload the file.',
          action: {
            label: 'Retry',
            onClick: () => detectMutation.mutate()
          }
        });
      } else {
        toast.error(errorData.message || 'Failed to detect columns');
      }
    }
  });

  const updateMutation = useMutation({
    mutationFn: (mappings) => base44.functions.invoke('updateGNPDMapping', {
      source_id: source.id,
      mappings
    }),
    onSuccess: () => {
      queryClient.invalidateQueries(['sources']);
      queryClient.invalidateQueries(['projectSources', projectId]);
      toast.success('Column mapping updated');
      setEditedMappings(null);
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to update mapping');
    }
  });

  const currentMappings = editedMappings || source.gnpd_column_mapping || {};
  
  // Get validation from source metadata (computed during mapping save)
  const savedValidation = source.metadata_extraction?.extracted_data?.validation_status;
  
  const validation = savedValidation || {
    rows_loaded: source.gnpd_row_count || 0,
    date_parsing_success_rate: 0,
    date_parsing_success_count: 0,
    date_parsing_failure_count: 0,
    date_range_min: null,
    date_range_max: null,
    unique_markets_count: 0
  };
  const requiredFields = ['record_id', 'product_name', 'market', 'date_published', 'category', 'sub_category'];
  const optionalFields = ['product_variants', 'brand', 'company', 'ultimate_company', 'product_description', 'claims', 'flavours', 'launch_type', 'record_hyperlink'];

  const fieldLabels = {
    record_id: 'Record ID',
    product_name: 'Product',
    market: 'Market',
    date_published: 'Date Published',
    product_variants: 'Product Variants',
    brand: 'Brand',
    company: 'Company',
    ultimate_company: 'Ultimate Company',
    category: 'Category',
    sub_category: 'Sub-Category',
    product_description: 'Product Description',
    claims: 'Claims',
    flavours: 'Flavours',
    launch_type: 'Launch Type',
    record_hyperlink: 'Record hyperlink'
  };

  // Check if mapping is required
  const mappingRequired = source.gnpd_mapping_status !== 'complete';
  const isDetecting = source.gnpd_mapping_status === 'detecting';

  if (mappingRequired && !isDetecting) {
    return (
      <Card className="border-orange-200 bg-orange-50/30">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-orange-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-orange-900 mb-2">GNPD Column Mapping Required</p>
              <p className="text-sm text-orange-800 mb-3">
                This GNPD source needs column mapping before it can be used for product matching.
              </p>
              {source.gnpd_mapping_error && (
                <p className="text-xs text-orange-700 mb-3 p-2 bg-orange-100 rounded">
                  {source.gnpd_mapping_error}
                </p>
              )}
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={() => detectMutation.mutate()}
                  disabled={detectMutation.isPending}
                  className="bg-orange-600 hover:bg-orange-700"
                >
                  {detectMutation.isPending ? 'Detecting...' : 'Auto-Detect Columns'}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShowMapping(true)}
                >
                  Map Manually
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (isDetecting) {
    return (
      <Card className="border-blue-200 bg-blue-50/30">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-blue-900">Detecting columns...</p>
              <p className="text-xs text-blue-700 mt-1">This may take up to 15 seconds</p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const missingRequired = requiredFields.filter(field => !currentMappings[field]);
  const isComplete = missingRequired.length === 0;

  return (
    <Card className={isComplete ? 'border-green-200 bg-green-50/30' : 'border-orange-200 bg-orange-50/30'}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            {isComplete ? (
              <CheckCircle2 className="w-4 h-4 text-green-600" />
            ) : (
              <AlertCircle className="w-4 h-4 text-orange-600" />
            )}
            GNPD Column Mapping
            <Badge variant="outline" className="ml-2 text-xs">Global</Badge>
          </CardTitle>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setShowValidation(!showValidation)}
              className="h-7 text-xs"
            >
              {showValidation ? 'Hide' : 'View'} Validation
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setShowMapping(!showMapping)}
              className="h-7 text-xs"
            >
              <Settings className="w-3 h-3 mr-1" />
              {showMapping ? 'Hide' : 'Edit'} Mapping
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {/* Global mapping notice */}
        <div className="p-2 bg-blue-50 border border-blue-200 rounded text-xs text-blue-800">
          ℹ️ Mapping is shared across projects (global). Changes affect all projects using this source.
        </div>

        {!isComplete && (
          <div className="p-3 bg-orange-100 border border-orange-300 rounded-lg">
            <p className="text-sm font-medium text-orange-900 mb-1">Missing Required Mappings:</p>
            <p className="text-sm text-orange-800">{missingRequired.map(f => fieldLabels[f]).join(', ')}</p>
          </div>
        )}

        {/* Mapping Editor */}
        {showMapping && (
          <div className="space-y-2 p-3 bg-white rounded-lg border">
            <h4 className="text-xs font-semibold text-slate-700 mb-2">Required Fields</h4>
            {requiredFields.map(field => (
              <div key={field} className="grid grid-cols-2 gap-2 items-center">
                <label className="text-xs text-slate-700">{fieldLabels[field]}</label>
                <Select
                  value={currentMappings[field] || ''}
                  onValueChange={(value) => {
                    setEditedMappings({ ...currentMappings, [field]: value });
                  }}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Select column" />
                  </SelectTrigger>
                  <SelectContent>
                    {source.gnpd_headers?.map(col => (
                      <SelectItem key={col} value={col} className="text-xs">{col}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}

            <h4 className="text-xs font-semibold text-slate-700 mb-2 mt-4">Optional Fields</h4>
            {optionalFields.map(field => (
              <div key={field} className="grid grid-cols-2 gap-2 items-center">
                <label className="text-xs text-slate-600">{fieldLabels[field]}</label>
                <Select
                  value={currentMappings[field] || ''}
                  onValueChange={(value) => {
                    setEditedMappings({ ...currentMappings, [field]: value });
                  }}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="(Optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={null} className="text-xs">(Not mapped)</SelectItem>
                    {source.gnpd_headers?.map(col => (
                      <SelectItem key={col} value={col} className="text-xs">{col}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}

            {editedMappings && (
              <div className="flex gap-2 pt-2">
                <Button
                  size="sm"
                  onClick={() => updateMutation.mutate(editedMappings)}
                  disabled={updateMutation.isPending || missingRequired.length > 0}
                  className="h-7 text-xs"
                >
                  {updateMutation.isPending ? 'Saving...' : 'Save Mapping'}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setEditedMappings(null)}
                  className="h-7 text-xs"
                >
                  Cancel
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Validation Summary */}
        {showValidation && (
          <div className="space-y-3 p-3 bg-white rounded-lg border">
            <div>
              <h4 className="text-xs font-semibold text-slate-700 mb-2">Validation Summary</h4>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="text-slate-600">Rows loaded:</div>
                <div className="font-medium">{validation.rows_loaded || 0}</div>

                <div className="text-slate-600">Date parsing success:</div>
                <div className="font-medium">
                  {validation.date_parsing_success_count !== undefined && validation.rows_loaded ? 
                    `${validation.date_parsing_success_count}/${validation.rows_loaded} (${validation.date_parsing_success_rate?.toFixed(1)}%)` : 
                    'N/A'}
                </div>
                
                <div className="text-slate-600">Unique markets:</div>
                <div className="font-medium">
                  {validation.unique_markets_count !== undefined ? validation.unique_markets_count : 'N/A'}
                </div>

                {validation.date_range_min && validation.date_range_max && (
                  <>
                    <div className="text-slate-600">Detected date range:</div>
                    <div className="font-medium">
                      {validation.date_range_min} → {validation.date_range_max}
                    </div>
                  </>
                )}
              </div>

              {/* Readiness Status */}
              <div className="mt-3 pt-3 border-t">
                {isComplete && validation.rows_loaded > 0 ? (
                  validation.date_parsing_success_rate < 80 ? (
                    <div className="flex items-start gap-2 p-2 bg-amber-50 border border-amber-200 rounded">
                      <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-xs font-semibold text-amber-900">GNPD partially ready ⚠️</p>
                        <p className="text-xs text-amber-800 mt-0.5">
                          Date parsing failing — date filters may be unreliable
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 p-2 bg-green-50 border border-green-200 rounded">
                      <CheckCircle2 className="w-4 h-4 text-green-600" />
                      <p className="text-xs font-semibold text-green-900">GNPD ready for matching ✅</p>
                    </div>
                  )
                ) : (
                  <div className="flex items-center gap-2 p-2 bg-orange-50 border border-orange-200 rounded">
                    <AlertCircle className="w-4 h-4 text-orange-600" />
                    <p className="text-xs font-semibold text-orange-900">
                      {!isComplete ? 'Complete required mappings to proceed' : 'No data rows loaded'}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Validation Details */}
            <div className="pt-3 border-t">
              <h4 className="text-xs font-semibold text-slate-700 mb-2">Validation Details</h4>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="text-slate-600">Unique markets:</div>
                <div className="font-medium">{validation.unique_markets_count || 0}</div>

                <div className="text-slate-600">Required mappings:</div>
                <div className="font-medium">
                  {isComplete ? (
                    <span className="text-green-600">✓ Complete</span>
                  ) : (
                    <span className="text-orange-600">✗ Incomplete</span>
                  )}
                </div>
              </div>
            </div>

            {/* Date Parse Failures */}
            {validation.parsing_errors && validation.parsing_errors.length > 0 && (
              <div className="pt-3 border-t">
                <details className="group">
                  <summary className="text-xs font-medium text-amber-900 cursor-pointer hover:text-amber-700">
                    View first 10 date parse failures ({validation.parsing_errors.length})
                  </summary>
                  <div className="mt-2 p-2 bg-amber-50 rounded border border-amber-200 space-y-2">
                    {validation.parsing_errors.map((error, idx) => (
                      <div key={idx} className="text-xs">
                        <div className="font-medium text-amber-900">Row {error.row_index || idx + 1}:</div>
                        <div className="text-amber-800 ml-2">
                          <div>Raw value: <code className="bg-amber-100 px-1 rounded">{String(error.raw_value || error)}</code></div>
                          {error.detected_type && (
                            <div>Detected type: {error.detected_type}</div>
                          )}
                          {error.error && (
                            <div className="text-amber-700">Error: {error.error}</div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </details>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}