import React from 'react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import SlideThumbnail from '@/components/briefbeta/SlideThumbnail';

export default function SessionSummaryCard({ session: s, showOwner }) {
  const cover = (s.slides || []).find(slide => slide.slide_name !== 'AI Disclaimer') || s.slides?.[0];
  return <article className="pal-card overflow-hidden flex flex-col">
    <Link to={`/SubmitBriefBeta?session=${s.id}`} className="block p-3 bg-secondary" aria-label={`Open ${s.title || 'workspace'}`}><SlideThumbnail slide={cover} /></Link>
    <div className="p-4 flex-1 flex flex-col gap-3">
      <div className="flex flex-wrap gap-2"><span className={s.linked_report_id ? 'badge-approved' : 'badge-draft'}>{s.linked_report_id ? 'Report saved' : 'Draft'}</span>{s.deck_state === 'draft' && s.linked_report_id && <span className="badge-pending">New draft</span>}<span className="text-xs text-muted-foreground">{s.slides?.length || 0} slides</span></div>
      <h2 className="text-lg leading-snug">{s.title || 'Untitled workspace'}</h2>
      <p className="text-xs text-muted-foreground">{[s.category?.replace(/_/g, ' '), s.region].filter(Boolean).join(' · ')}</p>
      {showOwner && <p className="text-xs text-muted-foreground truncate">{s.owner_name || s.owner_email}</p>}
      <p className="text-xs text-muted-foreground">{s.message_count || 0} messages{s.last_message_at ? ` · ${format(new Date(s.last_message_at), 'd MMM yyyy HH:mm')}` : ''}</p>
      <div className="flex items-center flex-wrap gap-3 mt-auto pt-2">
        <Link to={`/SubmitBriefBeta?session=${s.id}`} className="px-4 py-3 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90">Open workspace</Link>
        <Link to={`/ArchitectHistory/${s.id}`} className="text-xs text-primary underline py-3">Session details</Link>
      </div>
    </div>
  </article>;
}