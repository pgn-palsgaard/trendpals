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

export default function ProjectDetail() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const urlParams = new URLSearchParams(window.location.search);
  const projectId = urlParams.get('id');
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
    queryFn: () => base44.entities.Source.filter({ project_id: projectId }),
    enabled: !!projectId
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
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 py-8">
      <div className="max-w-7xl mx-auto px-4">
        {/* Header */}
        <div className="mb-6">
          <Link to={createPageUrl('Projects')}>
            <Button variant="ghost" className="mb-4">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Projects
            </Button>
          </Link>
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-3xl font-bold text-slate-900 mb-2">{project.name}</h1>
              <p className="text-slate-600">
                {project.category} • {project.region}
              </p>
            </div>
            <span className={`text-sm px-3 py-1.5 rounded-full ${stateColors[project.state]}`}>
              {project.state.replace('_', ' ').toUpperCase()}
            </span>
          </div>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-6">
            <TabsTrigger value="overview" className="flex items-center gap-2">
              <FileText className="w-4 h-4" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="sources" className="flex items-center gap-2">
              <Upload className="w-4 h-4" />
              Sources ({sources.length})
            </TabsTrigger>
            <TabsTrigger value="trends" className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4" />
              Trends ({trendCandidates.length})
            </TabsTrigger>
            <TabsTrigger value="report" className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4" />
              Report
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            <ProjectOverview project={project} sources={sources} trendCandidates={trendCandidates} />
          </TabsContent>

          <TabsContent value="sources">
            <ProjectSources project={project} sources={sources} />
          </TabsContent>

          <TabsContent value="trends">
            <ProjectTrends project={project} trendCandidates={trendCandidates} sources={sources} />
          </TabsContent>

          <TabsContent value="report">
            <ProjectReport project={project} reports={reports} trendCandidates={trendCandidates} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}