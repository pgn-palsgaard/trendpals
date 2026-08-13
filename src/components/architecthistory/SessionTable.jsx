import React from 'react';
import { useNavigate } from 'react-router-dom';
import { MessageSquare, FileCheck2 } from 'lucide-react';
import { format } from 'date-fns';

function StatusBadge({ status }) {
  if (status === 'converted') {
    return <span className="badge-approved"><FileCheck2 className="w-3 h-3 mr-1" />Converted</span>;
  }
  return <span className="badge-draft">Active</span>;
}

export default function SessionTable({ sessions, showOwner }) {
  const navigate = useNavigate();

  return (
    <div className="pal-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left px-4 py-3 section-label">Session</th>
              {showOwner && <th className="text-left px-4 py-3 section-label">Owner</th>}
              <th className="text-left px-4 py-3 section-label">Category</th>
              <th className="text-left px-4 py-3 section-label">Region</th>
              <th className="text-left px-4 py-3 section-label">Messages</th>
              <th className="text-left px-4 py-3 section-label">Status</th>
              <th className="text-left px-4 py-3 section-label">Last activity</th>
            </tr>
          </thead>
          <tbody>
            {sessions.map(s => (
              <tr
                key={s.id}
                onClick={() => navigate(`/ArchitectHistory/${s.id}`)}
                className="table-row-airy cursor-pointer"
              >
                <td className="px-4 py-3 max-w-[340px]">
                  <p className="font-medium text-foreground truncate">{s.title || 'Untitled session'}</p>
                </td>
                {showOwner && (
                  <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                    {s.owner_name || s.owner_email}
                  </td>
                )}
                <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                  {s.category ? s.category.replace(/_/g, ' ') : '—'}
                </td>
                <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{s.region || '—'}</td>
                <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                  <span className="inline-flex items-center gap-1">
                    <MessageSquare className="w-3.5 h-3.5" />{s.message_count || 0}
                  </span>
                </td>
                <td className="px-4 py-3"><StatusBadge status={s.status} /></td>
                <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                  {s.last_message_at ? format(new Date(s.last_message_at), 'd MMM yyyy HH:mm') : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}