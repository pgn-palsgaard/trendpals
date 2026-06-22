// Scenario B — reports are ephemeral (generateTrendReport result is not stored in Report entity)
import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { ChevronDown } from 'lucide-react';
import TrendReportSections from '@/components/trendreport/TrendReportSections';

const CATEGORY_LABELS = {
  bakery: 'Bakery', condiments: 'Condiments', chocolate_confectionery: 'Chocolate & Confectionery',
  dairy: 'Dairy', ice_cream: 'Ice Cream', meat: 'Processed Meat', oils_fats: 'Oils & Fats',
  plant_based: 'Plant-based', rutf_rusf: 'RUTF/RUSF', needs_human_review: 'Needs Review',
};

export default function Reports() {
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
    <div style={{ minHeight: '100vh', background: 'hsl(var(--background))' }}>
      <div style={{ maxWidth: 800, margin: '0 auto', padding: '24px 24px 64px' }}>

        {/* Header */}
        <div style={{ marginBottom: 28 }}>
          <h1 style={{
            fontFamily: 'Lora, Georgia, serif',
            fontSize: 28, fontWeight: 600, color: '#1D2B47',
            letterSpacing: '-0.02em', lineHeight: 1.25, margin: '0 0 4px',
          }}>
            Reports
          </h1>
          <p style={{ fontSize: 14, color: 'hsl(var(--muted-foreground))', margin: 0 }}>
            Generate trend reports from approved challenges and current sources.
          </p>
        </div>

        {/* Info note */}
        <div style={{
          background: '#EBF0F8', border: '1px solid #C5D2EC', borderRadius: 8,
          padding: '10px 14px', marginBottom: 20, fontSize: 13, color: '#1D428A',
        }}>
          Reports are generated on demand. For quick access, use the Generate button inside each trend's hub page.
        </div>

        {/* Generator card */}
        <div style={{
          background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))',
          borderRadius: 10, padding: '20px 20px',
          boxShadow: '0 1px 4px 0 rgba(29,43,71,0.06)',
          marginBottom: 28,
        }}>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#1D2B47', marginBottom: 10 }}>
            Select a trend
          </label>
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <select
                value={selectedTrendId}
                onChange={e => { setSelectedTrendId(e.target.value); setReportData(null); setError(null); }}
                style={{
                  width: '100%', border: '1px solid hsl(var(--border))', background: 'hsl(var(--card))',
                  borderRadius: 8, padding: '8px 32px 8px 12px', fontSize: 13, color: '#1D2B47',
                  appearance: 'none',
                }}
              >
                <option value="">— Choose a trend —</option>
                {activeTrends.map(t => (
                  <option key={t.id} value={t.id}>
                    {t.trend_name}{t.category ? ` (${CATEGORY_LABELS[t.category] || t.category})` : ''}
                  </option>
                ))}
              </select>
              <ChevronDown style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', width: 16, height: 16, color: 'hsl(var(--muted-foreground))', pointerEvents: 'none' }} />
            </div>
            <button
              onClick={handleGenerate}
              disabled={!selectedTrendId || loading}
              style={{
                padding: '8px 20px', borderRadius: 8, fontSize: 13, fontWeight: 600,
                background: '#1D428A', color: '#fff', border: 'none', cursor: 'pointer',
                opacity: (!selectedTrendId || loading) ? 0.4 : 1,
                flexShrink: 0,
              }}
            >
              {loading ? 'Generating…' : 'Generate report'}
            </button>
          </div>
        </div>

        {/* Loading */}
        {loading && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '80px 0' }}>
            <div className="w-8 h-8 border-4 border-slate-200 border-t-[#1D428A] rounded-full animate-spin" />
          </div>
        )}

        {/* Error */}
        {error && (
          <div style={{ background: '#FAE9E5', border: '1px solid #C15338', borderRadius: 8, padding: '12px 16px', fontSize: 13, color: '#A33B24' }}>
            <strong>Error:</strong> {error}
          </div>
        )}

        {/* Report output */}
        {reportData && !loading && (
          <TrendReportSections report={reportData} />
        )}
      </div>
    </div>
  );
}