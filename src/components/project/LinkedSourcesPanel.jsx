import React from 'react';
import { base44 } from '@/api/base44Client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { FileText, ExternalLink, Unlink, AlertTriangle, Calendar } from 'lucide-react';
import { toast } from 'sonner';
import GNPDMappingCard from './GNPDMappingCard';

export default function LinkedSourcesPanel({ project, sources }) {
  const queryClient = useQueryClient();

  const unlinkSourceMutation = useMutation({
    mutationFn: async (sourceId) => {
      const updatedIds = (project.selected_source_ids || []).filter(id => id !== sourceId);
      await base44.entities.Project.update(project.id, {
        selected_source_ids: updatedIds
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project', project.id] });
      queryClient.invalidateQueries({ queryKey: ['sources', project.id] });
      toast.success('Source unlinked from project ✓');
    },
    onError: () => {
      toast.error('Failed to unlink source');
    }
  });

  const handleUnlink = (sourceId, sourceName) => {
    if (confirm(`Unlink "${sourceName}" from this project? It will remain in your library for reuse.`)) {
      unlinkSourceMutation.mutate(sourceId);
    }
  };

  const getFreshnessIcon = (freshness) => {
    if (freshness === 'recent') return '🟢';
    if (freshness === 'aging') return '🟡';
    return '🔴';
  };

  const getFreshnessText = (freshness) => {
    if (freshness === 'recent') return 'Fresh';
    if (freshness === 'aging') return 'Aging';
    return 'Outdated';
  };

  const checkRegionMismatch = (source) => {
    if (!source.region || !project.region) return null;
    if (source.region === project.region) return null;
    
    // Check if source has GNPD data with region info
    if (source.gnpd_data && source.gnpd_data.length > 0) {
      const mismatchCount = source.gnpd_data.filter(p => 
        p.country && !p.country.toLowerCase().includes(project.region.toLowerCase())
      ).length;
      
      if (mismatchCount > 0) {
        const percentage = Math.round((mismatchCount / source.gnpd_data.length) * 100);
        return `${percentage}% of products are outside ${project.region} region`;
      }
    }
    
    return `Region: ${source.region} (project targets ${project.region})`;
  };

  return (
    <Card className="border-blue-200 bg-blue-50/30">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            🔗 LINKED SOURCES ({sources.length})
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {sources.length === 0 ? (
          <div className="text-center py-8 text-slate-500">
            <FileText className="w-12 h-12 mx-auto mb-3 text-slate-300" />
            <p className="font-medium">No sources linked yet</p>
            <p className="text-sm mt-1">Browse the library below to add existing data, or upload new sources</p>
          </div>
        ) : (
          sources.map(source => {
            const regionWarning = checkRegionMismatch(source);
            const isOld = source.freshness === 'outdated' || source.freshness === 'aging';
            
            return (
              <Card key={source.id} className="border-slate-200 bg-white">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <FileText className="w-5 h-5 text-slate-400 mt-0.5 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <h4 className="font-semibold text-slate-900 mb-2">{source.title}</h4>
                      
                      {/* Metadata badges */}
                      <div className="flex flex-wrap items-center gap-2 mb-2">
                        <Badge variant="outline" className="text-xs">
                          {source.source_type}
                        </Badge>
                        {source.region && (
                          <Badge variant="outline" className="text-xs">
                            {source.region}
                          </Badge>
                        )}
                        {source.category && (
                          <Badge variant="outline" className="text-xs">
                            {source.category}
                          </Badge>
                        )}
                        {source.date && (
                          <Badge variant="outline" className="text-xs flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {new Date(source.date).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                          </Badge>
                        )}
                        {source.freshness && (
                          <Badge variant="outline" className={`text-xs ${
                            source.freshness === 'recent' ? 'border-green-300 bg-green-50 text-green-700' :
                            source.freshness === 'aging' ? 'border-yellow-300 bg-yellow-50 text-yellow-700' :
                            'border-red-300 bg-red-50 text-red-700'
                          }`}>
                            {getFreshnessIcon(source.freshness)} {getFreshnessText(source.freshness)}
                          </Badge>
                        )}
                      </div>

                      {/* Data stats */}
                      <div className="flex items-center gap-3 text-xs text-slate-600 mb-2">
                        {source.excerpts && source.excerpts.length > 0 && (
                          <span>📄 {source.excerpts.length} excerpts</span>
                        )}
                        {source.gnpd_data && source.gnpd_data.length > 0 && (
                          <>
                            <span>🛒 {source.gnpd_data.length} products</span>
                            {source.gnpd_data.filter(p => p.has_image).length > 0 && (
                              <span>📷 {source.gnpd_data.filter(p => p.has_image).length} with images</span>
                            )}
                          </>
                        )}
                      </div>

                      {/* Warnings */}
                      {regionWarning && (
                        <div className="flex items-start gap-2 p-2 bg-orange-50 border border-orange-200 rounded text-xs text-orange-900 mb-2">
                          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                          <span>{regionWarning}</span>
                        </div>
                      )}

                      {isOld && source.date && (
                        <div className="flex items-start gap-2 p-2 bg-yellow-50 border border-yellow-200 rounded text-xs text-yellow-900 mb-2">
                          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                          <span>
                            Published {Math.floor((new Date() - new Date(source.date)) / (1000 * 60 * 60 * 24 * 30))} months ago - consider updating
                          </span>
                        </div>
                      )}

                      {source.gnpd_data && source.gnpd_data.length > 0 && source.gnpd_data.filter(p => !p.has_image).length === source.gnpd_data.length && (
                        <div className="flex items-start gap-2 p-2 bg-blue-50 border border-blue-200 rounded text-xs text-blue-900 mb-2">
                          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                          <span>No product images available. Upload HTML export to enable visual proof.</span>
                        </div>
                      )}

                      {/* Linked date */}
                      <div className="text-xs text-slate-500">
                        Linked {Math.floor((new Date() - new Date(source.created_date)) / (1000 * 60 * 60 * 24))} days ago
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {source.file_url && (
                        <a href={source.file_url} target="_blank" rel="noopener noreferrer">
                          <Button variant="ghost" size="icon" title="View source">
                            <ExternalLink className="w-4 h-4" />
                          </Button>
                        </a>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleUnlink(source.id, source.title)}
                        disabled={unlinkSourceMutation.isPending}
                        title="Unlink from project"
                      >
                        <Unlink className="w-4 h-4 text-orange-600" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}