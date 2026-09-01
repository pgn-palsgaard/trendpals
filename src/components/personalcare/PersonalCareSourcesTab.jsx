import React from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, FileText } from 'lucide-react';
import { format } from 'date-fns';
import PersonalCareIntakeCard from './PersonalCareIntakeCard';

const STAGE_CLASS = {
  extracted: 'badge-approved',
  metadata_extracted: 'badge-approved',
  gnpd_ready: 'badge-approved',
  failed: 'badge-rejected',
  uploaded: 'badge-pending',
  needs_classification: 'badge-pending',
  extracting: 'badge-pending',
};

export default function PersonalCareSourcesTab() {
  const queryClient = useQueryClient();
  const queryKey = ['bsaSources'];

  const { data: sources = [], isLoading } = useQuery({
    queryKey,
    // main_group is the wall: only BSA records are ever read here.
    queryFn: () => base44.entities.Source.filter({ main_group: 'BSA' }, '-created_date', 200),
  });

  const nonGnpd = sources.filter(s => s.source_type !== 'gnpd');

  return (
    <div className="space-y-4">
      <PersonalCareIntakeCard onDone={() => queryClient.invalidateQueries({ queryKey })} />

      <div className="pal-card overflow-hidden">
        {isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : nonGnpd.length === 0 ? (
          <p className="p-10 text-center text-sm text-muted-foreground">
            No Personal Care sources yet. Upload a file or paste a link above.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/60 border-b border-border">
                {['Title', 'Type', 'Added', 'Stage'].map(h => (
                  <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold text-foreground">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {nonGnpd.map(s => (
                <tr key={s.id} className="table-row-airy">
                  <td className="px-4 py-2.5">
                    <div className="flex items-start gap-2">
                      <FileText className="w-4 h-4 mt-0.5 shrink-0 text-muted-foreground" />
                      <span className="font-medium text-foreground">{s.title || 'Untitled'}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">{s.source_type}</td>
                  <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap">
                    {s.created_date ? format(new Date(s.created_date), 'MMM d, yyyy') : '—'}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={STAGE_CLASS[s.pipeline_stage] || 'badge-draft'}>
                      {s.pipeline_stage || 'uploaded'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}