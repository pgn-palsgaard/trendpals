import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { format } from 'date-fns';
import { ArrowRight, X } from 'lucide-react';

const statusBadge = (status) => {
  if (status === 'new') return <Badge className="bg-green-100 text-green-700 border-green-200">New</Badge>;
  if (status === 'in_progress') return <Badge className="bg-yellow-100 text-yellow-700 border-yellow-200">In Progress</Badge>;
  return <Badge className="bg-slate-100 text-slate-500 border-slate-200">Delivered</Badge>;
};

export default function Briefs() {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState(null);

  const { data: requests = [], isLoading } = useQuery({
    queryKey: ['report-requests'],
    queryFn: () => base44.entities.ReportRequest.list('-submitted_at', 100),
  });

  const updateStatus = useMutation({
    mutationFn: ({ id, status }) => base44.entities.ReportRequest.update(id, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['report-requests'] }),
  });

  const convertToProject = useMutation({
    mutationFn: async (req) => {
      const regionMap = { ASPAC: 'ASPAC', 'ASPAC & China': 'ASPAC', EMEA: 'EMEC', EMEC: 'EMEC', Americas: 'Americas', LATAM: 'Americas', Global: 'Global', IMEA: 'IMEA' };
      const project = await base44.entities.Project.create({
        name: `${req.account} — ${req.categories || 'Report'}`,
        category: req.categories ? req.categories.split(',')[0].trim() : 'Other',
        region_code: regionMap[req.region] || 'Global',
        objective: req.purpose || '',
        customer_name: req.account,
        audience: 'Industrial manufacturers',
      });
      await base44.entities.ReportRequest.update(req.id, {
        status: 'in_progress',
        project_id: project.id,
      });
      return project;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['report-requests'] });
      setSelected(prev => prev ? { ...prev, status: 'in_progress' } : prev);
    },
  });

  if (isLoading) {
    return <div className="flex items-center justify-center h-64 text-slate-500">Loading briefs…</div>;
  }

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Report Briefs</h1>
        <p className="text-slate-500 mt-1">{requests.length} request{requests.length !== 1 ? 's' : ''}</p>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-slate-600">Requester</th>
              <th className="px-4 py-3 text-left font-medium text-slate-600">Account</th>
              <th className="px-4 py-3 text-left font-medium text-slate-600">Region</th>
              <th className="px-4 py-3 text-left font-medium text-slate-600">Categories</th>
              <th className="px-4 py-3 text-left font-medium text-slate-600">Deadline</th>
              <th className="px-4 py-3 text-left font-medium text-slate-600">Status</th>
            </tr>
          </thead>
          <tbody>
            {requests.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-slate-400">No briefs yet</td>
              </tr>
            )}
            {requests.map((req) => (
              <tr
                key={req.id}
                onClick={() => setSelected(req)}
                className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer transition-colors"
              >
                <td className="px-4 py-3 font-medium text-slate-800">{req.requester_name}</td>
                <td className="px-4 py-3 text-slate-600">{req.account}</td>
                <td className="px-4 py-3 text-slate-600">{req.region || '—'}</td>
                <td className="px-4 py-3 text-slate-600 max-w-xs truncate">{req.categories || '—'}</td>
                <td className="px-4 py-3 text-slate-600">
                  {req.deadline ? format(new Date(req.deadline), 'dd MMM yyyy') : '—'}
                </td>
                <td className="px-4 py-3">{statusBadge(req.status)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Detail panel */}
      {selected && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/30" onClick={() => setSelected(null)} />
          <div className="w-full max-w-lg bg-white shadow-2xl overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">{selected.account}</h2>
              <button onClick={() => setSelected(null)} className="text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="px-6 py-6 space-y-5">
              <Field label="Requester" value={`${selected.requester_name} (${selected.requester_email})`} />
              <Field label="Account" value={selected.account} />
              <Field label="Region" value={selected.region} />
              <Field label="Categories" value={selected.categories} />
              <Field label="Deadline" value={selected.deadline ? format(new Date(selected.deadline), 'dd MMM yyyy') : null} />
              <Field label="Purpose" value={selected.purpose} />
              <Field label="Challenges" value={selected.challenges} />
              <Field label="Notes" value={selected.notes} />
              <Field label="Submitted" value={selected.submitted_at ? format(new Date(selected.submitted_at), 'dd MMM yyyy HH:mm') : null} />
              {selected.project_id && (
                <Field label="Project ID" value={selected.project_id} />
              )}

              <div>
                <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">Status</label>
                <Select
                  value={selected.status}
                  onValueChange={(val) => {
                    updateStatus.mutate({ id: selected.id, status: val });
                    setSelected({ ...selected, status: val });
                  }}
                >
                  <SelectTrigger className="mt-1 w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="new">New</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="delivered">Delivered</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {!selected.project_id && (
                <Button
                  className="w-full mt-2"
                  onClick={() => convertToProject.mutate(selected)}
                  disabled={convertToProject.isPending}
                >
                  <ArrowRight className="w-4 h-4 mr-2" />
                  {convertToProject.isPending ? 'Converting…' : 'Convert to Project'}
                </Button>
              )}
              {selected.project_id && (
                <div className="text-sm text-green-700 bg-green-50 rounded-lg px-4 py-2">
                  ✓ Linked to project
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, value }) {
  if (!value) return null;
  return (
    <div>
      <div className="text-xs font-medium text-slate-500 uppercase tracking-wide">{label}</div>
      <div className="mt-0.5 text-sm text-slate-800 whitespace-pre-wrap">{value}</div>
    </div>
  );
}