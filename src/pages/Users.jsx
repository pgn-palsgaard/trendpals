import React, { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Search, Users as UsersIcon } from 'lucide-react';
import { ROLES, roleLabel } from '@/lib/accessMap';
import { getRegionLabel } from '@/lib/regions';
import UserTable from '@/components/users/UserTable';
import UserDetailDrawer from '@/components/users/UserDetailDrawer';
import AssignChallengesPanel from '@/components/users/AssignChallengesPanel';
import AccessMapSection from '@/components/users/AccessMapSection';

const ROLE_ORDER = { admin: 0, reviewer: 1, submitter: 2, user: 3 };

export default function Users() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [sortKey, setSortKey] = useState('role');
  const [selected, setSelected] = useState(null);
  const [assignTo, setAssignTo] = useState(null);

  const { data: users = [], isLoading: loadingUsers } = useQuery({
    queryKey: ['allAppUsers'],
    queryFn: () => base44.entities.User.list('full_name', 500),
  });

  const { data: assignments = [] } = useQuery({
    queryKey: ['usersReviewAssignments'],
    queryFn: () => base44.entities.ReviewAssignment.list(),
  });

  const rows = useMemo(() => {
    const byEmail = {};
    assignments.forEach(a => {
      const k = (a.reviewer_email || '').toLowerCase();
      if (!byEmail[k]) byEmail[k] = [];
      byEmail[k].push(a);
    });

    let list = users.map(u => {
      const mine = byEmail[(u.email || '').toLowerCase()] || [];
      const responded = mine.filter(a => a.status === 'responded');
      const lastResponded = responded
        .map(a => a.responded_at)
        .filter(Boolean)
        .sort()
        .pop() || null;
      return {
        user: u,
        assignments: mine,
        total: mine.length,
        responded: responded.length,
        awaiting: mine.length - responded.length,
        confirmed: responded.filter(a => a.verdict === 'confirmed').length,
        lastResponded,
        regions: [...new Set(mine.map(a => a.reviewer_region).filter(Boolean))].map(getRegionLabel),
      };
    });

    if (roleFilter !== 'all') list = list.filter(r => (r.user.role || 'user') === roleFilter);

    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(r =>
        (r.user.full_name || '').toLowerCase().includes(q) ||
        (r.user.email || '').toLowerCase().includes(q)
      );
    }

    list.sort((a, b) => {
      if (sortKey === 'role') {
        const d = (ROLE_ORDER[a.user.role] ?? 9) - (ROLE_ORDER[b.user.role] ?? 9);
        if (d !== 0) return d;
        return (a.user.full_name || a.user.email || '').localeCompare(b.user.full_name || b.user.email || '');
      }
      if (sortKey === 'last') {
        return (b.lastResponded || '').localeCompare(a.lastResponded || '');
      }
      return (a.user.full_name || a.user.email || '').localeCompare(b.user.full_name || b.user.email || '');
    });

    return list;
  }, [users, assignments, roleFilter, search, sortKey]);

  const counts = useMemo(() => {
    const c = { all: users.length };
    ROLES.forEach(r => { c[r] = users.filter(u => (u.role || 'user') === r).length; });
    return c;
  }, [users]);

  return (
    <div className="page-shell">
      <div className="page-inner">
        <div className="page-header">
          <p className="section-label mb-1.5">System</p>
          <h1 className="page-title">Users & access</h1>
          <p className="page-subtitle">
            Every person with access to TrendPals — their role, what they can reach, and their review activity.
          </p>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by name or email…"
              className="w-full text-sm border border-border rounded-lg pl-9 pr-3 py-2 bg-card focus:outline-none"
            />
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {['all', ...ROLES].map(r => (
              <button
                key={r}
                onClick={() => setRoleFilter(r)}
                className="text-xs font-medium px-3 py-2 rounded-lg border transition-colors"
                style={roleFilter === r
                  ? { background: '#1D428A', color: '#fff', borderColor: '#1D428A' }
                  : { color: '#3A4A66', borderColor: 'hsl(var(--border))' }}
              >
                {r === 'all' ? 'All' : roleLabel(r)}
                <span className="ml-1.5 opacity-70">{counts[r] ?? 0}</span>
              </button>
            ))}
          </div>
        </div>

        {loadingUsers ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-4 border-muted border-t-[#1D428A] rounded-full animate-spin" />
          </div>
        ) : users.length === 0 ? (
          <div className="pal-card p-12 text-center">
            <UsersIcon className="w-6 h-6 mx-auto mb-2 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No users found.</p>
          </div>
        ) : (
          <UserTable
            rows={rows}
            sortKey={sortKey}
            onSort={setSortKey}
            onSelect={setSelected}
            onAssign={(row) => setAssignTo(row)}
          />
        )}

        <div className="mt-6">
          <AccessMapSection />
        </div>
      </div>

      {selected && (
        <UserDetailDrawer
          row={selected}
          onClose={() => setSelected(null)}
          onAssign={(row) => setAssignTo(row)}
          onRoleChanged={() => {
            queryClient.invalidateQueries({ queryKey: ['allAppUsers'] });
            setSelected(null);
          }}
        />
      )}

      {assignTo && (
        <AssignChallengesPanel
          user={assignTo.user}
          onClose={() => setAssignTo(null)}
        />
      )}
    </div>
  );
}