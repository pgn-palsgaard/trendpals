import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FileText, Search, ExternalLink, Copy, Calendar, TrendingUp, Download } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { toast } from 'sonner';
import KAMBadge from '@/components/KAMBadge';
import { reportSearchText, matchSnippet, reportFiles } from '@/lib/reportSearch';

export default function ReportsLibrary() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [regionFilter, setRegionFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [deepSearch, setDeepSearch] = useState(true);

  const { data: reports = [], isLoading } = useQuery({
    queryKey: ['reportsLibrary'],
    queryFn: () => base44.entities.Report.list('-created_date', 500)
  });

  const { data: projects = [] } = useQuery({
    queryKey: ['allProjects'],
    queryFn: () => base44.entities.Project.list('-created_date', 100)
  });

  const cloneReportMutation = useMutation({
    mutationFn: async (reportId) => {
      const response = await base44.functions.invoke('cloneReport', { report_id: reportId });
      return response.data;
    },
    onSuccess: (data) => {
      toast.success('Report cloned as new project');
      navigate(createPageUrl(`ProjectDetail?id=${data.project_id}`));
    },
    onError: (error) => {
      toast.error('Failed to clone report');
    }
  });

  // Get unique categories and regions
  const categories = ['all', ...new Set(reports.map(r => r.category).filter(Boolean))];
  const regions = ['all', ...new Set(reports.map(r => r.region).filter(Boolean))];

  // Pre-index every report's full slide content once, so search covers the
  // actual report body — not only its title.
  const searchIndex = useMemo(() => {
    const map = {};
    for (const r of reports) map[r.id] = reportSearchText(r);
    return map;
  }, [reports]);

  const q = searchQuery.trim().toLowerCase();

  const filteredReports = reports.filter(report => {
    const haystack = deepSearch
      ? searchIndex[report.id] || ''
      : [report.title, report.category, report.region].filter(Boolean).join(' ').toLowerCase();
    const matchesSearch = !q || haystack.includes(q);

    const matchesCategory = categoryFilter === 'all' || report.category === categoryFilter;
    const matchesRegion = regionFilter === 'all' || report.region === regionFilter;
    const matchesStatus = statusFilter === 'all' || report.status === statusFilter;

    return matchesSearch && matchesCategory && matchesRegion && matchesStatus;
  });

  const freshnessColors = {
    fresh: 'bg-green-100 text-green-700 border-green-200',
    use_with_caution: 'bg-yellow-100 text-yellow-700 border-yellow-200',
    outdated: 'bg-red-100 text-red-700 border-red-200'
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
        <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 py-8">
      <div className="max-w-7xl mx-auto px-4">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900 mb-2">Reports Library</h1>
          <p className="text-slate-600">
            All generated reports — manual and automatic. Search titles or the full slide content.
          </p>
        </div>

        {/* Filters */}
        <Card className="mb-6">
          <CardContent className="p-4">
            <div className="grid md:grid-cols-4 gap-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                  placeholder="Search titles, trends, products, slide text…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map(cat => (
                    <SelectItem key={cat} value={cat}>
                      {cat === 'all' ? 'All Categories' : cat}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={regionFilter} onValueChange={setRegionFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Region" />
                </SelectTrigger>
                <SelectContent>
                  {regions.map(reg => (
                    <SelectItem key={reg} value={reg}>
                      {reg === 'all' ? 'All Regions' : reg}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="published">Published</SelectItem>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="aged">Aged</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 mt-3 pt-3 border-t">
              <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={deepSearch}
                  onChange={(e) => setDeepSearch(e.target.checked)}
                  className="rounded border-slate-300"
                />
                Search inside report content (slides, trends, products)
              </label>
              <p className="text-xs text-slate-500">
                {filteredReports.length} of {reports.length} reports
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Reports Grid */}
        {filteredReports.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <div className="text-5xl mb-4">📊</div>
              <p className="text-slate-900 font-medium mb-2">No reports found</p>
              <p className="text-sm text-slate-600">Try adjusting your filters or create a new project</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredReports.map(report => {
              const project = projects.find(p => p.id === report.project_id);
              const snippet = q && deepSearch ? matchSnippet(searchIndex[report.id] || '', q) : null;
              const files = reportFiles(report);
              return (
                <Card key={report.id} className="hover:shadow-lg transition-shadow">
                  <CardHeader>
                    <div className="flex items-start justify-between mb-2">
                      <CardTitle className="text-lg line-clamp-2">{report.title}</CardTitle>
                      {report.freshness && (
                        <Badge className={`${freshnessColors[report.freshness]} border text-xs`}>
                          {report.freshness === 'use_with_caution' ? 'aging' : report.freshness}
                        </Badge>
                      )}
                    </div>
                    {report.analysis_mode === 'product_first' && (
                      <div className="mb-2"><KAMBadge /></div>
                    )}
                    {project && (project.customer_name || project.meeting_context || project.requester_name) && (
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500 mt-1 mb-2">
                        {project.customer_name && (
                          <span><span className="font-medium text-gray-600">Customer:</span> {project.customer_name}</span>
                        )}
                        {project.meeting_context && (
                          <span><span className="font-medium text-gray-600">Meeting:</span> {
                            { discovery: 'Discovery', innovation_day: 'Innovation Day', technical_workshop: 'Technical Workshop', other: 'Other' }[project.meeting_context] || project.meeting_context
                          }</span>
                        )}
                        {project.requester_name && (
                          <span><span className="font-medium text-gray-600">Requested by:</span> {project.requester_name}</span>
                        )}
                      </div>
                    )}
                    <div className="flex items-center gap-2 text-sm text-slate-600">
                      <span>{report.category}</span>
                      <span>•</span>
                      <span>{report.region}</span>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {snippet && (
                      <p className="text-xs text-slate-600 bg-amber-50 border border-amber-100 rounded p-2 line-clamp-3">
                        {snippet}
                      </p>
                    )}

                    {/* Stats */}
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="p-2 bg-slate-50 rounded">
                        <p className="text-xs text-slate-600">Slides</p>
                        <p className="text-lg font-bold text-slate-900">{report.slides?.length || 0}</p>
                      </div>
                      <div className="p-2 bg-slate-50 rounded">
                        <p className="text-xs text-slate-600">Products</p>
                        <p className="text-lg font-bold text-slate-900">{report.product_shortlist?.length || 0}</p>
                      </div>
                      <div className="p-2 bg-slate-50 rounded">
                        <p className="text-xs text-slate-600">Version</p>
                        <p className="text-lg font-bold text-slate-900">{report.version}</p>
                      </div>
                    </div>

                    {/* Trends */}
                    {report.selected_trends && report.selected_trends.length > 0 && (
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <TrendingUp className="w-4 h-4 text-slate-400" />
                          <p className="text-xs font-medium text-slate-600">Trends</p>
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {report.selected_trends.slice(0, 3).map((trend, idx) => (
                            <Badge key={idx} variant="outline" className="text-xs">
                              {trend}
                            </Badge>
                          ))}
                          {report.selected_trends.length > 3 && (
                            <Badge variant="outline" className="text-xs">
                              +{report.selected_trends.length - 3}
                            </Badge>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Date */}
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <Calendar className="w-3 h-3" />
                      <span>{new Date(report.created_date).toLocaleDateString()}</span>
                    </div>

                    {/* Downloadable deck files */}
                    {(files.pptx || files.pdf) && (
                      <div className="flex flex-wrap gap-2">
                        {files.pptx && (
                          <a href={files.pptx} target="_blank" rel="noopener noreferrer">
                            <Badge className="bg-green-100 text-green-700 border-green-200 cursor-pointer hover:bg-green-200 gap-1">
                              <Download className="w-3 h-3" /> PPTX
                            </Badge>
                          </a>
                        )}
                        {files.pdf && (
                          <a href={files.pdf} target="_blank" rel="noopener noreferrer">
                            <Badge className="bg-green-100 text-green-700 border-green-200 cursor-pointer hover:bg-green-200 gap-1">
                              <Download className="w-3 h-3" /> PDF
                            </Badge>
                          </a>
                        )}
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex gap-2 pt-2 border-t">
                      <Link to={createPageUrl(`ReportView?id=${report.id}`)} className="flex-1">
                        <Button variant="outline" size="sm" className="w-full">
                          <FileText className="w-4 h-4 mr-2" />
                          View
                        </Button>
                      </Link>
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => cloneReportMutation.mutate(report.id)}
                      >
                        <Copy className="w-4 h-4" />
                      </Button>
                      {report.gamma_url && (
                        <a href={report.gamma_url} target="_blank" rel="noopener noreferrer">
                          <Button variant="outline" size="sm">
                            <ExternalLink className="w-4 h-4" />
                          </Button>
                        </a>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}