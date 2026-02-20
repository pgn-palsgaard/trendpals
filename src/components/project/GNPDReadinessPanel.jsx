import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CheckCircle2, AlertCircle, XCircle, Database, FileText, Image } from 'lucide-react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';

export default function GNPDReadinessPanel({ project, linkedSources }) {
  // Find GNPD source
  const gnpdSource = linkedSources?.find(s => s.source_type === 'gnpd');
  
  // Find narrative sources (mintel, report, etc.)
  const narrativeSources = linkedSources?.filter(s => 
    s.source_type === 'mintel' || s.source_type === 'report'
  ) || [];
  
  // Check column mapping
  const { data: mapping } = useQuery({
    queryKey: ['gnpdMapping', gnpdSource?.id],
    queryFn: async () => {
      if (!gnpdSource) return null;
      const mappings = await base44.entities.GNPDColumnMapping.filter({ source_id: gnpdSource.id });
      return mappings.length > 0 ? mappings[0] : null;
    },
    enabled: !!gnpdSource?.id
  });
  
  // Determine GNPD readiness
  const gnpdReady = gnpdSource && 
    gnpdSource.gnpd_processing_status === 'ready' &&
    gnpdSource.gnpd_row_count > 0 &&
    mapping?.validation_status?.required_mappings_complete;
  
  const gnpdPartial = gnpdSource && 
    gnpdSource.gnpd_processing_status === 'ready' &&
    (!mapping || !mapping.validation_status?.required_mappings_complete);
  
  const gnpdFailed = gnpdSource?.gnpd_processing_status === 'failed';
  const gnpdProcessing = gnpdSource?.gnpd_processing_status === 'processing';
  
  // Check narrative sources
  const narrativeReady = narrativeSources.length > 0;
  
  // Check packshot capability (HTML source)
  const hasPackshotSource = linkedSources?.some(s => 
    s.file_url?.toLowerCase().endsWith('.html')
  );
  
  // Overall readiness
  const isReady = gnpdReady && narrativeReady;
  const hasWarnings = !gnpdReady || !narrativeReady;
  const hasBlockers = !gnpdSource || gnpdFailed;
  
  return (
    <Card className={
      hasBlockers ? 'border-red-200 bg-red-50/30' :
      hasWarnings ? 'border-orange-200 bg-orange-50/30' :
      'border-green-200 bg-green-50/30'
    }>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Database className="w-4 h-4" />
            Data Readiness
          </CardTitle>
          {isReady && (
            <Badge variant="outline" className="text-green-700 border-green-300">
              Ready
            </Badge>
          )}
          {hasWarnings && !hasBlockers && (
            <Badge variant="outline" className="text-orange-700 border-orange-300">
              Incomplete
            </Badge>
          )}
          {hasBlockers && (
            <Badge variant="outline" className="text-red-700 border-red-300">
              Blocked
            </Badge>
          )}
        </div>
      </CardHeader>
      
      <CardContent className="space-y-3">
        {/* GNPD Source Status */}
        <div className="space-y-2">
          <div className="flex items-start gap-2">
            {gnpdReady && <CheckCircle2 className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />}
            {gnpdPartial && <AlertCircle className="w-4 h-4 text-orange-600 mt-0.5 flex-shrink-0" />}
            {(gnpdFailed || !gnpdSource) && <XCircle className="w-4 h-4 text-red-600 mt-0.5 flex-shrink-0" />}
            {gnpdProcessing && <AlertCircle className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0 animate-pulse" />}
            
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-900">GNPD Source</p>
              {gnpdReady && (
                <p className="text-xs text-slate-600">
                  {gnpdSource.gnpd_row_count} products • 
                  {gnpdSource.metadata_extraction?.extracted_data?.unique_markets_count 
                    ? ` ${gnpdSource.metadata_extraction.extracted_data.unique_markets_count} markets • `
                    : ' '}
                  {gnpdSource.metadata_extraction?.extracted_data?.min_date_published && 
                   gnpdSource.metadata_extraction?.extracted_data?.max_date_published && 
                   `${gnpdSource.metadata_extraction.extracted_data.min_date_published} to ${gnpdSource.metadata_extraction.extracted_data.max_date_published}`}
                </p>
              )}
              {gnpdPartial && (
                <p className="text-xs text-orange-700">Column mapping incomplete</p>
              )}
              {gnpdFailed && (
                <p className="text-xs text-red-700">
                  {gnpdSource.gnpd_processing_error || 'Processing failed'}
                </p>
              )}
              {gnpdProcessing && (
                <p className="text-xs text-blue-700">Processing GNPD data...</p>
              )}
              {!gnpdSource && (
                <p className="text-xs text-red-700">No GNPD source linked to this project</p>
              )}
            </div>
            
            {(gnpdFailed || gnpdPartial || !gnpdSource) && (
              <Link to={createPageUrl('SourcesDatabase')}>
                <Button size="sm" variant="outline" className="h-7 text-xs">
                  Fix
                </Button>
              </Link>
            )}
          </div>
        </div>
        
        {/* Narrative Sources Status */}
        <div className="space-y-2">
          <div className="flex items-start gap-2">
            {narrativeReady ? (
              <CheckCircle2 className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-orange-600 mt-0.5 flex-shrink-0" />
            )}
            
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-900">Narrative Sources</p>
              {narrativeReady ? (
                <p className="text-xs text-slate-600">
                  {narrativeSources.length} source{narrativeSources.length !== 1 ? 's' : ''} linked
                </p>
              ) : (
                <p className="text-xs text-orange-700">No Mintel or report sources linked</p>
              )}
            </div>
            
            {!narrativeReady && (
              <Link to={createPageUrl('SourcesDatabase')}>
                <Button size="sm" variant="outline" className="h-7 text-xs">
                  Add
                </Button>
              </Link>
            )}
          </div>
        </div>
        
        {/* Packshot Capability */}
        <div className="space-y-2">
          <div className="flex items-start gap-2">
            {hasPackshotSource ? (
              <CheckCircle2 className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-slate-400 mt-0.5 flex-shrink-0" />
            )}
            
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-900">Packshot Images</p>
              {hasPackshotSource ? (
                <p className="text-xs text-slate-600">HTML source available</p>
              ) : (
                <p className="text-xs text-slate-500">Optional - upload HTML for automatic extraction</p>
              )}
            </div>
          </div>
        </div>
        
        {/* Blocker Message */}
        {hasBlockers && (
          <div className="pt-2 border-t border-red-200">
            <p className="text-xs text-red-800 font-medium">
              ⚠️ Trend analysis and product proof generation are blocked until GNPD data is ready.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}