import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Search, FileText, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { toast } from 'sonner';

import { CATEGORY_LABELS } from '@/lib/palsgaardCategoryMapping';
import KAMBadge from '@/components/KAMBadge';

const STATE_STYLE = {
  draft:              { label: 'Draft',              bg: '#F3F4F6', color: '#6B7280' },
  evidence_sufficient:{ label: 'Active',             bg: '#EBF0F8', color: '#1D428A' },
  publishable:        { label: 'Ready to publish',   bg: '#EEF1EC', color: '#4A6040' },
  published:          { label: 'Published',          bg: '#EEF1EC', color: '#4A6040' },
  aged:               { label: 'Aged',               bg: '#FAE9E5', color: '#A33B24' },
};

const FILTER_TABS = [
  { key: 'all', label: 'All' },
  { key: 'draft', label: 'Draft' },
  { key: 'evidence_sufficient', label: 'Active' },
  { key: 'publishable', label: 'Ready' },
  { key: 'published', label: 'Published' },
];

export default function Projects() {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterState, setFilterState] = useState('all');
  const queryClient = useQueryClient();

  const { data: projects = [], isLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: () => base44.entities.Project.list('-updated_date', 100),
  });

  // Projects with at least one product-first (KAM) report get a visual cue
  const { data: kamReports = [] } = useQuery({
    queryKey: ['kamReports'],
    queryFn: () => base44.entities.Report.filter({ analysis_mode: 'product_first' }, '-created_date', 100),
  });
  const kamProjectIds = new Set(kamReports.map(r => r.project_id));

  const deleteProjectMutation = useMutation({
    mutationFn: (projectId) => base44.entities.Project.delete(projectId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      toast.success('Project deleted');
    },
  });

  const filteredProjects = projects.filter(project => {
    const matchesSearch =
      project.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      project.category?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      project.region_code?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFilter = filterState === 'all' || project.state === filterState;
    return matchesSearch && matchesFilter;
  });

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-6 py-10">

        {/* Header */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="font-heading text-3xl font-semibold text-foreground mb-1">Projects</h1>
            <p className="text-sm text-muted-foreground">{projects.length} total projects</p>
          </div>
          <Link to={createPageUrl('NewProject')}>
            <Button><Plus className="w-4 h-4" />New project</Button>
          </Link>
        </div>

        {/* Filters row */}
        <div className="flex flex-col md:flex-row gap-3 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              placeholder="Search by name, category or region…"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex items-center bg-card border border-border rounded-[8px] p-1 gap-0.5">
            {FILTER_TABS.map(tab => (
              <button
                key={tab.key}
                onClick={() => setFilterState(tab.key)}
                className="px-3 py-1.5 rounded-[6px] text-xs font-medium transition-colors duration-150 cursor-pointer"
                style={{
                  background: filterState === tab.key ? '#1D428A' : 'transparent',
                  color: filterState === tab.key ? '#fff' : 'hsl(var(--muted-foreground))',
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1,2,3,4,5,6].map(i => (
              <div key={i} className="h-44 bg-card rounded-[10px] border border-border animate-pulse" />
            ))}
          </div>
        ) : filteredProjects.length === 0 ? (
          <div className="bg-card rounded-[10px] border border-border py-16 text-center" style={{ boxShadow: '0 1px 4px 0 rgba(29,43,71,0.06)' }}>
            <FileText className="w-10 h-10 mx-auto mb-3" style={{ color: '#AB9D80' }} />
            <p className="text-sm font-medium text-foreground mb-1">No projects found</p>
            <p className="text-xs text-muted-foreground mb-5">
              {searchQuery || filterState !== 'all' ? 'Try adjusting your filters' : 'Get started by creating your first project'}
            </p>
            {!searchQuery && filterState === 'all' && (
              <Link to={createPageUrl('NewProject')}>
                <Button size="sm"><Plus className="w-3.5 h-3.5" />Create project</Button>
              </Link>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredProjects.map(project => {
              const s = STATE_STYLE[project.state] || STATE_STYLE.draft;
              return (
                <div key={project.id} className="relative group bg-card rounded-[10px] border border-border overflow-hidden transition-all duration-150"
                  style={{ boxShadow: '0 1px 4px 0 rgba(29,43,71,0.06)' }}
                  onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 4px 16px 0 rgba(29,43,71,0.10)'; }}
                  onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 1px 4px 0 rgba(29,43,71,0.06)'; }}
                >
                  <Link to={createPageUrl(`ProjectDetail?id=${project.id}`)} className="block p-5">
                    <div className="flex items-start justify-between mb-3">
                      <h3 className="text-sm font-semibold text-foreground line-clamp-2 pr-6 group-hover:text-[#1D428A] transition-colors">
                        {project.name}
                      </h3>
                      <span className="shrink-0 ml-2 text-xs px-2 py-0.5 rounded-[5px] font-medium"
                        style={{ background: s.bg, color: s.color }}>
                        {s.label}
                      </span>
                    </div>

                    {kamProjectIds.has(project.id) && (
                      <div className="mb-2"><KAMBadge /></div>
                    )}

                    <div className="space-y-1.5 text-xs text-muted-foreground">
                      <div className="flex gap-1.5">
                        <span className="font-medium text-foreground/70">Category</span>
                        <span>{CATEGORY_LABELS[project.category] || project.category}</span>
                      </div>
                      <div className="flex gap-1.5">
                        <span className="font-medium text-foreground/70">Region</span>
                        <span>{project.region_code}</span>
                      </div>
                      {project.trend_time_window && (
                        <div className="flex gap-1.5">
                          <span className="font-medium text-foreground/70">Window</span>
                          <span>{project.trend_time_window}</span>
                        </div>
                      )}
                    </div>

                    {project.customer_priorities?.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-1">
                        {project.customer_priorities.slice(0, 3).map((priority, idx) => (
                          <span key={idx} className="text-xs px-2 py-0.5 bg-muted rounded-[5px] text-muted-foreground">
                            {priority}
                          </span>
                        ))}
                        {project.customer_priorities.length > 3 && (
                          <span className="text-xs px-2 py-0.5 bg-muted rounded-[5px] text-muted-foreground">
                            +{project.customer_priorities.length - 3}
                          </span>
                        )}
                      </div>
                    )}

                    <div className="mt-4 pt-3 border-t border-border text-xs text-muted-foreground">
                      Updated {new Date(project.updated_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </div>
                  </Link>

                  <button
                    className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity duration-150 p-1.5 rounded-lg hover:bg-[#FAE9E5] cursor-pointer"
                    style={{ color: '#A33B24' }}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (confirm(`Delete project "${project.name}"? This cannot be undone.`)) {
                        deleteProjectMutation.mutate(project.id);
                      }
                    }}
                    aria-label="Delete project"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}