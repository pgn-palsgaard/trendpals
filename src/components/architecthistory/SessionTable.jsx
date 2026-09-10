import React, { useEffect, useState } from 'react';
import SessionSummaryCard from '@/components/architecthistory/SessionSummaryCard';

export default function SessionTable({ sessions, showOwner }) {
  const [page, setPage] = useState(0);
  useEffect(() => setPage(0), [sessions]);
  const pages = Math.ceil(sessions.length / 12);
  const active = Math.min(page, Math.max(0, pages - 1));
  return <div className="space-y-5">
    <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">{sessions.slice(active * 12, (active + 1) * 12).map(s => <SessionSummaryCard key={s.id} session={s} showOwner={showOwner} />)}</div>
    {pages > 1 && <nav aria-label="Workspace pages" className="flex justify-center items-center gap-4 text-sm">
      <button disabled={active === 0} onClick={() => setPage(active - 1)} className="rounded-lg border px-4 py-3 disabled:opacity-40">Previous</button><span>{active + 1} / {pages}</span><button disabled={active + 1 >= pages} onClick={() => setPage(active + 1)} className="rounded-lg border px-4 py-3 disabled:opacity-40">Next</button>
    </nav>}
  </div>;
}