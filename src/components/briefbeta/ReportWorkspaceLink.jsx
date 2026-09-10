import React from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';

export default function ReportWorkspaceLink({ reportId }) {
  const { data: sessions = [] } = useQuery({ queryKey: ['reportWorkspace', reportId], enabled: !!reportId, queryFn: () => base44.entities.ArchitectSession.filter({ linked_report_id: reportId }, '-last_message_at', 1) });
  if (!sessions[0]) return null;
  return <Link to={`/SubmitBriefBeta?session=${sessions[0].id}`} className="inline-flex px-4 py-3 bg-primary text-primary-foreground text-sm font-semibold rounded-lg">Open chat & report</Link>;
}