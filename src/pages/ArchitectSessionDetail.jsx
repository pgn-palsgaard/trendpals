import React from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { ArrowLeft, User as UserIcon } from 'lucide-react';
import { format } from 'date-fns';
import ContractPanel from '@/components/briefbeta/ContractPanel';
import TranscriptView from '@/components/architecthistory/TranscriptView';
import SessionSlides from '@/components/architecthistory/SessionSlides';
import ResumeSessionButton from '@/components/architecthistory/ResumeSessionButton';
import MarkdownDownload from '@/components/briefbeta/MarkdownDownload';
import loadWorkspaceReport from '@/components/briefbeta/loadWorkspaceReport';
import ImagePackDownload from '@/components/briefbeta/ImagePackDownload';

export default function ArchitectSessionDetail() {
  const { sessionId } = useParams();

  const { data: session, isLoading, isError } = useQuery({
    queryKey: ['architectSession', sessionId],
    enabled: !!sessionId,
    retry: false,
    queryFn: () => base44.entities.ArchitectSession.get(sessionId),
  });

  const { data: report, isLoading: reportLoading, isError: reportError } = useQuery({
    queryKey: ['report', session?.linked_report_id],
    enabled: !!session?.linked_report_id,
    queryFn: () => loadWorkspaceReport(session),
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="page-shell"><div className="page-inner">
        <p className="text-sm text-muted-foreground">Loading session…</p>
      </div></div>
    );
  }

  if (isError || !session) {
    return (
      <div className="page-shell"><div className="page-inner">
        <Link to="/ArchitectHistory" className="text-sm text-pal-blue inline-flex items-center gap-1 mb-4">
          <ArrowLeft className="w-4 h-4" />Back to history
        </Link>
        <div className="pal-card p-10 text-center">
          <p className="font-semibold text-foreground">Session not found</p>
          <p className="text-sm text-muted-foreground mt-1">
            It may have been deleted, or you may not have access to it.
          </p>
        </div>
      </div></div>
    );
  }

  return (
    <div className="page-shell">
      <div className="page-inner">
        <Link to="/ArchitectHistory" className="text-sm text-pal-blue inline-flex items-center gap-1 mb-4">
          <ArrowLeft className="w-4 h-4" />Back to history
        </Link>

        <div className="page-header flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="page-title">{session.title || 'Untitled architect session'}</h1>
            <p className="page-subtitle flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="inline-flex items-center gap-1">
                <UserIcon className="w-3.5 h-3.5" />{session.owner_name || session.owner_email}
              </span>
              {session.category && <span>{session.category.replace(/_/g, ' ')}</span>}
              {session.region && <span>{session.region}</span>}
              <span>{session.message_count || 0} messages</span>
              {session.last_message_at && (
                <span>Last activity {format(new Date(session.last_message_at), 'd MMM yyyy HH:mm')}</span>
              )}
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
          <ResumeSessionButton sessionId={session.id} />
          {report && <><MarkdownDownload report={report} /><ImagePackDownload report={report} /></>}
          </div>
        </div>

        <div className="space-y-6">
          <section className="min-w-0">
            <p className="section-label mb-3">{report ? 'Saved report' : 'Working draft'}</p>
            {reportLoading ? <p role="status" className="text-sm text-muted-foreground">Loading saved report…</p> : <>
              {reportError && <p role="alert" className="text-sm text-destructive mb-3">The linked report could not be loaded. The session snapshot is shown below.</p>}
              <SessionSlides slides={session.slides} report={report} />
            </>}
          </section>
          <details className="pal-card p-5"><summary className="cursor-pointer font-semibold text-sm text-primary">Chat transcript · {session.message_count || 0} messages</summary><div className="mt-4"><TranscriptView messages={session.messages} /></div></details>
          <details className="pal-card p-5"><summary className="cursor-pointer font-semibold text-sm text-primary">Brief & scope</summary><div className="mt-4"><ContractPanel contract={session.contract || {}} trendCount={0} /></div></details>
        </div>
      </div>
    </div>
  );
}