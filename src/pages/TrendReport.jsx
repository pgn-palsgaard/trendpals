// DEPRECATED — replaced by TrendHub Generate CTA + Reports archive page
// Build D+E, 2026-06-22. Redirect route in App.jsx: /TrendReport → /Reports
// Safe to delete after confirming no imports reference this file.
import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { AlertTriangle, CheckCircle, Clock, XCircle, Lightbulb, ChevronDown } from 'lucide-react';
import TrendReportSections from '@/components/trendreport/TrendReportSections';

import { CATEGORY_LABELS } from '@/lib/palsgaardCategoryMapping';

export default function TrendReport() {
  const [selectedTrendId, setSelectedTrendId] = useState('');
  const [reportData, setReportData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const { data: trends = [] } = useQuery({
    queryKey: ['globalTrends'],
    queryFn: () => base44.entities.GlobalTrend.list(),
  });

  const activeTrends = trends.filter(t => t.is_active);

  const handleGenerate = async () => {
    if (!selectedTrendId) return;
    setLoading(true);
    setError(null);
    setReportData(null);
    try {
      const res = await base44.functions.invoke('generateTrendReport', { global_trend_id: selectedTrendId });
      setReportData(res?.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#F7F4EE' }}>
      <div className="max-w-4xl mx-auto px-4 md:px-6 py-10">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold" style={{ color: '#1D2B47' }}>Trend Report</h1>
          <p className="text-sm text-slate-500 mt-1">Internal decision report for the Innovation team — evidence-first, unfiltered.</p>
        </div>

        {/* Trend picker */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 mb-8 shadow-sm">
          <label className="block text-sm font-semibold mb-2" style={{ color: '#1D2B47' }}>Select a GlobalTrend</label>
          <div className="flex gap-3">
            <div className="relative flex-1">
              <select
                value={selectedTrendId}
                onChange={e => { setSelectedTrendId(e.target.value); setReportData(null); setError(null); }}
                className="w-full border border-slate-200 bg-white rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none appearance-none pr-8"
              >
                <option value="">— Choose a trend —</option>
                {activeTrends.map(t => (
                  <option key={t.id} value={t.id}>
                    {t.trend_name} {t.category ? `(${CATEGORY_LABELS[t.category] || t.category})` : ''}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            </div>
            <button
              onClick={handleGenerate}
              disabled={!selectedTrendId || loading}
              className="px-5 py-2 rounded-lg text-sm font-semibold text-white transition-opacity disabled:opacity-40"
              style={{ backgroundColor: '#1D428A' }}
            >
              {loading ? 'Generating…' : 'Generate Report'}
            </button>
          </div>
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-24">
            <div className="w-8 h-8 border-4 border-slate-200 border-t-blue-700 rounded-full animate-spin" />
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm">
            <strong>Error:</strong> {error}
          </div>
        )}

        {/* Report */}
        {reportData && !loading && (
          <TrendReportSections report={reportData} />
        )}
      </div>
    </div>
  );
}