import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { History } from 'lucide-react';
import SessionFilters from '@/components/architecthistory/SessionFilters';
import SessionTable from '@/components/architecthistory/SessionTable';

export default function ArchitectHistory() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [filters, setFilters] = useState({
    search: '', owner: 'all', category: 'all', region: 'all', status: 'all',
  });

  const { data: sessions = [], isLoading } = useQuery({
    queryKey: ['architectSessions', isAdmin ? 'all' : user?.email],
    enabled: !!user,
    retry: false,
    queryFn: () => base44.entities.ArchitectSession.list('-last_message_at', 500),
  });

  const owners = useMemo(
    () => [...new Set(sessions.map(s => s.owner_email).filter(Boolean))].sort(),
    [sessions]
  );
  const categories = useMemo(
    () => [...new Set(sessions.map(s => s.category).filter(Boolean))].sort(),
    [sessions]
  );
  const regions = useMemo(
    () => [...new Set(sessions.map(s => s.region).filter(Boolean))].sort(),
    [sessions]
  );

  const filtered = useMemo(() => {
    const q = filters.search.trim().toLowerCase();
    return sessions.filter(s => {
      if (filters.owner !== 'all' && s.owner_email !== filters.owner) return false;
      if (filters.category !== 'all' && s.category !== filters.category) return false;
      if (filters.region !== 'all' && s.region !== filters.region) return false;
      if (filters.status !== 'all' && (s.status || 'active') !== filters.status) return false;
      if (q) {
        const inTitle = (s.title || '').toLowerCase().includes(q);
        const inMessages = (s.messages || []).some(m => (m.content || '').toLowerCase().includes(q));
        if (!inTitle && !inMessages) return false;
      }
      return true;
    });
  }, [sessions, filters]);

  return (
    <div className="page-shell">
      <div className="page-inner">
        <div className="page-header">
          <div className="flex items-center gap-2">
            <History className="w-6 h-6" style={{ color: '#1D428A' }} />
            <h1 className="page-title">Architect history</h1>
          </div>
          <p className="page-subtitle">
            {isAdmin
              ? 'Every Report Architect session across the workspace — full transcript, contract, deck and linked report.'
              : 'Your Report Architect sessions — full transcript, contract, deck and linked report.'}
          </p>
        </div>

        <SessionFilters
          filters={filters}
          setFilters={setFilters}
          owners={owners}
          categories={categories}
          regions={regions}
          showOwner={isAdmin}
        />

        {isLoading ? (
          <div className="pal-card p-10 text-center text-sm text-muted-foreground">Loading sessions…</div>
        ) : filtered.length === 0 ? (
          <div className="pal-card p-10 text-center">
            <p className="font-semibold text-foreground">No sessions found</p>
            <p className="text-sm text-muted-foreground mt-1">
              {sessions.length === 0
                ? 'Architect sessions are saved automatically as soon as a conversation starts.'
                : 'No sessions match the current filters.'}
            </p>
          </div>
        ) : (
          <>
            <p className="text-xs text-muted-foreground mb-2">
              {filtered.length} of {sessions.length} sessions
            </p>
            <SessionTable sessions={filtered} showOwner={isAdmin} />
          </>
        )}
      </div>
    </div>
  );
}