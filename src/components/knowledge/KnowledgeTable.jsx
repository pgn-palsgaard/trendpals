import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { FileText, FolderOpen, Shield, AlertCircle, CheckCircle2, Loader2, Clock } from 'lucide-react';

export default function KnowledgeTable({ sources, isLoading, selectedIds, onSelectionChange }) {
  const toggleSelection = (id) => {
    if (selectedIds.includes(id)) {
      onSelectionChange(selectedIds.filter(sid => sid !== id));
    } else {
      onSelectionChange([...selectedIds, id]);
    }
  };

  const toggleAll = () => {
    if (selectedIds.length === sources.length) {
      onSelectionChange([]);
    } else {
      onSelectionChange(sources.map(s => s.id));
    }
  };

  const getTrustTierColor = (tier) => {
    switch (tier) {
      case 'approved': return 'bg-green-100 text-green-700';
      case 'draft': return 'bg-yellow-100 text-yellow-700';
      case 'external_reference': return 'bg-blue-100 text-blue-700';
      default: return 'bg-slate-100 text-slate-700';
    }
  };

  const getExtractionStatusChip = (source) => {
    const me = source.metadata_extraction;
    if (!me) return null;
    if (me.status === 'skipped') return null;
    if (me.status === 'failed') return (
      <span className="inline-flex items-center gap-0.5 text-xs px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 border border-red-200 font-medium">
        <AlertCircle className="w-2.5 h-2.5" /> failed extraction
      </span>
    );
    if (me.status === 'extracted' && !me.verified) return (
      <span className="inline-flex items-center gap-0.5 text-xs px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200 font-medium">
        <Clock className="w-2.5 h-2.5" /> needs verification
      </span>
    );
    if (me.status === 'extracted' && me.verified && source.rag_processed) return (
      <span className="inline-flex items-center gap-0.5 text-xs px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 border border-blue-200 font-medium">
        <CheckCircle2 className="w-2.5 h-2.5" /> processed
      </span>
    );
    if (me.status === 'extracted' && me.verified) return (
      <span className="inline-flex items-center gap-0.5 text-xs px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 border border-green-200 font-medium">
        <CheckCircle2 className="w-2.5 h-2.5" /> extracted
      </span>
    );
    return null;
  };

  const getSubtypeLabel = (subtype) => {
    const labels = {
      product_sheet: 'Product Sheet',
      technical_doc: 'Technical Doc',
      capability_overview: 'Capability',
      case_study: 'Case Study',
      certification: 'Certification',
      sustainability: 'Sustainability',
      application_note: 'Application Note',
      webpage_snapshot: 'Webpage',
      other: 'Other'
    };
    return labels[subtype] || subtype;
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-slate-600">Loading knowledge sources...</p>
        </CardContent>
      </Card>
    );
  }

  if (sources.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <FileText className="w-12 h-12 text-slate-400 mx-auto mb-3" />
          <p className="text-slate-600">No knowledge sources found</p>
          <p className="text-sm text-slate-500 mt-1">Upload files to get started</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 border-b">
              <tr>
                <th className="w-12 p-3">
                  <Checkbox
                    checked={selectedIds.length === sources.length}
                    onCheckedChange={toggleAll}
                  />
                </th>
                <th className="text-left p-3 text-xs font-semibold text-slate-700">Title</th>
                <th className="text-left p-3 text-xs font-semibold text-slate-700">Subtype</th>
                <th className="text-left p-3 text-xs font-semibold text-slate-700">Folder</th>
                <th className="text-left p-3 text-xs font-semibold text-slate-700">Tags</th>
                <th className="text-left p-3 text-xs font-semibold text-slate-700">Trust Tier</th>
                <th className="text-left p-3 text-xs font-semibold text-slate-700">RAG Status</th>
                <th className="text-left p-3 text-xs font-semibold text-slate-700">Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {sources.map(source => (
                <tr 
                  key={source.id}
                  className={`hover:bg-slate-50 ${selectedIds.includes(source.id) ? 'bg-blue-50' : ''}`}
                >
                  <td className="p-3">
                    <Checkbox
                      checked={selectedIds.includes(source.id)}
                      onCheckedChange={() => toggleSelection(source.id)}
                    />
                  </td>
                  <td className="p-3">
                    <div className="flex items-start gap-2">
                      <FileText className="w-4 h-4 text-slate-400 mt-0.5 flex-shrink-0" />
                      <div className="min-w-0">
                        <div className="font-medium text-sm text-slate-900 truncate">{source.title}</div>
                        {source.relative_path && source.relative_path !== source.title && (
                          <div className="text-xs text-slate-500 truncate">{source.relative_path}</div>
                        )}
                        {getExtractionStatusChip(source) && (
                          <div className="mt-1">{getExtractionStatusChip(source)}</div>
                        )}
                        {source.expires_at && new Date(source.expires_at) < new Date() && (
                          <div className="flex items-center gap-1 text-xs text-red-600 mt-1">
                            <AlertCircle className="w-3 h-3" />
                            Expired
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="p-3">
                    <Badge variant="outline" className="text-xs">
                      {getSubtypeLabel(source.knowledge_subtype)}
                    </Badge>
                  </td>
                  <td className="p-3">
                    {source.folder_path && (
                      <div className="flex items-center gap-1 text-xs text-slate-600">
                        <FolderOpen className="w-3 h-3" />
                        {source.folder_path}
                      </div>
                    )}
                  </td>
                  <td className="p-3">
                    <div className="flex flex-wrap gap-1">
                      {source.tags?.slice(0, 3).map(tag => (
                        <Badge key={tag} variant="outline" className="text-xs">
                          {tag}
                        </Badge>
                      ))}
                      {source.tags?.length > 3 && (
                        <Badge variant="outline" className="text-xs">
                          +{source.tags.length - 3}
                        </Badge>
                      )}
                    </div>
                  </td>
                  <td className="p-3">
                    <div className="flex items-center gap-1">
                      <Badge className={`text-xs ${getTrustTierColor(source.trust_tier)}`}>
                        {source.trust_tier}
                      </Badge>
                      {source.trust_tier === 'approved' && (
                        <Shield className="w-3 h-3 text-green-600" />
                      )}
                    </div>
                  </td>
                  <td className="p-3">
                    {source.status === 'processing' ? (
                      <div className="flex items-center gap-1 text-xs text-blue-600">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        Processing...
                      </div>
                    ) : source.excerpts && source.excerpts.length > 0 ? (
                      <div className="flex items-center gap-1 text-xs text-green-700">
                        <CheckCircle2 className="w-3 h-3" />
                        {source.excerpts.length} claims
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 text-xs text-orange-600">
                        <AlertCircle className="w-3 h-3" />
                        Not processed
                      </div>
                    )}
                  </td>
                  <td className="p-3 text-xs text-slate-600">
                    {source.updated_date ? new Date(source.updated_date).toLocaleDateString() : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}