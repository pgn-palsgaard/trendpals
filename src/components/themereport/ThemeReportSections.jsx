import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Star, Layers } from 'lucide-react';
import TrendReportSections from '@/components/trendreport/TrendReportSections';
import AIDisclaimer from '@/components/report/AIDisclaimer';

const THEME_COLORS = {
  sage:      { bg: '#6F8263' },
  chocolate: { bg: '#59361F' },
  blue:      { bg: '#1D428A' },
};

function TrendBlock({ report }) {
  const [open, setOpen] = useState(true);
  const s1 = report.section1_header;
  return (
    <div className="rounded-xl border border-slate-200 overflow-hidden bg-white shadow-sm">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-5 py-4 bg-slate-50 hover:bg-slate-100 transition-colors"
      >
        <div className="flex items-center gap-3 text-left">
          {open ? <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" /> : <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />}
          <span className="font-semibold text-sm" style={{ color: '#1D2B47' }}>{s1.trend_name}</span>
          {report.is_primary && (
            <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: '#fef3c7', color: '#92400e' }}>
              <Star className="w-3 h-3" /> Hero
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">
            {report.summary.approved_challenge_count} approved
          </span>
          {report.summary.white_space_count > 0 && (
            <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: '#C15338', color: '#fff' }}>
              {report.summary.white_space_count} white space
            </span>
          )}
        </div>
      </button>
      {open && (
        <div className="p-5" style={{ background: '#F7F4EE' }}>
          <TrendReportSections report={report} />
        </div>
      )}
    </div>
  );
}

export default function ThemeReportSections({ report }) {
  const { theme_header: h, summary, trend_reports = [], generated_at, region } = report;
  const colors = THEME_COLORS[h.color_key] || THEME_COLORS.blue;

  return (
    <div className="space-y-5">
      {/* Meta */}
      <div className="text-xs text-slate-400 text-right">
        Generated {new Date(generated_at).toLocaleString()} — internal use only
      </div>

      {/* AI disclaimer */}
      <AIDisclaimer />

      {/* Theme header band */}
      <div className="rounded-xl overflow-hidden shadow-sm">
        <div style={{ backgroundColor: colors.bg }} className="px-6 py-6 text-white">
          <div className="flex items-center gap-2 mb-1">
            <Layers className="w-4 h-4 text-white/70" />
            <span className="text-xs font-semibold uppercase tracking-widest text-white/70">
              Theme report{h.year ? ` · ${h.year}` : ''}{region && region !== 'all' ? ` · ${region.toUpperCase()}` : ''}
            </span>
          </div>
          <h1 className="text-2xl font-bold">{h.name}</h1>
          {h.tagline && <p className="text-sm text-white/80 mt-1">{h.tagline}</p>}
          {h.description && <p className="text-sm text-white/70 mt-3 leading-relaxed">{h.description}</p>}
          {(h.sub_points || []).length > 0 && (
            <ul className="mt-4 space-y-1">
              {h.sub_points.map((sp, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-white/75">
                  <span className="mt-1 w-1 h-1 rounded-full bg-white/60 shrink-0" />
                  {sp}
                </li>
              ))}
            </ul>
          )}
        </div>
        {/* Rollup strip */}
        <div className="bg-white border border-t-0 border-slate-200 px-6 py-4 grid grid-cols-3 gap-4">
          <div>
            <div className="text-xl font-bold" style={{ color: '#1D2B47' }}>{summary.trend_count}</div>
            <div className="text-xs text-slate-400">Curated trends</div>
          </div>
          <div>
            <div className="text-xl font-bold" style={{ color: '#1D2B47' }}>{summary.total_approved_challenges}</div>
            <div className="text-xs text-slate-400">Approved challenges</div>
          </div>
          <div>
            <div className="text-xl font-bold" style={{ color: '#C15338' }}>{summary.total_white_space}</div>
            <div className="text-xs text-slate-400">White space gaps</div>
          </div>
        </div>
      </div>

      {/* Per-trend reports */}
      {trend_reports.length === 0 ? (
        <div className="text-center py-16 text-sm text-slate-400 bg-white border border-slate-200 rounded-xl">
          No approved trends linked to this theme yet. Approve trend links in the Theme Library first.
        </div>
      ) : (
        <div className="space-y-4">
          {trend_reports.map(r => (
            <TrendBlock key={r.global_trend_id} report={r} />
          ))}
        </div>
      )}
    </div>
  );
}