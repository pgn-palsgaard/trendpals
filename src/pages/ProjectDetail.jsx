import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ArrowLeft, FileText, Upload, TrendingUp, CheckCircle } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';

import ProjectOverview from '@/components/project/ProjectOverview';
import ProjectSources from '@/components/project/ProjectSources';
import ProjectTrends from '@/components/project/ProjectTrends';
import ProjectReport from '@/components/project/ProjectReport';
import ProjectProgress from '@/components/project/ProjectProgress';
import StatusTooltip from '@/components/project/StatusTooltip';
import GNPDReadinessPanel from '@/components/project/GNPDReadinessPanel';

export default function ProjectDetail() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const urlParams = new URLSearchParams(window.location.search);
  const projectId = urlParams.get('projectId') || urlParams.get('id');
  const [activeTab, setActiveTab] = useState('overview');

  const { data: project, isLoading } = useQuery({
    queryKey: ['project', projectId],
    queryFn: async () => {
      const projects = await base44.entities.Project.filter({ id: projectId });
      return projects[0];
    },
    enabled: !!projectId
  });

  const { data: sources = [] } = useQuery({
    queryKey: ['sources', projectId],
    queryFn: async () => {
      if (!project) return [];
      
      // Get sources linked to this project
      let linkedSources = [];
      if (project.selected_source_ids && project.selected_source_ids.length > 0) {
        // Fetch sources by their IDs
        for (const sourceId of project.selected_source_ids) {
          try {
            const source = await base44.entities.Source.get(sourceId);
            if (source) linkedSources.push(source);
          } catch (e) {
            console.warn(`Source ${sourceId} not found`);
          }
        }
      } else {
        // Fallback: fetch sources directly linked to project (legacy support)
        linkedSources = await base44.entities.Source.filter({ project_id: projectId });
      }
      
      return linkedSources;
    },
    enabled: !!projectId && !!project
  });

  const { data: trendCandidates = [] } = useQuery({
    queryKey: ['trendCandidates', projectId],
    queryFn: () => base44.entities.TrendCandidate.filter({ project_id: projectId }),
    enabled: !!projectId
  });

  const { data: reports = [] } = useQuery({
    queryKey: ['reports', projectId],
    queryFn: () => base44.entities.Report.filter({ project_id: projectId }),
    enabled: !!projectId
  });

  const { data: imageExtractions = [] } = useQuery({
    queryKey: ['imageExtractions', projectId],
    queryFn: () => base44.entities.GNPDImageExtraction.filter({ project_id: projectId }),
    enabled: !!projectId
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-600">Loading project...</p>
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
        <Card className="max-w-md">
          <CardContent className="pt-6 text-center">
            <p className="text-slate-600 mb-4">Project not found</p>
            <Link to={createPageUrl('Projects')}>
              <Button>Back to Projects</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const stateColors = {
    draft: 'bg-slate-200 text-slate-700',
    evidence_sufficient: 'bg-blue-100 text-blue-700',
    publishable: 'bg-emerald-100 text-emerald-700',
    published: 'bg-purple-100 text-purple-700',
    aged: 'bg-orange-100 text-orange-700'
  };

  const tabIcons = {
    overview: FileText,
    sources: Upload,
    trends: TrendingUp,
    report: CheckCircle
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50/30">
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Modern Header */}
        <div className="mb-8">
          <Link to={createPageUrl('Projects')}>
            <Button variant="ghost" size="sm" className="mb-6 hover:bg-slate-100 -ml-2">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Projects
            </Button>
          </Link>
          
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200/60 p-8">
            <div className="flex items-start justify-between mb-6">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold text-xl shadow-lg">
                    {project.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <h1 className="text-3xl font-bold text-slate-900 tracking-tight">{project.name}</h1>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-3 text-sm">
                  <span className="inline-flex items-center px-3 py-1.5 rounded-full bg-blue-50 text-blue-700 font-medium border border-blue-200">
                    {project.category}
                  </span>
                  <span className="inline-flex items-center px-3 py-1.5 rounded-full bg-purple-50 text-purple-700 font-medium border border-purple-200">
                   {project.region_code || project.region}
                  </span>
                  {project.meeting_context && (
                    <span className="inline-flex items-center px-3 py-1.5 rounded-full bg-slate-50 text-slate-700 border border-slate-200">
                      {project.meeting_context.replace('_', ' ')}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex flex-col items-end gap-3">
                <StatusTooltip status={project.state}>
                  <span className={`text-xs font-semibold px-4 py-2 rounded-full shadow-sm ${stateColors[project.state]}`}>
                    {project.state.replace('_', ' ').toUpperCase()}
                  </span>
                </StatusTooltip>
                {project.data_sufficiency_score !== undefined && (
                  <div className="text-right">
                    <div className="text-xs text-slate-500 mb-1">Data Coverage</div>
                    <div className="flex items-center gap-2">
                      <div className="w-24 h-2 bg-slate-200 rounded-full overflow-hidden">
                        <div 
                          className={`h-full transition-all ${
                            project.data_sufficiency_score >= 80 ? 'bg-green-500' :
                            project.data_sufficiency_score >= 60 ? 'bg-blue-500' :
                            'bg-yellow-500'
                          }`}
                          style={{ width: `${project.data_sufficiency_score}%` }}
                        />
                      </div>
                      <span className="text-sm font-semibold text-slate-700">{project.data_sufficiency_score}%</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
            
            {project.objective && (
              <div className="pt-6 border-t border-slate-100">
                <p className="text-slate-600 leading-relaxed">{project.objective}</p>
              </div>
            )}
          </div>
        </div>

        {/* Data Readiness Panel */}
        <GNPDReadinessPanel 
          project={project}
          linkedSources={sources}
        />

        {/* Progress Indicator */}
        <ProjectProgress 
          project={project}
          sourcesCount={sources.length}
          selectedTrendsCount={trendCandidates.filter(t => t.is_selected).length}
          reportExists={reports.length > 0}
        />

        {/* Modern Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-8 bg-white shadow-sm border border-slate-200/60 p-1.5 rounded-xl h-auto">
            <TabsTrigger 
              value="overview" 
              className="flex items-center gap-2 px-5 py-3 rounded-lg data-[state=active]:bg-gradient-to-br data-[state=active]:from-blue-500 data-[state=active]:to-purple-600 data-[state=active]:text-white data-[state=active]:shadow-md transition-all"
            >
              <FileText className="w-4 h-4" />
              <span className="font-medium">Overview</span>
            </TabsTrigger>
            <TabsTrigger 
              value="sources" 
              className="flex items-center gap-2 px-5 py-3 rounded-lg data-[state=active]:bg-gradient-to-br data-[state=active]:from-blue-500 data-[state=active]:to-purple-600 data-[state=active]:text-white data-[state=active]:shadow-md transition-all"
            >
              <Upload className="w-4 h-4" />
              <span className="font-medium">Sources</span>
              <span className="ml-1 px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 text-xs font-semibold data-[state=active]:bg-white/20 data-[state=active]:text-white">
                {sources.length}
              </span>
            </TabsTrigger>
            <TabsTrigger 
              value="trends" 
              className="flex items-center gap-2 px-5 py-3 rounded-lg data-[state=active]:bg-gradient-to-br data-[state=active]:from-blue-500 data-[state=active]:to-purple-600 data-[state=active]:text-white data-[state=active]:shadow-md transition-all"
            >
              <TrendingUp className="w-4 h-4" />
              <span className="font-medium">Trends</span>
              <span className="ml-1 px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 text-xs font-semibold data-[state=active]:bg-white/20 data-[state=active]:text-white">
                {trendCandidates.length}
              </span>
            </TabsTrigger>
            <TabsTrigger 
              value="report" 
              className="flex items-center gap-2 px-5 py-3 rounded-lg data-[state=active]:bg-gradient-to-br data-[state=active]:from-blue-500 data-[state=active]:to-purple-600 data-[state=active]:text-white data-[state=active]:shadow-md transition-all"
            >
              <CheckCircle className="w-4 h-4" />
              <span className="font-medium">Report</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            <ProjectOverview project={project} sources={sources} trendCandidates={trendCandidates} />
          </TabsContent>

          <TabsContent value="sources">
            <ProjectSources project={project} sources={sources} imageExtractions={imageExtractions} />
          </TabsContent>

          <TabsContent value="trends">
            <ProjectTrends project={project} trendCandidates={trendCandidates} sources={sources} imageExtractions={imageExtractions} />
          </TabsContent>

          <TabsContent value="report">
            <ProjectReport project={project} reports={reports} trendCandidates={trendCandidates} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}