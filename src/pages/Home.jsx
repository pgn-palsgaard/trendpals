import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, TrendingUp, FileText, Database, Search, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';

const CATEGORY_LABELS = {
  bakery: 'Bakery', condiments: 'Condiments', chocolate_confectionery: 'Choc & Confectionery',
  dairy: 'Dairy', ice_cream: 'Ice cream', meat: 'Processed meat',
  oils_fats: 'Oils & fats', plant_based: 'Plant-based', rutf_rusf: 'RUTF/RUSF',
};

const STATE_STYLE = {
  draft: { label: 'Draft', bg: '#F3F4F6', color: '#6B7280' },
  evidence_sufficient: { label: 'Active', bg: '#EBF0F8', color: '#1D428A' },
  publishable: { label: 'Ready to publish', bg: '#EEF1EC', color: '#4A6040' },
  published: { label: 'Published', bg: '#EEF1EC', color: '#4A6040' },
  aged: { label: 'Aged', bg: '#FAE9E5', color: '#A33B24' },
};

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

  const filteredReports = reports.filter(r =>
    r.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    r.category?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    r.region?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-6 py-10">

        {/* Page header */}
        <div className="mb-10">
          <h1 className="font-heading text-3xl font-semibold text-foreground mb-1">Trend intelligence</h1>
          <p className="text-sm text-muted-foreground">Transform market data into evidence-backed regional trend reports.</p>
        </div>

        {/* Quick-action cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
          {[
            { to: createPageUrl('NewProject'), icon: Plus, iconBg: '#EBF0F8', iconColor: '#1D428A', label: 'New project', sub: 'Start a trend brief' },
            { to: createPageUrl('Projects'), icon: TrendingUp, iconBg: '#EEF1EC', iconColor: '#4A6040', label: 'Projects', sub: `${projects.length} total` },
            { to: createPageUrl('SourcesDatabase'), icon: FileText, iconBg: '#F5EFE6', iconColor: '#AB9D80', label: 'Market intelligence', sub: 'Source library' },
            { to: createPageUrl('ReportsLibrary'), icon: Database, iconBg: '#EBF0F8', iconColor: '#1D2B47', label: 'Reports', sub: `${reports.length} published` },
          ].map(({ to, icon: Icon, iconBg, iconColor, label, sub }) => (
            <Link key={to} to={to}
              className="group bg-card rounded-[10px] border border-border p-5 flex flex-col gap-3 transition-all duration-150 hover:-translate-y-0.5"
              style={{ boxShadow: '0 1px 4px 0 rgba(29,43,71,0.06)' }}
              onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 4px 16px 0 rgba(29,43,71,0.10)'; }}
              onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 1px 4px 0 rgba(29,43,71,0.06)'; }}
            >
              <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: iconBg }}>
                <Icon className="w-4 h-4" style={{ color: iconColor }} />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">{label}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>
              </div>
            </Link>
          ))}
        </div>

        {/* Two-column dashboard */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* Active projects */}
          <div className="bg-card rounded-[10px] border border-border overflow-hidden" style={{ boxShadow: '0 1px 4px 0 rgba(29,43,71,0.06)' }}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h2 className="font-heading text-base font-semibold text-foreground">Active projects</h2>
              <Link to={createPageUrl('Projects')} className="text-xs font-medium flex items-center gap-1 transition-colors" style={{ color: '#1D428A' }}
                onMouseEnter={e => e.currentTarget.style.opacity = '0.7'}
                onMouseLeave={e => e.currentTarget.style.opacity = '1'}
              >
                View all <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
            <div className="divide-y divide-border">
              {projectsLoading ? (
                <div className="p-5 space-y-3">
                  {[1,2,3].map(i => <div key={i} className="h-12 bg-muted rounded-lg animate-pulse" />)}
                </div>
              ) : draftProjects.length === 0 ? (
                <div className="py-12 px-5 text-center">
                  <p className="text-sm font-medium text-foreground mb-1">No active projects</p>
                  <p className="text-xs text-muted-foreground mb-4">Start by creating a new trend report project</p>
                  <Link to={createPageUrl('NewProject')}>
                    <Button size="sm"><Plus className="w-3.5 h-3.5" />New project</Button>
                  </Link>
                </div>
              ) : (
                draftProjects.slice(0, 6).map(project => {
                  const s = STATE_STYLE[project.state] || STATE_STYLE.draft;
                  return (
                    <Link key={project.id} to={createPageUrl(`ProjectDetail?id=${project.id}`)}
                      className="flex items-center justify-between px-5 py-3.5 transition-colors duration-150 hover:bg-muted/50 group"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground truncate group-hover:text-[#1D428A] transition-colors">{project.name}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {CATEGORY_LABELS[project.category] || project.category} · {project.region_code}
                        </p>
                      </div>
                      <span className="ml-3 shrink-0 text-xs px-2 py-0.5 rounded-[5px] font-medium"
                        style={{ background: s.bg, color: s.color }}>
                        {s.label}
                      </span>
                    </Link>
                  );
                })
              )}
            </div>
          </div>

          {/* Recent reports */}
          <div className="bg-card rounded-[10px] border border-border overflow-hidden" style={{ boxShadow: '0 1px 4px 0 rgba(29,43,71,0.06)' }}>
            <div className="px-5 py-4 border-b border-border">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-heading text-base font-semibold text-foreground">Recent reports</h2>
                <Link to={createPageUrl('ReportsLibrary')} className="text-xs font-medium flex items-center gap-1 transition-colors" style={{ color: '#1D428A' }}
                  onMouseEnter={e => e.currentTarget.style.opacity = '0.7'}
                  onMouseLeave={e => e.currentTarget.style.opacity = '1'}
                >
                  View all <ArrowRight className="w-3 h-3" />
                </Link>
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input
                  placeholder="Search reports…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 h-8 text-xs"
                />
              </div>
            </div>
            <div className="divide-y divide-border">
              {reportsLoading ? (
                <div className="p-5 space-y-3">
                  {[1,2,3].map(i => <div key={i} className="h-12 bg-muted rounded-lg animate-pulse" />)}
                </div>
              ) : filteredReports.length === 0 ? (
                <div className="py-12 px-5 text-center">
                  <p className="text-sm font-medium text-foreground mb-1">No published reports</p>
                  <p className="text-xs text-muted-foreground">Create projects and generate reports to see them here</p>
                </div>
              ) : (
                filteredReports.slice(0, 6).map(report => {
                  const freshColor = report.freshness === 'fresh' ? '#4A6040' : report.freshness === 'use_with_caution' ? '#92600A' : '#A33B24';
                  const freshBg = report.freshness === 'fresh' ? '#EEF1EC' : report.freshness === 'use_with_caution' ? 'rgba(254,243,199,0.8)' : '#FAE9E5';
                  return (
                    <Link key={report.id} to={createPageUrl(`ReportView?id=${report.id}`)}
                      className="flex items-center justify-between px-5 py-3.5 transition-colors duration-150 hover:bg-muted/50 group"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground truncate group-hover:text-[#1D428A] transition-colors">{report.title}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {CATEGORY_LABELS[report.category] || report.category} · {report.region}
                        </p>
                      </div>
                      {report.freshness && (
                        <span className="ml-3 shrink-0 text-xs px-2 py-0.5 rounded-[5px] font-medium capitalize"
                          style={{ background: freshBg, color: freshColor }}>
                          {report.freshness === 'use_with_caution' ? 'Caution' : report.freshness}
                        </span>
                      )}
                    </Link>
                  );
                })
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}