import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Library, ExternalLink } from 'lucide-react';
import { findSimilarReports } from '@/lib/findSimilarReports';

/**
 * Warns the user that a report answering this request may already exist,
 * so the same work is not produced twice. Never blocks — purely informative.
 */
export default function SimilarReportsPanel({ query }) {
  const [matches, setMatches] = useState([]);
  const key = JSON.stringify(query || {});

  useEffect(() => {
    let alive = true;
    const timer = setTimeout(() => {
      findSimilarReports(query)
        .then(res => { if (alive) setMatches(res); })
        .catch(() => { if (alive) setMatches([]); });
    }, 1200);
    return () => { alive = false; clearTimeout(timer); };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!matches.length) return null;

  return (
    <div className="rounded-xl border p-5" style={{ background: '#F3EFE6', borderColor: '#d8d3c8' }}>
      <div className="flex items-start gap-2.5 mb-3">
        <Library className="w-4 h-4 shrink-0 mt-0.5" style={{ color: '#1D428A' }} />
        <div>
          <p className="text-sm font-semibold" style={{ color: '#1D2B47' }}>
            {matches.length} existing report{matches.length !== 1 ? 's' : ''} may already cover this
          </p>
          <p className="text-xs mt-1 leading-relaxed" style={{ color: '#6B7280' }}>
            Have a look before requesting a new one — reuse it, or continue if you need something different.
          </p>
        </div>
      </div>

      <div className="space-y-2">
        {matches.map(({ report, reason }) => (
          <Link
            key={report.id}
            to={`/ReportView?id=${report.id}`}
            className="block rounded-lg bg-white border px-3 py-2.5 transition-colors hover:border-[#1D428A]"
            style={{ borderColor: '#e5e1d8' }}
          >
            <div className="flex items-start justify-between gap-2">
              <span className="text-xs font-semibold leading-snug" style={{ color: '#1D2B47' }}>{report.title}</span>
              <span className="text-[10px] font-bold shrink-0 px-1.5 py-0.5 rounded" style={{ background: '#EEF1EC', color: '#4A6040' }}>
                Likely covers this
              </span>
            </div>
            {reason && (
              <p className="text-[11px] mt-1 leading-snug" style={{ color: '#6B7280' }}>{reason}</p>
            )}
            <p className="text-[11px] mt-1 flex items-center gap-1" style={{ color: '#969696' }}>
              {[report.category, report.region].filter(Boolean).join(' · ')}
              {report.created_date ? ` · ${new Date(report.created_date).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}` : ''}
              <ExternalLink className="w-3 h-3" />
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}