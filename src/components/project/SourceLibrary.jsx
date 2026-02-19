import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Library, Search, FileText, Filter, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';

export default function SourceLibrary({ project }) {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterRegion, setFilterRegion] = useState('all');

  // Fetch all standalone sources (not tied to a specific project)
  const { data: allSources = [], isLoading } = useQuery({
    queryKey: ['sourcesLibrary'],
    queryFn: async () => {
      const sources = await base44.entities.Source.list('-created_date', 200);
      return sources;
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
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project', project.id] });
      queryClient.invalidateQueries({ queryKey: ['sources', project.id] });
      toast.success('Source selection updated');
    },
    onError: () => {
      toast.error('Failed to update source selection');
    }
  });

  // Filter sources
  const filteredSources = allSources.filter(source => {
    const matchesSearch = !searchQuery || 
      source.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      source.tags?.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()));
    
    const matchesType = filterType === 'all' || source.source_type === filterType;
    const matchesCategory = filterCategory === 'all' || source.category === filterCategory;
    const matchesRegion = filterRegion === 'all' || source.region === filterRegion;

    return matchesSearch && matchesType && matchesCategory && matchesRegion;
  });

  // Get unique categories and regions from sources
  const categories = [...new Set(allSources.map(s => s.category).filter(Boolean))];
  const regions = [...new Set(allSources.map(s => s.region).filter(Boolean))];

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
        <div className="p-4 bg-purple-100 border border-purple-300 rounded-lg">
          <p className="text-sm text-purple-900">
            💡 <strong>Browse and select existing sources</strong> from your library instead of re-uploading them for each project.
          </p>
        </div>

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
              const isSelected = selectedSourceIds.includes(source.id);
              
              return (
                <div
                  key={source.id}
                  className={`p-3 border rounded-lg transition-all cursor-pointer ${
                    isSelected 
                      ? 'bg-purple-50 border-purple-300' 
                      : 'bg-white border-slate-200 hover:border-purple-200'
                  }`}
                  onClick={() => linkSourceMutation.mutate(source.id)}
                >
                  <div className="flex items-start gap-3">
                    <div className="mt-1">
                      <Checkbox
                        checked={isSelected}
                        disabled={linkSourceMutation.isPending}
                      />
                    </div>
                    <FileText className="w-5 h-5 text-slate-400 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <h4 className="font-medium text-slate-900 text-sm">{source.title}</h4>
                        {isSelected && (
                          <Badge className="bg-purple-600 text-white">Selected</Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-1 text-xs text-slate-600">
                        <Badge variant="outline" className="text-xs">
                          {source.source_type}
                        </Badge>
                        {source.category && <span>• {source.category}</span>}
                        {source.region && <span>• {source.region}</span>}
                        {source.date && <span>• {new Date(source.date).toLocaleDateString()}</span>}
                      </div>
                      {/* Data indicators */}
                      <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
                        {source.excerpts && source.excerpts.length > 0 && (
                          <span>📄 {source.excerpts.length} excerpts</span>
                        )}
                        {source.gnpd_data && source.gnpd_data.length > 0 && (
                          <span>🛒 {source.gnpd_data.length} products</span>
                        )}
                      </div>
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
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Summary */}
        {selectedSourceIds.length > 0 && (
          <div className="p-3 bg-purple-100 border border-purple-300 rounded-lg">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-purple-700" />
              <span className="text-sm font-medium text-purple-900">
                {selectedSourceIds.length} source{selectedSourceIds.length !== 1 ? 's' : ''} selected for this project
              </span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}