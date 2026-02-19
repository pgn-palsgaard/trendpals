import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Search, Upload, Link as LinkIcon, Filter, Download, Archive, Trash2, Tag, Settings } from 'lucide-react';
import { toast } from 'sonner';
import SourceFiltersPanel from '../components/database/SourceFiltersPanel';
import SourceTable from '../components/database/SourceTable';
import SourceDetailDrawer from '../components/database/SourceDetailDrawer';
import UploadSourceModal from '../components/database/UploadSourceModal';
import AddUrlModal from '../components/database/AddUrlModal';
import BulkActionsBar from '../components/database/BulkActionsBar';

export default function SourcesDatabase() {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSourceIds, setSelectedSourceIds] = useState([]);
  const [selectedSource, setSelectedSource] = useState(null);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showUrlModal, setShowUrlModal] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  
  // Filters state
  const [filters, setFilters] = useState({
    types: [],
    region: 'all',
    category: 'all',
    freshness: 'all',
    trustTier: [],
    usagePermission: [],
    usageStatus: 'all',
    datePublishedFrom: null,
    datePublishedTo: null,
    uploadedWithin: 'all',
    uploader: 'all',
    tags: [],
    showArchived: false
  });

  const [sortBy, setSortBy] = useState('uploaded_desc'); // smart, uploaded_desc, used_desc, published_desc, title_asc, usage_count_desc, least_used

  // Fetch all sources
  const { data: allSources = [], isLoading } = useQuery({
    queryKey: ['sourcesDatabase'],
    queryFn: async () => {
      const sources = await base44.entities.Source.list('-created_date', 1000);
      return sources;
    }
  });

  // Fetch all projects for usage tracking
  const { data: allProjects = [] } = useQuery({
    queryKey: ['allProjects'],
    queryFn: async () => {
      const projects = await base44.entities.Project.list('-created_date', 500);
      return projects;
    }
  });

  // Calculate usage for each source
  const sourcesWithUsage = useMemo(() => {
    return allSources.map(source => {
      const linkedProjects = allProjects.filter(p => 
        p.selected_source_ids?.includes(source.id)
      );
      const lastUsed = linkedProjects.length > 0 
        ? new Date(Math.max(...linkedProjects.map(p => new Date(p.updated_date))))
        : null;
      
      return {
        ...source,
        linkedProjects,
        usageCount: linkedProjects.length,
        lastUsed
      };
    });
  }, [allSources, allProjects]);

  // Apply filters and search
  const filteredSources = useMemo(() => {
    return sourcesWithUsage.filter(source => {
      // Search
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesSearch = 
          source.title?.toLowerCase().includes(query) ||
          source.tags?.some(tag => tag.toLowerCase().includes(query)) ||
          source.notes?.toLowerCase().includes(query) ||
          source.created_by?.toLowerCase().includes(query);
        if (!matchesSearch) return false;
      }

      // Archived filter
      if (!filters.showArchived && source.is_archived) return false;

      // Type filter
      if (filters.types.length > 0 && !filters.types.includes(source.source_type)) return false;

      // Region filter
      if (filters.region !== 'all' && source.region !== filters.region) return false;

      // Category filter
      if (filters.category !== 'all' && source.category !== filters.category) return false;

      // Freshness filter
      if (filters.freshness !== 'all' && source.freshness !== filters.freshness) return false;

      // Trust tier filter
      if (filters.trustTier.length > 0 && !filters.trustTier.includes(source.trust_tier)) return false;

      // Usage permission filter
      if (filters.usagePermission.length > 0 && !filters.usagePermission.includes(source.usage_permission)) return false;

      // Usage status filter
      if (filters.usageStatus === 'active' && source.usageCount === 0) return false;
      if (filters.usageStatus === 'unused' && source.usageCount > 0) return false;

      // Date published filter
      if (filters.datePublishedFrom && source.date) {
        if (new Date(source.date) < new Date(filters.datePublishedFrom)) return false;
      }
      if (filters.datePublishedTo && source.date) {
        if (new Date(source.date) > new Date(filters.datePublishedTo)) return false;
      }

      // Uploaded within filter
      if (filters.uploadedWithin !== 'all') {
        const uploadDate = new Date(source.created_date);
        const now = new Date();
        const daysDiff = Math.floor((now - uploadDate) / (1000 * 60 * 60 * 24));
        
        if (filters.uploadedWithin === '30' && daysDiff > 30) return false;
        if (filters.uploadedWithin === '90' && daysDiff > 90) return false;
        if (filters.uploadedWithin === '365' && daysDiff > 365) return false;
      }

      // Tags filter
      if (filters.tags.length > 0) {
        const hasAllTags = filters.tags.every(tag => source.tags?.includes(tag));
        if (!hasAllTags) return false;
      }

      return true;
    });
  }, [sourcesWithUsage, searchQuery, filters]);

  // Apply sorting
  const sortedSources = useMemo(() => {
    const sources = [...filteredSources];
    
    switch (sortBy) {
      case 'uploaded_desc':
        return sources.sort((a, b) => new Date(b.created_date) - new Date(a.created_date));
      case 'used_desc':
        return sources.sort((a, b) => {
          if (!a.lastUsed && !b.lastUsed) return 0;
          if (!a.lastUsed) return 1;
          if (!b.lastUsed) return -1;
          return new Date(b.lastUsed) - new Date(a.lastUsed);
        });
      case 'published_desc':
        return sources.sort((a, b) => {
          if (!a.date && !b.date) return 0;
          if (!a.date) return 1;
          if (!b.date) return -1;
          return new Date(b.date) - new Date(a.date);
        });
      case 'title_asc':
        return sources.sort((a, b) => a.title.localeCompare(b.title));
      case 'usage_count_desc':
        return sources.sort((a, b) => b.usageCount - a.usageCount);
      case 'least_used':
        return sources.sort((a, b) => a.usageCount - b.usageCount);
      default:
        return sources;
    }
  }, [filteredSources, sortBy]);

  // Pagination
  const totalPages = Math.ceil(sortedSources.length / pageSize);
  const paginatedSources = sortedSources.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  // Get unique values for filters
  const categories = [...new Set(allSources.map(s => s.category).filter(Boolean))];
  const regions = [...new Set(allSources.map(s => s.region).filter(Boolean))];
  const allTags = [...new Set(allSources.flatMap(s => s.tags || []))];

  const handleSourceClick = (source) => {
    setSelectedSource(source);
  };

  const handleSelectAll = (checked) => {
    if (checked) {
      setSelectedSourceIds(paginatedSources.map(s => s.id));
    } else {
      setSelectedSourceIds([]);
    }
  };

  const handleSelectSource = (sourceId, checked) => {
    if (checked) {
      setSelectedSourceIds([...selectedSourceIds, sourceId]);
    } else {
      setSelectedSourceIds(selectedSourceIds.filter(id => id !== sourceId));
    }
  };

  const clearFilters = () => {
    setFilters({
      types: [],
      region: 'all',
      category: 'all',
      freshness: 'all',
      trustTier: [],
      usagePermission: [],
      usageStatus: 'all',
      datePublishedFrom: null,
      datePublishedTo: null,
      uploadedWithin: 'all',
      uploader: 'all',
      tags: [],
      showArchived: false
    });
    setSearchQuery('');
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 sticky top-16 z-40">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-slate-900">Source Library</h1>
            <div className="flex items-center gap-3">
              <div className="relative w-96">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                  placeholder="Search sources..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Button onClick={() => setShowUrlModal(true)} variant="outline">
                <LinkIcon className="w-4 h-4 mr-2" />
                Add URL
              </Button>
              <Button onClick={() => setShowUploadModal(true)}>
                <Upload className="w-4 h-4 mr-2" />
                Upload
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex">
        {/* Left Filters Panel */}
        <SourceFiltersPanel
          filters={filters}
          setFilters={setFilters}
          categories={categories}
          regions={regions}
          allTags={allTags}
          clearFilters={clearFilters}
          sourceCounts={{
            mintel: allSources.filter(s => s.source_type === 'mintel').length,
            gnpd: allSources.filter(s => s.source_type === 'gnpd').length,
            report: allSources.filter(s => s.source_type === 'report').length,
            url: allSources.filter(s => s.source_type === 'url').length,
            high: allSources.filter(s => s.trust_tier === 'high').length,
            medium: allSources.filter(s => s.trust_tier === 'medium').length,
            low: allSources.filter(s => s.trust_tier === 'low').length,
            active: sourcesWithUsage.filter(s => s.usageCount > 0).length,
            unused: sourcesWithUsage.filter(s => s.usageCount === 0).length,
          }}
        />

        {/* Main Table Area */}
        <div className="flex-1 p-6">
          <Card>
            <CardContent className="p-0">
              {/* Toolbar */}
              <div className="p-4 border-b border-slate-200 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-sm text-slate-600">
                    {filteredSources.length} sources
                  </span>
                  {selectedSourceIds.length > 0 && (
                    <span className="text-sm font-medium text-blue-600">
                      {selectedSourceIds.length} selected
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value)}
                    className="text-sm border border-slate-200 rounded px-3 py-1.5"
                  >
                    <option value="uploaded_desc">Recently uploaded</option>
                    <option value="used_desc">Recently used</option>
                    <option value="published_desc">Publication date (newest)</option>
                    <option value="title_asc">Title (A-Z)</option>
                    <option value="usage_count_desc">Most used</option>
                    <option value="least_used">Least used</option>
                  </select>
                </div>
              </div>

              {/* Table */}
              {isLoading ? (
                <div className="text-center py-12 text-slate-500">
                  Loading library...
                </div>
              ) : paginatedSources.length === 0 ? (
                <div className="text-center py-12">
                  <div className="text-slate-400 mb-3">
                    <Upload className="w-16 h-16 mx-auto" />
                  </div>
                  {searchQuery || Object.values(filters).some(f => f !== 'all' && f !== false && (Array.isArray(f) ? f.length > 0 : true)) ? (
                    <>
                      <p className="text-slate-900 font-medium mb-1">No sources match your search</p>
                      <p className="text-sm text-slate-600 mb-4">Try different keywords or clear filters to see more results</p>
                      <Button variant="outline" onClick={clearFilters}>Clear filters</Button>
                    </>
                  ) : (
                    <>
                      <p className="text-slate-900 font-medium mb-1">Your source library is empty</p>
                      <p className="text-sm text-slate-600 mb-4">Upload Mintel reports, GNPD exports, and other market data to build your evidence base</p>
                      <div className="flex gap-2 justify-center">
                        <Button onClick={() => setShowUploadModal(true)}>Upload first source</Button>
                        <Button variant="outline" onClick={() => setShowUrlModal(true)}>Add URL</Button>
                      </div>
                    </>
                  )}
                </div>
              ) : (
                <>
                  <SourceTable
                    sources={paginatedSources}
                    selectedIds={selectedSourceIds}
                    onSelectAll={handleSelectAll}
                    onSelectSource={handleSelectSource}
                    onSourceClick={handleSourceClick}
                  />

                  {/* Pagination */}
                  {totalPages > 1 && (
                    <div className="p-4 border-t border-slate-200 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-slate-600">Rows per page:</span>
                        <select
                          value={pageSize}
                          onChange={(e) => {
                            setPageSize(Number(e.target.value));
                            setCurrentPage(1);
                          }}
                          className="text-sm border border-slate-200 rounded px-2 py-1"
                        >
                          <option value={25}>25</option>
                          <option value={50}>50</option>
                          <option value={100}>100</option>
                        </select>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                          disabled={currentPage === 1}
                        >
                          Previous
                        </Button>
                        <span className="text-sm text-slate-600">
                          Page {currentPage} of {totalPages}
                        </span>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                          disabled={currentPage === totalPages}
                        >
                          Next
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Detail Drawer */}
      {selectedSource && (
        <SourceDetailDrawer
          source={selectedSource}
          linkedProjects={sourcesWithUsage.find(s => s.id === selectedSource.id)?.linkedProjects || []}
          onClose={() => setSelectedSource(null)}
        />
      )}

      {/* Upload Modal */}
      {showUploadModal && (
        <UploadSourceModal
          onClose={() => setShowUploadModal(false)}
        />
      )}

      {/* Add URL Modal */}
      {showUrlModal && (
        <AddUrlModal
          onClose={() => setShowUrlModal(false)}
        />
      )}

      {/* Bulk Actions Bar */}
      {selectedSourceIds.length > 0 && (
        <BulkActionsBar
          selectedIds={selectedSourceIds}
          onClear={() => setSelectedSourceIds([])}
          sources={allSources}
        />
      )}
    </div>
  );
}