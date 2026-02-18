import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, Search, FileText, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { toast } from 'sonner';

export default function Projects() {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterState, setFilterState] = useState('all');
  const queryClient = useQueryClient();

  const { data: projects = [], isLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: () => base44.entities.Project.list('-updated_date', 100),
  });

  const deleteProjectMutation = useMutation({
    mutationFn: async (projectId) => {
      await base44.entities.Project.delete(projectId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      toast.success('Project deleted');
    },
    onError: (error) => {
      toast.error('Failed to delete project');
    }
  });

  const filteredProjects = projects.filter(project => {
    const matchesSearch = 
      project.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      project.category?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      project.region?.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesFilter = filterState === 'all' || project.state === filterState;
    
    return matchesSearch && matchesFilter;
  });

  const stateLabels = {
    draft: 'Draft',
    evidence_sufficient: 'Evidence Sufficient',
    publishable: 'Ready to Publish',
    published: 'Published',
    aged: 'Aged'
  };

  const stateColors = {
    draft: 'bg-slate-200 text-slate-700',
    evidence_sufficient: 'bg-blue-100 text-blue-700',
    publishable: 'bg-emerald-100 text-emerald-700',
    published: 'bg-purple-100 text-purple-700',
    aged: 'bg-orange-100 text-orange-700'
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 py-8">
      <div className="max-w-7xl mx-auto px-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 mb-2">My Projects</h1>
            <p className="text-slate-600">{projects.length} total projects</p>
          </div>
          <Link to={createPageUrl('NewProject')}>
            <Button className="bg-blue-600 hover:bg-blue-700">
              <Plus className="w-4 h-4 mr-2" />
              New Project
            </Button>
          </Link>
        </div>

        {/* Filters */}
        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                  placeholder="Search projects by name, category, or region..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Tabs value={filterState} onValueChange={setFilterState}>
                <TabsList>
                  <TabsTrigger value="all">All</TabsTrigger>
                  <TabsTrigger value="draft">Draft</TabsTrigger>
                  <TabsTrigger value="evidence_sufficient">Active</TabsTrigger>
                  <TabsTrigger value="publishable">Ready</TabsTrigger>
                  <TabsTrigger value="published">Published</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          </CardContent>
        </Card>

        {/* Projects Grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <div key={i} className="h-48 bg-white rounded-lg shadow animate-pulse" />
            ))}
          </div>
        ) : filteredProjects.length === 0 ? (
          <Card>
            <CardContent className="py-16 text-center">
              <FileText className="w-12 h-12 text-slate-300 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-slate-900 mb-2">No projects found</h3>
              <p className="text-slate-600 mb-6">
                {searchQuery || filterState !== 'all' 
                  ? 'Try adjusting your filters'
                  : 'Get started by creating your first project'
                }
              </p>
              {!searchQuery && filterState === 'all' && (
                <Link to={createPageUrl('NewProject')}>
                  <Button className="bg-blue-600 hover:bg-blue-700">
                    <Plus className="w-4 h-4 mr-2" />
                    Create Project
                  </Button>
                </Link>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredProjects.map(project => (
              <Card key={project.id} className="h-full hover:shadow-lg transition-all border-2 border-transparent hover:border-blue-400 relative group">
                <Link to={createPageUrl(`ProjectDetail?id=${project.id}`)}>
                  <CardContent className="p-6">
                    <div className="flex items-start justify-between mb-4">
                      <h3 className="font-semibold text-lg text-slate-900 group-hover:text-blue-600 transition-colors line-clamp-2 pr-8">
                        {project.name}
                      </h3>
                      <span className={`text-xs px-2 py-1 rounded-full whitespace-nowrap ml-2 ${stateColors[project.state]}`}>
                        {stateLabels[project.state]}
                      </span>
                    </div>
                    
                    <div className="space-y-2 text-sm">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-slate-700">Category:</span>
                        <span className="text-slate-600">{project.category}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-slate-700">Region:</span>
                        <span className="text-slate-600">{project.region}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-slate-700">Trends:</span>
                        <span className="text-slate-600">{project.trend_time_window}</span>
                      </div>
                    </div>

                    {project.customer_priorities && project.customer_priorities.length > 0 && (
                      <div className="mt-4 flex flex-wrap gap-1">
                        {project.customer_priorities.slice(0, 3).map((priority, idx) => (
                          <span key={idx} className="text-xs px-2 py-0.5 bg-slate-100 rounded-full text-slate-600">
                            {priority}
                          </span>
                        ))}
                        {project.customer_priorities.length > 3 && (
                          <span className="text-xs px-2 py-0.5 bg-slate-100 rounded-full text-slate-600">
                            +{project.customer_priorities.length - 3}
                          </span>
                        )}
                      </div>
                    )}

                    <div className="mt-4 pt-4 border-t text-xs text-slate-500">
                      Updated {new Date(project.updated_date).toLocaleDateString()}
                    </div>
                  </CardContent>
                </Link>
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-50 hover:text-red-600"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (confirm(`Delete project "${project.name}"? This cannot be undone.`)) {
                      deleteProjectMutation.mutate(project.id);
                    }
                  }}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}