import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, Database, Eye } from 'lucide-react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';

export default function ReportsLibrary() {
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [regionFilter, setRegionFilter] = useState('all');

  const { data: reports = [], isLoading } = useQuery({
    queryKey: ['publishedReports'],
    queryFn: () => base44.entities.Report.filter({ status: 'published' }, '-updated_date', 100),
  });

  const filteredReports = reports.filter(report => {
    const matchesSearch = 
      report.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      report.category?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      report.region?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      report.selected_trends?.some(t => t.toLowerCase().includes(searchQuery.toLowerCase()));
    
    const matchesCategory = categoryFilter === 'all' || report.category === categoryFilter;
    const matchesRegion = regionFilter === 'all' || report.region === regionFilter;
    
    return matchesSearch && matchesCategory && matchesRegion;
  });

  const categories = ['all', ...new Set(reports.map(r => r.category).filter(Boolean))];
  const regions = ['all', ...new Set(reports.map(r => r.region).filter(Boolean))];

  const freshnessColors = {
    fresh: 'bg-green-500',
    use_with_caution: 'bg-yellow-500',
    outdated: 'bg-red-500'
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 py-8">
      <div className="max-w-7xl mx-auto px-4">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900 mb-2">Reports Library</h1>
          <p className="text-slate-600">{reports.length} published reports</p>
        </div>

        {/* Filters */}
        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                  placeholder="Search reports..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="All Categories" />
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
                  <SelectValue placeholder="All Regions" />
                </SelectTrigger>
                <SelectContent>
                  {regions.map(reg => (
                    <SelectItem key={reg} value={reg}>
                      {reg === 'all' ? 'All Regions' : reg}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Reports Grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <div key={i} className="h-64 bg-white rounded-lg shadow animate-pulse" />
            ))}
          </div>
        ) : filteredReports.length === 0 ? (
          <Card>
            <CardContent className="py-16 text-center">
              <Database className="w-12 h-12 text-slate-300 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-slate-900 mb-2">No reports found</h3>
              <p className="text-slate-600">
                {searchQuery || categoryFilter !== 'all' || regionFilter !== 'all'
                  ? 'Try adjusting your filters'
                  : 'Published reports will appear here'
                }
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredReports.map(report => (
              <Card key={report.id} className="hover:shadow-lg transition-all group border-2 border-transparent hover:border-purple-400">
                <CardContent className="p-6">
                  <div className="flex items-start justify-between mb-4">
                    <h3 className="font-semibold text-lg text-slate-900 group-hover:text-purple-600 transition-colors line-clamp-2 flex-1">
                      {report.title}
                    </h3>
                    <span className={`w-3 h-3 rounded-full ml-2 flex-shrink-0 mt-1 ${freshnessColors[report.freshness || 'fresh']}`} />
                  </div>
                  
                  <div className="space-y-2 text-sm mb-4">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-slate-700">Category:</span>
                      <span className="text-slate-600">{report.category}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-slate-700">Region:</span>
                      <span className="text-slate-600">{report.region}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-slate-700">Slides:</span>
                      <span className="text-slate-600">{report.slides?.length || 0}</span>
                    </div>
                  </div>

                  {report.selected_trends && report.selected_trends.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-4">
                      {report.selected_trends.slice(0, 3).map((trend, idx) => (
                        <span key={idx} className="text-xs px-2 py-1 bg-purple-100 text-purple-700 rounded-full">
                          {trend}
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="pt-4 border-t">
                    <Link to={createPageUrl(`ReportView?id=${report.id}`)}>
                      <Button className="w-full bg-purple-600 hover:bg-purple-700">
                        <Eye className="w-4 h-4 mr-2" />
                        View Report
                      </Button>
                    </Link>
                  </div>

                  <div className="mt-3 text-xs text-slate-500 text-center">
                    Published {new Date(report.created_date).toLocaleDateString()}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}