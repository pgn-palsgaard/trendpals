import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Plus, TrendingUp, FileText, Database, Search } from 'lucide-react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';

export default function Home() {
  const [searchQuery, setSearchQuery] = useState('');

  const { data: projects = [], isLoading: projectsLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: () => base44.entities.Project.list('-updated_date', 20),
  });

  const { data: reports = [], isLoading: reportsLoading } = useQuery({
    queryKey: ['reports'],
    queryFn: () => base44.entities.Report.filter({ status: 'published' }, '-updated_date', 10),
  });

  const draftProjects = projects.filter(p => p.state === 'draft' || p.state === 'evidence_sufficient');
  const publishableProjects = projects.filter(p => p.state === 'publishable');

  const filteredReports = reports.filter(r =>
    r.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    r.category?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    r.region?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="max-w-7xl mx-auto p-8">
        {/* Header */}
        <div className="mb-12">
          <h1 className="text-4xl font-bold text-slate-900 mb-3">Trend Intelligence System</h1>
          <p className="text-lg text-slate-600">Transform raw data into credible, evidence-backed regional trend reports</p>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-12">
          <Card className="border-2 border-slate-200 hover:border-blue-400 transition-all cursor-pointer group">
            <Link to={createPageUrl('NewProject')}>
              <CardHeader className="pb-4">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-blue-100 rounded-lg group-hover:bg-blue-200 transition-colors">
                    <Plus className="w-6 h-6 text-blue-600" />
                  </div>
                  <CardTitle className="text-xl">New Project</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-slate-600">Start a new trend report project with source data</p>
              </CardContent>
            </Link>
          </Card>

          <Card className="border-2 border-slate-200 hover:border-emerald-400 transition-all cursor-pointer group">
            <Link to={createPageUrl('Projects')}>
              <CardHeader className="pb-4">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-emerald-100 rounded-lg group-hover:bg-emerald-200 transition-colors">
                    <TrendingUp className="w-6 h-6 text-emerald-600" />
                  </div>
                  <CardTitle className="text-xl">My Projects</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-slate-600">{projects.length} active projects</p>
              </CardContent>
            </Link>
          </Card>

          <Card className="border-2 border-slate-200 hover:border-amber-400 transition-all cursor-pointer group">
            <Link to={createPageUrl('SourcesDatabase')}>
              <CardHeader className="pb-4">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-amber-100 rounded-lg group-hover:bg-amber-200 transition-colors">
                    <FileText className="w-6 h-6 text-amber-600" />
                  </div>
                  <CardTitle className="text-xl">Source Library</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-slate-600">Manage your central database of market data</p>
              </CardContent>
            </Link>
          </Card>

          <Card className="border-2 border-slate-200 hover:border-purple-400 transition-all cursor-pointer group">
            <Link to={createPageUrl('ReportsLibrary')}>
              <CardHeader className="pb-4">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-purple-100 rounded-lg group-hover:bg-purple-200 transition-colors">
                    <Database className="w-6 h-6 text-purple-600" />
                  </div>
                  <CardTitle className="text-xl">Reports Library</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-slate-600">{reports.length} published reports</p>
              </CardContent>
            </Link>
          </Card>
        </div>

        {/* Dashboard Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Active Projects */}
          <Card>
            <CardHeader className="border-b">
              <CardTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5" />
                Active Projects
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
              {projectsLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="h-20 bg-slate-100 rounded-lg animate-pulse" />
                  ))}
                </div>
              ) : draftProjects.length === 0 ? (
               <div className="text-center py-8">
                 <div className="text-4xl mb-4">📋</div>
                 <p className="text-slate-900 font-medium mb-2">No active projects</p>
                 <p className="text-slate-600 text-sm mb-4">Start by creating a new trend report project</p>
                 <Link to={createPageUrl('NewProject')}>
                   <Button className="bg-blue-600 hover:bg-blue-700">
                     <Plus className="w-4 h-4 mr-2" />
                     Create Your First Project
                   </Button>
                 </Link>
               </div>
              ) : (
                <div className="space-y-3">
                  {draftProjects.slice(0, 5).map(project => (
                    <Link key={project.id} to={createPageUrl(`ProjectDetail?id=${project.id}`)}>
                      <Card className="hover:bg-slate-50 transition-colors cursor-pointer">
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between">
                            <div>
                              <h3 className="font-semibold text-slate-900">{project.name}</h3>
                              <p className="text-sm text-slate-600 mt-1">
                                {project.category} • {project.region}
                              </p>
                            </div>
                            <span className={`text-xs px-2 py-1 rounded-full ${
                              project.state === 'draft' ? 'bg-slate-200 text-slate-700' :
                              project.state === 'evidence_sufficient' ? 'bg-blue-100 text-blue-700' :
                              'bg-emerald-100 text-emerald-700'
                            }`}>
                              {project.state.replace('_', ' ')}
                            </span>
                          </div>
                        </CardContent>
                      </Card>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Recent Reports */}
          <Card>
            <CardHeader className="border-b">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Database className="w-5 h-5" />
                  Recent Reports
                </CardTitle>
                <Link to={createPageUrl('ReportsLibrary')}>
                  <Button variant="ghost" size="sm">View All</Button>
                </Link>
              </div>
              <div className="mt-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input
                    placeholder="Search reports..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-6">
              {reportsLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="h-20 bg-slate-100 rounded-lg animate-pulse" />
                  ))}
                </div>
              ) : filteredReports.length === 0 ? (
               <div className="text-center py-8">
                 <div className="text-4xl mb-4">📚</div>
                 <p className="text-slate-900 font-medium mb-2">No published reports</p>
                 <p className="text-slate-600 text-sm">Create projects and generate reports to see them here</p>
               </div>
              ) : (
                <div className="space-y-3">
                  {filteredReports.slice(0, 5).map(report => (
                    <Link key={report.id} to={createPageUrl(`ReportView?id=${report.id}`)}>
                      <Card className="hover:bg-slate-50 transition-colors cursor-pointer">
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <h3 className="font-semibold text-slate-900">{report.title}</h3>
                              <p className="text-sm text-slate-600 mt-1">
                                {report.category} • {report.region}
                              </p>
                              {report.selected_trends && (
                                <div className="flex flex-wrap gap-1 mt-2">
                                  {report.selected_trends.slice(0, 3).map((trend, idx) => (
                                    <span key={idx} className="text-xs px-2 py-0.5 bg-slate-100 rounded-full text-slate-700">
                                      {trend}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                            <div className="text-right ml-4">
                              <span className={`inline-block w-2 h-2 rounded-full ${
                                report.freshness === 'fresh' ? 'bg-green-500' :
                                report.freshness === 'use_with_caution' ? 'bg-yellow-500' :
                                'bg-red-500'
                              }`} />
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}