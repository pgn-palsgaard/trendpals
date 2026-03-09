import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Library, Search, FileText, Filter, CheckCircle2, Sparkles, AlertTriangle, Calendar } from 'lucide-react';
import { toast } from 'sonner';

export default function SourceLibrary({ project }) {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterRegion, setFilterRegion] = useState('all');
  const [selectedForBulk, setSelectedForBulk] = useState([]);

  // Fetch all standalone sources (not tied to a specific project)
  const { data: allSources = [], isLoading } = useQuery({
    queryKey: ['sourcesLibrary'],
    queryFn: async () => {
      const sources = await base44.entities.Source.list('-created_date', 200);
      return sources.filter(s => s.source_type !== 'knowledge');
    }
  });

  // Get currently selected source IDs for this project
  const selectedSourceIds = project.selected_source_ids || [];

  const linkSourceMutation = useMutation({
    mutationFn: async (sourceId) => {
      const updatedIds = selectedSourceIds.includes(sourceId)
        ? selectedSourceIds.filter(id => id !== sourceId)
        : [...selectedSourceIds, sourceId];
      
      await base44.entities.Project.update(project.id, {
        selected_source_ids: updatedIds
      });
      return updatedIds;
    },
    onSuccess: (updatedIds) => {
      queryClient.invalidateQueries({ queryKey: ['project', project.id] });
      queryClient.invalidateQueries({ queryKey: ['sources', project.id] });
      toast.success('Source linked to project ✓');
      setSelectedForBulk([]);
    },
    onError: () => {
      toast.error('Failed to update source selection');
    }
  });

  const bulkLinkMutation = useMutation({
    mutationFn: async (sourceIds) => {
      const newIds = [...new Set([...selectedSourceIds, ...sourceIds])];
      await base44.entities.Project.update(project.id, {
        selected_source_ids: newIds
      });
      return { count: sourceIds.length, newTotal: newIds.length };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['project', project.id] });
      queryClient.invalidateQueries({ queryKey: ['sources', project.id] });
      toast.success(`${data.count} sources linked to project ✓`);
      setSelectedForBulk([]);
    },
    onError: () => {
      toast.error('Failed to link sources');
    }
  });

  const handleBulkLink = () => {
    if (selectedForBulk.length === 0) return;
    
    if (confirm(`Link ${selectedForBulk.length} source${selectedForBulk.length > 1 ? 's' : ''} to ${project.name}?`)) {
      bulkLinkMutation.mutate(selectedForBulk);
    }
  };

  const toggleBulkSelection = (sourceId) => {
    setSelectedForBulk(prev => 
      prev.includes(sourceId) 
        ? prev.filter(id => id !== sourceId)
        : [...prev, sourceId]
    );
  };

  // Smart sort: project-matched first, then recency
  const sortedSources = useMemo(() => {
    return [...allSources].sort((a, b) => {
      // Calculate match score
      const scoreA = (
        (a.category === project.category ? 2 : 0) +
        (a.region === project.region ? 2 : 0)
      );
      const scoreB = (
        (b.category === project.category ? 2 : 0) +
        (b.region === project.region ? 2 : 0)
      );

      if (scoreA !== scoreB) return scoreB - scoreA;

      // Then by recency
      const dateA = new Date(a.created_date || 0);
      const dateB = new Date(b.created_date || 0);
      return dateB - dateA;
    });
  }, [allSources, project.category, project.region]);

  // Filter sources
  const filteredSources = sortedSources.filter(source => {
    const matchesSearch = !searchQuery || 
      source.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      source.tags?.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()));
    
    const matchesType = filterType === 'all' || source.source_type === filterType;
    const matchesCategory = filterCategory === 'all' || source.category === filterCategory;
    const matchesRegion = filterRegion === 'all' || source.region === filterRegion;

    return matchesSearch && matchesType && matchesCategory && matchesRegion;
  });

  // Suggested sources (project-matched, not already linked, top 3)
  const suggestedSources = useMemo(() => {
    return sortedSources
      .filter(s => 
        !selectedSourceIds.includes(s.id) &&
        ((s.category === project.category || s.region === project.region) ||
         (!s.category && !s.region))
      )
      .slice(0, 3);
  }, [sortedSources, selectedSourceIds, project.category, project.region]);

  // Get unique categories and regions from sources
  const categories = [...new Set(allSources.map(s => s.category).filter(Boolean))];
  const regions = [...new Set(allSources.map(s => s.region).filter(Boolean))];

  // Check for duplicates
  const checkDuplicate = (source) => {
    const similar = allSources.find(s => 
      s.id !== source.id &&
      selectedSourceIds.includes(s.id) &&
      (
        s.title.toLowerCase().includes(source.title.toLowerCase().substring(0, 20)) ||
        source.title.toLowerCase().includes(s.title.toLowerCase().substring(0, 20))
      )
    );
    return similar;
  };

  const getFreshnessIcon = (freshness) => {
    if (freshness === 'recent') return '🟢';
    if (freshness === 'aging') return '🟡';
    return '🔴';
  };

  return (
    <Card className="border-purple-200 bg-purple-50/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Library className="w-5 h-5 text-purple-600" />
          Source Library
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Info Banner */}
        <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-sm text-blue-900">
            💡 <strong>Reuse existing data</strong> from your library or upload new sources below
          </p>
        </div>

        {/* Suggested Sources */}
        {suggestedSources.length > 0 && (
          <div className="p-4 bg-gradient-to-br from-purple-50 to-blue-50 border-2 border-purple-200 rounded-lg">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="w-5 h-5 text-purple-600" />
              <h3 className="font-semibold text-slate-900">Suggested for your project</h3>
            </div>
            <div className="space-y-2">
              {suggestedSources.map(source => {
                const duplicate = checkDuplicate(source);
                
                return (
                  <div
                    key={source.id}
                    className="p-3 bg-white border border-purple-200 rounded-lg hover:border-purple-300 transition-all cursor-pointer"
                    onClick={() => {
                      if (duplicate) {
                        if (confirm(`This source is similar to "${duplicate.title}" (already linked). Link anyway?`)) {
                          linkSourceMutation.mutate(source.id);
                        }
                      } else {
                        linkSourceMutation.mutate(source.id);
                      }
                    }}
                  >
                    <div className="flex items-start gap-3">
                      <Checkbox
                        checked={selectedSourceIds.includes(source.id)}
                        disabled={linkSourceMutation.isPending}
                        className="mt-0.5"
                      />
                      <FileText className="w-4 h-4 text-slate-400 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <h4 className="font-medium text-slate-900 text-sm">{source.title}</h4>
                        <div className="flex items-center gap-2 mt-1 text-xs text-slate-600">
                          <Badge variant="outline" className="text-xs">
                            {source.source_type}
                          </Badge>
                          {source.category && <span>• {source.category}</span>}
                          {source.region && <span>• {source.region}</span>}
                          {source.freshness && (
                            <span>• {getFreshnessIcon(source.freshness)}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
                          {source.excerpts && source.excerpts.length > 0 && (
                            <span>📄 {source.excerpts.length} excerpts</span>
                          )}
                          {source.gnpd_data && source.gnpd_data.length > 0 && (
                            <span>🛒 {source.gnpd_data.length} products</span>
                          )}
                        </div>
                        {duplicate && (
                          <div className="flex items-center gap-1 mt-1 text-xs text-orange-700">
                            <AlertTriangle className="w-3 h-3" />
                            <span>Similar to "{duplicate.title}" (already linked)</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Search and Filters */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="md:col-span-2 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              placeholder="Search sources..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger>
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="mintel">Mintel</SelectItem>
              <SelectItem value="gnpd">GNPD</SelectItem>
              <SelectItem value="report">Report</SelectItem>
              <SelectItem value="url">URL</SelectItem>
            </SelectContent>
          </Select>

          <Select value={filterCategory} onValueChange={setFilterCategory}>
            <SelectTrigger>
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {categories.map(cat => (
                <SelectItem key={cat} value={cat}>{cat}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* All Library Sources */}
        <div>
          <h3 className="text-sm font-semibold text-slate-700 mb-2">
            All library sources ({filteredSources.length})
          </h3>
        </div>

        {/* Sources List */}
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {isLoading ? (
            <div className="text-center py-8 text-slate-500">
              Loading library...
            </div>
          ) : filteredSources.length === 0 ? (
            <div className="text-center py-8 text-slate-500">
              <Library className="w-12 h-12 mx-auto mb-3 text-slate-300" />
              <p>No sources found</p>
              <p className="text-sm mt-1">Upload sources below to build your library</p>
            </div>
          ) : (
            filteredSources.map(source => {
              const isLinked = selectedSourceIds.includes(source.id);
              const isBulkSelected = selectedForBulk.includes(source.id);
              const duplicate = checkDuplicate(source);
              
              return (
                <div
                  key={source.id}
                  className={`p-3 border rounded-lg transition-all ${
                    isLinked 
                      ? 'bg-blue-50 border-blue-300' 
                      : isBulkSelected
                      ? 'bg-purple-50 border-purple-300'
                      : 'bg-white border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {!isLinked && (
                      <div className="mt-1">
                        <Checkbox
                          checked={isBulkSelected}
                          onCheckedChange={() => toggleBulkSelection(source.id)}
                        />
                      </div>
                    )}
                    <FileText className="w-5 h-5 text-slate-400 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <h4 className="font-medium text-slate-900 text-sm">{source.title}</h4>
                        {isLinked && (
                          <Badge className="bg-blue-600 text-white">Linked</Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-1 text-xs text-slate-600">
                        <Badge variant="outline" className="text-xs">
                          {source.source_type}
                        </Badge>
                        {source.category && <span>• {source.category}</span>}
                        {source.region && <span>• {source.region}</span>}
                        {source.date && (
                          <span className="flex items-center gap-1">
                            • <Calendar className="w-3 h-3" />
                            {new Date(source.date).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                          </span>
                        )}
                        {source.freshness && (
                          <Badge variant="outline" className={`text-xs ${
                            source.freshness === 'recent' ? 'border-green-300 bg-green-50 text-green-700' :
                            source.freshness === 'aging' ? 'border-yellow-300 bg-yellow-50 text-yellow-700' :
                            'border-red-300 bg-red-50 text-red-700'
                          }`}>
                            {getFreshnessIcon(source.freshness)}
                          </Badge>
                        )}
                      </div>
                      {/* Data indicators */}
                      <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
                        {source.excerpts && source.excerpts.length > 0 && (
                          <span>📄 {source.excerpts.length} excerpts</span>
                        )}
                        {source.gnpd_data && source.gnpd_data.length > 0 && (
                          <span>🛒 {source.gnpd_data.length} products</span>
                        )}
                        {source.gnpd_data && source.gnpd_data.filter(p => p.has_image).length > 0 && (
                          <span>📷 {source.gnpd_data.filter(p => p.has_image).length} images</span>
                        )}
                      </div>
                      {duplicate && !isLinked && (
                        <div className="flex items-center gap-1 mt-2 p-2 bg-orange-50 border border-orange-200 rounded text-xs text-orange-900">
                          <AlertTriangle className="w-3 h-3 flex-shrink-0" />
                          <span>Similar to "{duplicate.title}" (already linked)</span>
                        </div>
                      )}
                      {source.tags && source.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {source.tags.map((tag, idx) => (
                            <Badge key={idx} variant="outline" className="text-xs">
                              {tag}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                    {!isLinked && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          if (duplicate) {
                            if (confirm(`This source is similar to "${duplicate.title}" (already linked). Link anyway?`)) {
                              linkSourceMutation.mutate(source.id);
                            }
                          } else {
                            linkSourceMutation.mutate(source.id);
                          }
                        }}
                        disabled={linkSourceMutation.isPending}
                        className="flex-shrink-0"
                      >
                        Link
                      </Button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Summary */}
        {selectedSourceIds.length > 0 && (
          <div className="p-3 bg-blue-100 border border-blue-300 rounded-lg">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-blue-700" />
              <span className="text-sm font-medium text-blue-900">
                {selectedSourceIds.length} source{selectedSourceIds.length !== 1 ? 's' : ''} linked to this project
              </span>
            </div>
          </div>
        )}

        {/* Bulk Link Floating Action */}
        {selectedForBulk.length > 0 && (
          <div className="fixed bottom-6 right-6 z-50">
            <div className="bg-purple-600 text-white rounded-lg shadow-lg p-4 flex items-center gap-4">
              <span className="font-medium">
                {selectedForBulk.length} source{selectedForBulk.length > 1 ? 's' : ''} selected
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedForBulk([])}
                  className="bg-white/20 border-white/40 text-white hover:bg-white/30"
                >
                  Clear
                </Button>
                <Button
                  size="sm"
                  onClick={handleBulkLink}
                  disabled={bulkLinkMutation.isPending}
                  className="bg-white text-purple-600 hover:bg-white/90"
                >
                  Link to Project
                </Button>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}