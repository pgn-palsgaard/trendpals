import React from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { ArrowLeft, ExternalLink, User as UserIcon } from 'lucide-react';
import { format } from 'date-fns';
import ContractPanel from '@/components/briefbeta/ContractPanel';
import TranscriptView from '@/components/architecthistory/TranscriptView';
import SessionSlides from '@/components/architecthistory/SessionSlides';
import ResumeSessionButton from '@/components/architecthistory/ResumeSessionButton';

export default function ArchitectSessionDetail() {
  const { sessionId } = useParams();

  const { data: session, isLoading, isError } = useQuery({
    queryKey: ['architectSession', sessionId],
    enabled: !!sessionId,
    retry: false,
    queryFn: () => base44.entities.ArchitectSession.get(sessionId),
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
          {session.status === 'converted' && session.linked_report_id && (
            <Link
              to={`/ReportView?id=${session.linked_report_id}`}
              className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white shrink-0"
              style={{ background: '#1D428A' }}
            >
              Open report <ExternalLink className="w-4 h-4" />
            </Link>
          )}
          </div>
        </div>

        <div className="flex flex-col lg:flex-row gap-5">
          <div className="lg:w-1/2">
            <p className="section-label mb-2">Transcript</p>
            <div className="pal-card p-5">
              <TranscriptView messages={session.messages} />
            </div>
          </div>

          <div className="lg:w-1/2 space-y-4">
            <div>
              <p className="section-label mb-2">Brief contract</p>
              <ContractPanel contract={session.contract || {}} trendCount={0} />
            </div>
            <div>
              <p className="section-label mb-2">Deck snapshot</p>
              <SessionSlides slides={session.slides} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}