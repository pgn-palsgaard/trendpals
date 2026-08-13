import React from 'react';
import { Link } from 'react-router-dom';
import { FileText, MessageSquare, LogIn } from 'lucide-react';
import useUserUsage from '@/hooks/useUserUsage';

function Tile({ icon: Icon, label, value }) {
  return (
    <div className="flex-1 rounded-[10px] border border-border p-3">
      <Icon className="w-4 h-4 mb-1.5" style={{ color: '#1D428A' }} />
      <p className="text-lg font-semibold leading-none" style={{ color: '#1D2B47' }}>{value}</p>
      <p className="text-xs text-muted-foreground mt-1">{label}</p>
    </div>
  );
}

export default function UserUsageSection({ email }) {
  const { data, isLoading } = useUserUsage(email);

  if (isLoading) {
    return (
      <div className="mt-6">
        <p className="section-label mb-2">Usage</p>
        <p className="text-xs text-muted-foreground">Loading usage…</p>
      </div>
    );
  }
  if (!data) return null;

  return (
    <div className="mt-6">
      <p className="section-label mb-2">Usage (all time)</p>

      <div className="flex gap-2">
        <Tile icon={FileText} label="Briefs submitted" value={data.briefCount} />
        <Tile icon={MessageSquare} label="Architect chats" value={data.chatCount} />
        <Tile icon={LogIn} label="Logins" value={data.loginCount} />
      </div>

      <p className="text-xs text-muted-foreground mt-2">
        Last login: {data.lastLogin ? new Date(data.lastLogin).toLocaleString() : 'never recorded'}
        {data.chatConverted > 0 && ` · ${data.chatConverted} chat${data.chatConverted === 1 ? '' : 's'} became a report`}
      </p>

      {data.recentBriefs.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-semibold mb-1" style={{ color: '#1D2B47' }}>Recent briefs</p>
          <div className="rounded-[10px] border border-border overflow-hidden">
            {data.recentBriefs.map(b => (
              <Link key={b.id} to="/Briefs" className="block px-3 py-2 table-row-airy">
                <p className="text-sm truncate" style={{ color: '#1D2B47' }}>{b.account || 'Untitled brief'}</p>
                <p className="text-xs text-muted-foreground">
                  {b.categories || '—'}
                  {b.submitted_at && ` · ${new Date(b.submitted_at).toLocaleDateString()}`}
                </p>
              </Link>
            ))}
          </div>
        </div>
      )}

      {data.recentChats.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-semibold mb-1" style={{ color: '#1D2B47' }}>Recent architect chats</p>
          <div className="rounded-[10px] border border-border overflow-hidden">
            {data.recentChats.map(s => (
              <Link key={s.id} to={`/ArchitectHistory/${s.id}`} className="block px-3 py-2 table-row-airy">
                <p className="text-sm truncate" style={{ color: '#1D2B47' }}>{s.title || 'Untitled session'}</p>
                <p className="text-xs text-muted-foreground">
                  {s.message_count || 0} messages
                  {s.last_message_at && ` · ${new Date(s.last_message_at).toLocaleDateString()}`}
                  {s.status === 'converted' && ' · became a report'}
                </p>
              </Link>
            ))}
          </div>
        </div>
      )}

      {data.briefCount === 0 && data.chatCount === 0 && (
        <p className="text-xs text-muted-foreground mt-3">No briefs or chats yet.</p>
      )}
    </div>
  );
}