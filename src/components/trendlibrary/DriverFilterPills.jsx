import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';

/**
 * DriverFilterPills
 * Replaces MegaTrendsSection with a compact pill-row filter.
 * Props mirror MegaTrendsSection exactly so TrendLibrary.jsx needs minimal changes.
 *
 * @param {Array}    trends          - All GlobalTrend records (from parent query)
 * @param {string|null} activeMegaTrend - Currently selected mega_trend_name, or null for "Alle"
 * @param {Function} onSelect        - (mega_trend_name: string|null) => void
 * @param {Function} onOpenDetail    - (megaTrend: object) => void — preserved for compatibility;
 *                                     pills do NOT trigger this (no detail panel from pills)
 */
export default function DriverFilterPills({ trends, activeMegaTrend, onSelect, onOpenDetail }) {
  const { data: megaTrends = [] } = useQuery({
    queryKey: ['megaTrends'],
    queryFn: () => base44.entities.MegaTrend.filter({ is_active: true }, 'display_order', 50),
  });

  const counts = useMemo(() => {
    const map = {};
    megaTrends.forEach(m => {
      map[m.mega_trend_name] = trends.filter(t => t.mega_trend === m.mega_trend_name).length;
    });
    return map;
  }, [megaTrends, trends]);

  const totalCount = trends.length;

  if (megaTrends.length === 0) return null;

  const activePillStyle = {
    background: '#1D428A',
    color: '#ffffff',
    borderColor: '#1D428A',
    fontWeight: 500,
  };

  const inactivePillStyle = {
    background: 'transparent',
    color: '#1D2B47',
    borderColor: 'hsl(var(--border))',
    fontWeight: 400,
  };

  const pillBase = {
    borderRadius: 9999,
    padding: '5px 12px',
    fontSize: 13,
    cursor: 'pointer',
    border: '1px solid',
    transition: 'all 0.15s ease',
    lineHeight: 1.4,
  };

  return (
    <div className="mb-6">
      <p style={{
        fontSize: 11,
        color: 'hsl(var(--muted-foreground))',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        marginBottom: 6,
        fontWeight: 500,
      }}>
        Driver
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {/* Alle pill */}
        <button
          style={{
            ...pillBase,
            ...(activeMegaTrend === null ? activePillStyle : inactivePillStyle),
          }}
          onClick={() => onSelect(null)}
        >
          Alle ({totalCount})
        </button>

        {/* One pill per MegaTrend */}
        {megaTrends.map(m => {
          const isActive = activeMegaTrend === m.mega_trend_name;
          return (
            <button
              key={m.id}
              style={{
                ...pillBase,
                ...(isActive ? activePillStyle : inactivePillStyle),
              }}
              onClick={() => onSelect(isActive ? null : m.mega_trend_name)}
            >
              {m.mega_trend_name} ({counts[m.mega_trend_name] ?? 0})
            </button>
          );
        })}
      </div>
    </div>
  );
}