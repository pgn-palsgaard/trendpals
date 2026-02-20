import React from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { FileText, ExternalLink, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function SourceTable({ sources, selectedIds, onSelectAll, onSelectSource, onSourceClick }) {
  const getTypeIcon = (type) => {
    if (type === 'mintel') return '📄';
    if (type === 'gnpd') return '🛒';
    if (type === 'report') return '📊';
    if (type === 'url') return '🔗';
    return '📄';
  };

  const getCompleteness = (source) => {
    const fields = ['region', 'category', 'date', 'trust_tier'];
    const filled = fields.filter(f => source[f]).length;
    const total = fields.length;
    const percentage = Math.round((filled / total) * 100);
    
    return { filled, total, percentage, isComplete: filled === total };
  };

  const getFreshnessDisplay = (freshness) => {
    if (freshness === 'recent') return { icon: '🟢', text: 'Fresh', class: 'border-green-300 bg-green-50 text-green-700' };
    if (freshness === 'aging') return { icon: '🟡', text: 'Aging', class: 'border-yellow-300 bg-yellow-50 text-yellow-700' };
    if (freshness === 'outdated') return { icon: '🔴', text: 'Outdated', class: 'border-red-300 bg-red-50 text-red-700' };
    return { icon: '', text: '-', class: '' };
  };

  const getTrustDisplay = (tier) => {
    if (tier === 'high') return { text: 'High', class: 'border-green-300 bg-green-50 text-green-700' };
    if (tier === 'medium') return { text: 'Medium', class: 'border-blue-300 bg-blue-50 text-blue-700' };
    if (tier === 'low') return { text: 'Low', class: 'border-slate-300 bg-slate-50 text-slate-700' };
    return { text: '-', class: '' };
  };

  const allSelected = sources.length > 0 && sources.every(s => selectedIds.includes(s.id));

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead className="bg-slate-50 border-b border-slate-200">
          <tr>
            <th className="w-12 px-4 py-3">
              <Checkbox
                checked={allSelected}
                onCheckedChange={onSelectAll}
              />
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-slate-700 uppercase">Type</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-slate-700 uppercase">Title</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-slate-700 uppercase">Region</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-slate-700 uppercase">Category</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-slate-700 uppercase">Date</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-slate-700 uppercase">Freshness</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-slate-700 uppercase">Trust</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-slate-700 uppercase">Complete</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-slate-700 uppercase">Used In</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {sources.map(source => {
            const freshness = getFreshnessDisplay(source.freshness);
            const trust = getTrustDisplay(source.trust_tier);
            const completeness = getCompleteness(source);
            
            return (
              <tr
                key={source.id}
                className="hover:bg-slate-50 cursor-pointer transition-colors"
                onClick={() => onSourceClick(source)}
              >
                <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                  <Checkbox
                    checked={selectedIds.includes(source.id)}
                    onCheckedChange={(checked) => onSelectSource(source.id, checked)}
                  />
                </td>
                <td className="px-4 py-3">
                  <span className="text-2xl">{getTypeIcon(source.source_type)}</span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-slate-900 truncate max-w-md" title={source.title}>
                        {source.title}
                      </div>
                      {source.is_archived && (
                        <Badge variant="outline" className="text-xs mt-1">Archived</Badge>
                      )}
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  {source.region ? (
                    <Badge variant="outline" className="text-xs">{source.region}</Badge>
                  ) : (
                    <span className="text-slate-400 text-sm">-</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <span className="text-sm text-slate-700">{source.category || '-'}</span>
                </td>
                <td className="px-4 py-3">
                  {source.source_type === 'gnpd' && source.gnpd_processing_status ? (
                    <div>
                      {source.gnpd_processing_status === 'processing' && (
                        <Badge variant="outline" className="text-xs text-blue-600 border-blue-300">
                          Processing GNPD...
                        </Badge>
                      )}
                      {source.gnpd_processing_status === 'ready' && (
                        <Badge variant="outline" className="text-xs text-green-600 border-green-300">
                          GNPD ready ({source.gnpd_row_count || 0} rows)
                        </Badge>
                      )}
                      {source.gnpd_processing_status === 'failed' && (
                        <Badge variant="outline" className="text-xs text-red-600 border-red-300">
                          GNPD failed
                        </Badge>
                      )}
                    </div>
                  ) : source.date ? (
                    <span className="text-sm text-slate-700">
                      {new Date(source.date).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                    </span>
                  ) : (
                    <span className="text-slate-400 text-sm">-</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {freshness.text !== '-' ? (
                    <Badge variant="outline" className={`text-xs ${freshness.class}`}>
                      {freshness.icon} {freshness.text}
                    </Badge>
                  ) : (
                    <span className="text-slate-400 text-sm">-</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {trust.text !== '-' ? (
                    <Badge variant="outline" className={`text-xs ${trust.class}`}>
                      {trust.text}
                    </Badge>
                  ) : (
                    <span className="text-slate-400 text-sm">-</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className={`text-xs font-medium ${
                      completeness.percentage === 100 ? 'text-green-700' :
                      completeness.percentage >= 50 ? 'text-amber-700' :
                      'text-red-700'
                    }`}>
                      {completeness.filled}/{completeness.total}
                    </div>
                    <div className="w-12 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                      <div 
                        className={`h-full transition-all ${
                          completeness.percentage === 100 ? 'bg-green-500' :
                          completeness.percentage >= 50 ? 'bg-amber-500' :
                          'bg-red-500'
                        }`}
                        style={{ width: `${completeness.percentage}%` }}
                      />
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  {source.usageCount > 0 ? (
                    <div className="flex items-center gap-1 text-sm text-blue-600">
                      <span className="font-medium">{source.usageCount}</span>
                      <span>project{source.usageCount !== 1 ? 's' : ''}</span>
                    </div>
                  ) : (
                    <span className="text-slate-400 text-sm">Unused</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}