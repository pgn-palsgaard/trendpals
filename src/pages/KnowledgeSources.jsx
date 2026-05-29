import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { 
  Upload, 
  Search, 
  Filter, 
  FolderOpen, 
  FileText,
  CheckCircle2,
  AlertCircle,
  Clock
} from 'lucide-react';
import KnowledgeUploadModal from '../components/knowledge/KnowledgeUploadModal';
import KnowledgeFilters from '../components/knowledge/KnowledgeFilters';
import KnowledgeTable from '../components/knowledge/KnowledgeTable';
import BulkEditKnowledgePanel from '../components/knowledge/BulkEditKnowledgePanel';
import RAGProcessingPanel from '../components/knowledge/RAGProcessingPanel';

export default function KnowledgeSources() {
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState([]);
  const [filters, setFilters] = useState({
    subtype: 'all',
    trust_tier: 'all',
    folder_path: '',
    tags: []
  });

  // Fetch knowledge sources
  const { data: sources = [], isLoading, refetch: refetchSources } = useQuery({
    queryKey: ['knowledgeSources', filters, searchQuery],
    queryFn: async () => {
      let query = { source_type: 'knowledge', is_archived: false };
      
      if (filters.subtype !== 'all') {
        query.knowledge_subtype = filters.subtype;
      }
      if (filters.trust_tier !== 'all') {
        query.trust_tier = filters.trust_tier;
      }
      if (filters.folder_path) {
        query.folder_path = filters.folder_path;
      }
      
      const results = await base44.entities.Source.filter(query, '-updated_date', 500);
      
      // Client-side search and tag filtering
      let filtered = results;
      
      if (searchQuery) {
        const lowerQuery = searchQuery.toLowerCase();
        filtered = filtered.filter(s => 
          s.title?.toLowerCase().includes(lowerQuery) ||
          s.relative_path?.toLowerCase().includes(lowerQuery) ||
          s.tags?.some(t => t.toLowerCase().includes(lowerQuery))
        );
      }
      
      if (filters.tags.length > 0) {
        filtered = filtered.filter(s => 
          filters.tags.every(tag => s.tags?.includes(tag))
        );
      }
      
      return filtered;
    }
  });

  // Fetch active upload batches
  const { data: activeBatches = [] } = useQuery({
    queryKey: ['uploadBatches', 'active'],
    queryFn: async () => {
      return await base44.entities.UploadBatch.filter({
        status: ['uploading', 'processing', 'preparing']
      }, '-created_date', 10);
    },
    refetchInterval: 3000 // Poll every 3 seconds for active batches
  });

  // Get unique folder paths for filter
  const folderPaths = [...new Set(sources.map(s => s.folder_path).filter(Boolean))];

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-[1600px] mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Knowledge Sources</h1>
            <p className="text-slate-600 mt-1">
              Palsgaard product sheets, technical docs, capabilities, and internal references
            </p>
          </div>
          <Button
            onClick={() => setShowUploadModal(true)}
            className="bg-blue-600 hover:bg-blue-700"
          >
            <Upload className="w-4 h-4 mr-2" />
            Upload Files
          </Button>
        </div>

        {/* RAG Processing Panel */}
        <RAGProcessingPanel
          sources={sources}
          selectedIds={selectedIds}
          onRefresh={refetchSources}
        />

        {/* Active Upload Batches */}
        {activeBatches.length > 0 && (
          <Card className="border-blue-200 bg-blue-50/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Clock className="w-4 h-4 text-blue-600 animate-pulse" />
                Active Uploads ({activeBatches.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {activeBatches.map(batch => (
                <div key={batch.id} className="p-3 bg-white rounded-lg border border-blue-200">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-slate-900">{batch.batch_name}</span>
                    <Badge variant="outline" className="text-xs">
                      {batch.status}
                    </Badge>
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs text-slate-600">
                      <span>{batch.processed_files} / {batch.total_files} processed</span>
                      <span>{Math.round((batch.processed_files / batch.total_files) * 100)}%</span>
                    </div>
                    <div className="w-full bg-slate-200 rounded-full h-2">
                      <div 
                        className="bg-blue-600 h-2 rounded-full transition-all"
                        style={{ width: `${(batch.processed_files / batch.total_files) * 100}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Stats */}
        <div className="grid grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-600">Total Sources</p>
                  <p className="text-2xl font-bold text-slate-900 mt-1">{sources.length}</p>
                </div>
                <FileText className="w-8 h-8 text-blue-500" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-600">Approved</p>
                  <p className="text-2xl font-bold text-green-600 mt-1">
                    {sources.filter(s => s.trust_tier === 'approved').length}
                  </p>
                </div>
                <CheckCircle2 className="w-8 h-8 text-green-500" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-600">Draft</p>
                  <p className="text-2xl font-bold text-yellow-600 mt-1">
                    {sources.filter(s => s.trust_tier === 'draft').length}
                  </p>
                </div>
                <AlertCircle className="w-8 h-8 text-yellow-500" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-600">Folders</p>
                  <p className="text-2xl font-bold text-slate-900 mt-1">{folderPaths.length}</p>
                </div>
                <FolderOpen className="w-8 h-8 text-purple-500" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Search and Filters */}
        <Card>
          <CardContent className="p-4">
            <div className="flex gap-3">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                  placeholder="Search by title, path, or tags..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Button
                variant="outline"
                onClick={() => setShowFilters(!showFilters)}
              >
                <Filter className="w-4 h-4 mr-2" />
                Filters
              </Button>
            </div>

            {showFilters && (
              <div className="mt-4">
                <KnowledgeFilters
                  filters={filters}
                  onChange={setFilters}
                  folderPaths={folderPaths}
                  availableTags={[...new Set(sources.flatMap(s => s.tags || []))]}
                />
              </div>
            )}
          </CardContent>
        </Card>

        {/* Bulk Actions Bar */}
        {selectedIds.length > 0 && (
          <BulkEditKnowledgePanel
            selectedIds={selectedIds}
            onClearSelection={() => setSelectedIds([])}
          />
        )}

        {/* Sources Table */}
        <KnowledgeTable
          sources={sources}
          isLoading={isLoading}
          selectedIds={selectedIds}
          onSelectionChange={setSelectedIds}
        />

        {/* Upload Modal */}
        {showUploadModal && (
          <KnowledgeUploadModal
            onClose={() => setShowUploadModal(false)}
          />
        )}
      </div>
    </div>
  );
}