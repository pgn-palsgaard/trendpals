import React from 'react';
import { roleLabel, ROLE_BADGE_CLASS } from '@/lib/accessMap';
import { getRegionLabel } from '@/lib/regions';
import { ChevronsUpDown, Send } from 'lucide-react';

function SortHeader({ label, active, onClick, className = '' }) {
  return (
    <th className={`px-4 py-2.5 text-left ${className}`}>
      <button
        onClick={onClick}
        className="inline-flex items-center gap-1 section-label hover:opacity-70 transition-opacity"
        style={active ? { color: '#1D428A' } : undefined}
      >
        {label}
        <ChevronsUpDown className="w-3 h-3" />
      </button>
    </th>
  );
}

export default function UserTable({ rows, sortKey, onSort, onSelect, onAssign }) {
  return (
    <div className="pal-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              <SortHeader label="Name" active={sortKey === 'name'} onClick={() => onSort('name')} />
              <SortHeader label="Role" active={sortKey === 'role'} onClick={() => onSort('role')} />
              <th className="px-4 py-2.5 text-left section-label">Region</th>
              <th className="px-4 py-2.5 text-left section-label">Review activity</th>
              <SortHeader label="Last response" active={sortKey === 'last'} onClick={() => onSort('last')} />
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <tr
                key={row.user.id}
                onClick={() => onSelect(row)}
                className="table-row-airy cursor-pointer"
              >
                <td className="px-4 py-3">
                  <p className="text-sm font-medium" style={{ color: '#1D2B47' }}>
                    {row.user.full_name || '—'}
                  </p>
                  <p className="text-xs text-muted-foreground">{row.user.email}</p>
                </td>
                <td className="px-4 py-3">
                  <span className={ROLE_BADGE_CLASS[row.user.role] || 'badge-draft'}>
                    {roleLabel(row.user.role)}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs" style={{ color: '#3A4A66' }}>
                  {row.user.regions?.length
                    ? row.user.regions.map(getRegionLabel).join(', ')
                    : (row.regions.length ? row.regions.join(', ') : '—')}
                </td>
                <td className="px-4 py-3">
                  {row.total === 0 ? (
                    <span className="text-xs text-muted-foreground">No assignments</span>
                  ) : (
                    <span className="text-xs" style={{ color: '#1D2B47' }}>
                      {row.awaiting} awaiting · {row.responded} done
                      {row.confirmed > 0 && (
                        <span className="text-muted-foreground"> · {row.confirmed} confirmed</span>
                      )}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-xs text-muted-foreground">
                  {row.lastResponded ? new Date(row.lastResponded).toLocaleDateString() : '—'}
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={(e) => { e.stopPropagation(); onAssign(row); }}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-border hover:bg-muted transition-colors"
                    style={{ color: '#1D428A' }}
                  >
                    <Send className="w-3 h-3" />
                    Assign
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {rows.length === 0 && (
        <div className="px-4 py-12 text-center">
          <p className="text-sm text-muted-foreground">No users match your filters.</p>
        </div>
      )}
    </div>
  );
}