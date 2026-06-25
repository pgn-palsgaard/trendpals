import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar, Target, Users, Flag, Upload, TrendingUp, CheckCircle, Pencil } from 'lucide-react';
import EditProjectModal from './EditProjectModal';

export default function ProjectOverview({ project, sources, trendCandidates }) {
  const [editOpen, setEditOpen] = useState(false);
  return (
    <div className="space-y-6">
      {/* Project Context */}
      <Card className="border-slate-200/60 shadow-sm hover:shadow-md transition-shadow">
        <CardHeader className="border-b border-slate-100 bg-gradient-to-r from-slate-50 to-transparent flex flex-row items-center justify-between">
          <CardTitle className="text-lg font-semibold text-slate-900">Project Context</CardTitle>
          <Button variant="ghost" size="sm" onClick={() => setEditOpen(true)}>
            <Pencil className="w-4 h-4 mr-1" /> Edit
          </Button>
        </CardHeader>
        <CardContent className="space-y-4 pt-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm text-slate-600">
                <Calendar className="w-4 h-4" />
                <span className="font-medium">Time Windows</span>
              </div>
              <div className="pl-6 space-y-1 text-sm">
                <p><span className="font-medium">Trends:</span> {project.trend_time_window}</p>
                <p><span className="font-medium">Launches:</span> {project.launch_time_window}</p>
              </div>
            </div>
            
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm text-slate-600">
                <Users className="w-4 h-4" />
                <span className="font-medium">Audience</span>
              </div>
              <p className="pl-6 text-sm">{project.audience}</p>
            </div>
          </div>

          {project.objective && (
            <div className="space-y-2 pt-2 border-t">
              <div className="flex items-center gap-2 text-sm text-slate-600">
                <Target className="w-4 h-4" />
                <span className="font-medium">Objective</span>
              </div>
              <p className="pl-6 text-sm text-slate-700">{project.objective}</p>
            </div>
          )}

          {project.customer_priorities && project.customer_priorities.length > 0 && (
            <div className="space-y-2 pt-2 border-t">
              <div className="flex items-center gap-2 text-sm text-slate-600">
                <Flag className="w-4 h-4" />
                <span className="font-medium">Customer Priorities</span>
              </div>
              <div className="pl-6 flex flex-wrap gap-2">
                {project.customer_priorities.map((priority, idx) => (
                  <Badge key={idx} variant="secondary">{priority}</Badge>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Progress Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="border-slate-200/60 shadow-sm hover:shadow-md transition-all hover:-translate-y-1 duration-200 bg-gradient-to-br from-white to-blue-50/30">
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="w-14 h-14 rounded-full bg-[#1D428A] flex items-center justify-center mx-auto mb-3 shadow-lg">
                <Upload className="w-7 h-7 text-white" />
              </div>
              <div className="text-4xl font-bold text-slate-900 mb-1">{sources.length}</div>
              <p className="text-sm font-medium text-slate-600">Sources Uploaded</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200/60 shadow-sm hover:shadow-md transition-all hover:-translate-y-1 duration-200 bg-gradient-to-br from-white to-purple-50/30">
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="w-14 h-14 rounded-full bg-[#6F8263] flex items-center justify-center mx-auto mb-3 shadow-lg">
                <TrendingUp className="w-7 h-7 text-white" />
              </div>
              <div className="text-4xl font-bold text-slate-900 mb-1">{trendCandidates.length}</div>
              <p className="text-sm font-medium text-slate-600">Trend Candidates</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200/60 shadow-sm hover:shadow-md transition-all hover:-translate-y-1 duration-200 bg-gradient-to-br from-white to-emerald-50/30">
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="w-14 h-14 rounded-full bg-[#62837F] flex items-center justify-center mx-auto mb-3 shadow-lg">
                <CheckCircle className="w-7 h-7 text-white" />
              </div>
              <div className="text-4xl font-bold text-slate-900 mb-1">
                {trendCandidates.filter(t => t.is_selected).length}
              </div>
              <p className="text-sm font-medium text-slate-600">Selected Trends</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <EditProjectModal project={project} open={editOpen} onClose={() => setEditOpen(false)} />

      {/* Warnings */}
      {project.warnings && project.warnings.length > 0 && (
        <Card className="border-orange-200 bg-orange-50">
          <CardHeader>
            <CardTitle className="text-orange-900">⚠️ Warnings</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {project.warnings.map((warning, idx) => (
                <li key={idx} className="text-sm text-orange-800">{warning.message}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}