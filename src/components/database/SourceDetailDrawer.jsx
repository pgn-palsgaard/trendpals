import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { X, Edit, Download, Archive, Trash2, ExternalLink, Calendar, FileText, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import PublicationDateEditor from './PublicationDateEditor';

export default function SourceDetailDrawer({ source, linkedProjects, onClose }) {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('preview');
  const [editMode, setEditMode] = useState(false);
  const [editData, setEditData] = useState(source);
  const [user, setUser] = useState(null);

  useEffect(() => {
    base44.auth.me().then(setUser);
  }, []);

  const updateSourceMutation = useMutation({
    mutationFn: async (data) => {
      await base44.entities.Source.update(source.id, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sourcesDatabase'] });
      toast.success('Source updated ✓');
      setEditMode(false);
    },
    onError: () => {
      toast.error('Failed to update source');
    }
  });

  const archiveSourceMutation = useMutation({
    mutationFn: async () => {
      await base44.entities.Source.update(source.id, { is_archived: true });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sourcesDatabase'] });
      toast.success('Source archived ✓');
      onClose();
    },
    onError: () => {
      toast.error('Failed to archive source');
    }
  });

  const deleteSourceMutation = useMutation({
    mutationFn: async () => {
      // Unlink from all projects first
      for (const project of linkedProjects) {
        const updatedIds = (project.selected_source_ids || []).filter(id => id !== source.id);
        await base44.entities.Project.update(project.id, { selected_source_ids: updatedIds });
      }
      await base44.entities.Source.delete(source.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sourcesDatabase'] });
      queryClient.invalidateQueries({ queryKey: ['allProjects'] });
      toast.success('Source deleted ✓');
      onClose();
    },
    onError: () => {
      toast.error('Failed to delete source');
    }
  });

  const handleSave = () => {
    updateSourceMutation.mutate(editData);
  };

  const handleArchive = () => {
    if (confirm(`Archive "${source.title}"?\n\nArchived sources are hidden from the library but remain accessible via search. You can restore them later.`)) {
      archiveSourceMutation.mutate();
    }
  };

  const handleDelete = () => {
    if (linkedProjects.length > 0) {
      const recentlyUsed = linkedProjects.some(p => {
        const daysSince = Math.floor((new Date() - new Date(p.updated_date)) / (1000 * 60 * 60 * 24));
        return daysSince < 7;
      });

      const message = `Delete "${source.title}"?\n\n⚠️ This source is linked to ${linkedProjects.length} active project${linkedProjects.length > 1 ? 's' : ''}:\n${linkedProjects.slice(0, 3).map(p => `• ${p.name} (last used ${Math.floor((new Date() - new Date(p.updated_date)) / (1000 * 60 * 60 * 24))} days ago)`).join('\n')}${linkedProjects.length > 3 ? `\n...and ${linkedProjects.length - 3} more` : ''}\n\nDeleting will unlink it from these projects. This cannot be undone.`;
      
      if (confirm(message)) {
        deleteSourceMutation.mutate();
      }
    } else {
      if (confirm(`Delete "${source.title}"?\n\nThis source is not linked to any projects and can be safely deleted. This cannot be undone.`)) {
        deleteSourceMutation.mutate();
      }
    }
  };

  const getFreshnessDisplay = (freshness) => {
    if (freshness === 'recent') return { icon: '🟢', text: 'Fresh', class: 'border-green-300 bg-green-50 text-green-700' };
    if (freshness === 'aging') return { icon: '🟡', text: 'Aging', class: 'border-yellow-300 bg-yellow-50 text-yellow-700' };
    if (freshness === 'outdated') return { icon: '🔴', text: 'Outdated', class: 'border-red-300 bg-red-50 text-red-700' };
    return null;
  };

  const freshness = getFreshnessDisplay(source.freshness);
  const monthsSincePublish = source.date ? Math.floor((new Date() - new Date(source.date)) / (1000 * 60 * 60 * 24 * 30)) : null;

  return (
    <div className="fixed right-0 top-16 bottom-0 w-[600px] bg-white border-l border-slate-200 shadow-xl z-50 overflow-y-auto">
      {/* Header */}
      <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between z-10">
        <h2 className="text-lg font-semibold text-slate-900">Source Details</h2>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="w-5 h-5" />
        </Button>
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-200 px-6">
        <div className="flex gap-6">
          {['preview', 'metadata', 'usage', 'activity'].map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`py-3 border-b-2 transition-colors capitalize ${
                activeTab === tab
                  ? 'border-blue-600 text-blue-600 font-medium'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="p-6 space-y-6">
        {/* Outdated Warning */}
        {source.freshness === 'outdated' && monthsSincePublish && (
          <div className="p-4 bg-orange-50 border border-orange-200 rounded-lg">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-5 h-5 text-orange-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-orange-900">
                  This source is over 18 months old
                </p>
                <p className="text-xs text-orange-700 mt-1">
                  Published {monthsSincePublish} months ago. Verify trends are still relevant or replace with recent data.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Preview Tab */}
        {activeTab === 'preview' && (
          <div className="space-y-4">
            {/* File Preview Placeholder */}
            {source.file_url && (
              <div className="border border-slate-200 rounded-lg p-8 bg-slate-50 text-center">
                <FileText className="w-16 h-16 text-slate-400 mx-auto mb-3" />
                <p className="text-sm text-slate-600 mb-3">File preview not available</p>
                <a href={source.file_url} target="_blank" rel="noopener noreferrer">
                  <Button variant="outline" size="sm">
                    <Download className="w-4 h-4 mr-2" />
                    Download file
                  </Button>
                </a>
              </div>
            )}

            {/* Quick Metadata */}
            <div className="space-y-3">
              <h3 className="font-semibold text-slate-900">{source.title}</h3>
              
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-slate-600">Type:</span>
                  <span className="ml-2 font-medium capitalize">{source.source_type}</span>
                </div>
                <div>
                  <span className="text-slate-600">Region:</span>
                  <span className="ml-2 font-medium">{source.region || '-'}</span>
                </div>
                <div>
                  <span className="text-slate-600">Category:</span>
                  <span className="ml-2 font-medium">{source.category || '-'}</span>
                </div>
                <div>
                  <span className="text-slate-600">Date Published:</span>
                  <span className="ml-2 font-medium">
                    {source.date ? new Date(source.date).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : '-'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-600">Uploaded:</span>
                  <span className="ml-2 font-medium">
                    {new Date(source.created_date).toLocaleDateString()}
                  </span>
                </div>
                <div>
                  <span className="text-slate-600">Uploader:</span>
                  <span className="ml-2 font-medium">{source.created_by}</span>
                </div>
              </div>

              {/* Badges */}
              <div className="flex flex-wrap gap-2">
                {freshness && (
                  <Badge variant="outline" className={freshness.class}>
                    {freshness.icon} {freshness.text}
                  </Badge>
                )}
                {source.trust_tier && (
                  <Badge variant="outline">
                    Trust: {source.trust_tier}
                  </Badge>
                )}
                {source.usage_permission && (
                  <Badge variant="outline">
                    {source.usage_permission === 'evidence' && '✓ Evidence'}
                    {source.usage_permission === 'framing' && '💡 Framing'}
                    {source.usage_permission === 'reference' && '👁️ Reference'}
                    {source.usage_permission === 'forbidden' && '🚫 Forbidden'}
                  </Badge>
                )}
              </div>

              {/* Data Stats */}
              {(source.excerpts?.length > 0 || source.gnpd_data?.length > 0) && (
                <div className="pt-3 border-t border-slate-200 space-y-1 text-sm">
                  {source.excerpts?.length > 0 && (
                    <div className="text-slate-600">📄 {source.excerpts.length} text excerpts</div>
                  )}
                  {source.gnpd_data?.length > 0 && (
                    <div className="text-slate-600">🛒 {source.gnpd_data.length} GNPD products</div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Metadata Tab */}
        {activeTab === 'metadata' && (
          <div className="space-y-4">
            {editMode ? (
              <>
                <div className="space-y-2">
                  <Label>Title *</Label>
                  <Input
                    value={editData.title}
                    onChange={(e) => setEditData({ ...editData, title: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Source Type *</Label>
                  <Select
                    value={editData.source_type}
                    onValueChange={(value) => setEditData({ ...editData, source_type: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="mintel">Mintel</SelectItem>
                      <SelectItem value="gnpd">GNPD</SelectItem>
                      <SelectItem value="report">Report</SelectItem>
                      <SelectItem value="url">URL</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Region</Label>
                    <Select
                      value={editData.region_code || editData.region || ''}
                      onValueChange={(value) => setEditData({ ...editData, region_code: value, region: value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ASPAC">ASPAC</SelectItem>
                        <SelectItem value="AMERICAS">AMERICAS</SelectItem>
                        <SelectItem value="EMEC">EMEC</SelectItem>
                        <SelectItem value="IMEA">IMEA (India, Middle East & Africa)</SelectItem>
                        <SelectItem value="Global">Global</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Category</Label>
                    <Input
                      value={editData.category || ''}
                      onChange={(e) => setEditData({ ...editData, category: e.target.value })}
                      placeholder="e.g., Ice Cream"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Trust Tier</Label>
                    <Select
                      value={editData.trust_tier || 'medium'}
                      onValueChange={(value) => setEditData({ ...editData, trust_tier: value })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="high">High</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="low">Low</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Usage Permission</Label>
                    <Select
                      value={editData.usage_permission || 'evidence'}
                      onValueChange={(value) => setEditData({ ...editData, usage_permission: value })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="evidence">Evidence</SelectItem>
                        <SelectItem value="framing">Framing</SelectItem>
                        <SelectItem value="reference">Reference only</SelectItem>
                        <SelectItem value="forbidden">Forbidden</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Notes</Label>
                  <Textarea
                    value={editData.notes || ''}
                    onChange={(e) => setEditData({ ...editData, notes: e.target.value })}
                    placeholder="Internal context and notes..."
                    rows={4}
                    maxLength={500}
                  />
                  <p className="text-xs text-slate-500">{(editData.notes || '').length}/500 characters</p>
                </div>

                {/* Publication Date Editor */}
                {user && (
                  <div className="pt-4 border-t border-slate-200">
                    <PublicationDateEditor
                      source={source}
                      user={user}
                      onSave={async (updates) => {
                        await updateSourceMutation.mutateAsync(updates);
                      }}
                    />
                  </div>
                )}

                <div className="flex gap-2">
                  <Button onClick={handleSave} disabled={updateSourceMutation.isPending}>
                    Save Changes
                  </Button>
                  <Button variant="outline" onClick={() => setEditMode(false)}>
                    Cancel
                  </Button>
                </div>
              </>
            ) : (
              <>
                <div className="space-y-3 text-sm">
                  <div>
                    <span className="text-slate-600 block mb-1">Title</span>
                    <span className="font-medium">{source.title}</span>
                  </div>
                  <div>
                    <span className="text-slate-600 block mb-1">Type</span>
                    <span className="font-medium capitalize">{source.source_type}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <span className="text-slate-600 block mb-1">Region</span>
                      <span className="font-medium">{source.region || '-'}</span>
                    </div>
                    <div>
                      <span className="text-slate-600 block mb-1">Category</span>
                      <span className="font-medium">{source.category || '-'}</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <span className="text-slate-600 block mb-1">Trust Tier</span>
                      <span className="font-medium capitalize">{source.trust_tier || 'medium'}</span>
                    </div>
                    <div>
                      <span className="text-slate-600 block mb-1">Usage Permission</span>
                      <span className="font-medium capitalize">{source.usage_permission || 'evidence'}</span>
                    </div>
                  </div>
                  {source.notes && (
                    <div>
                      <span className="text-slate-600 block mb-1">Notes</span>
                      <p className="text-slate-900">{source.notes}</p>
                    </div>
                  )}
                </div>
                <Button variant="outline" onClick={() => setEditMode(true)}>
                  <Edit className="w-4 h-4 mr-2" />
                  Edit Metadata
                </Button>
              </>
            )}
          </div>
        )}

        {/* Usage Tab */}
        {activeTab === 'usage' && (
          <div className="space-y-4">
            <div>
              <h3 className="font-semibold text-slate-900 mb-3">Used in Projects</h3>
              {linkedProjects.length === 0 ? (
                <p className="text-sm text-slate-500">Not used in any projects yet</p>
              ) : (
                <div className="space-y-2">
                  {linkedProjects.map(project => (
                    <Link
                      key={project.id}
                      to={createPageUrl('ProjectDetail') + `?id=${project.id}`}
                      className="block p-3 border border-slate-200 rounded-lg hover:border-blue-300 hover:bg-blue-50 transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-medium text-slate-900">{project.name}</div>
                          <div className="text-xs text-slate-600 mt-1">
                            Last used {Math.floor((new Date() - new Date(project.updated_date)) / (1000 * 60 * 60 * 24))} days ago
                          </div>
                        </div>
                        <ExternalLink className="w-4 h-4 text-slate-400" />
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>

            {linkedProjects.length > 0 && (
              <div className="pt-4 border-t border-slate-200 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-600">Total uses:</span>
                  <span className="font-medium">{linkedProjects.length} project{linkedProjects.length !== 1 ? 's' : ''}</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Activity Tab */}
        {activeTab === 'activity' && (
          <div className="space-y-3">
            <div className="flex items-start gap-3 text-sm">
              <div className="w-2 h-2 rounded-full bg-blue-500 mt-1.5" />
              <div>
                <p className="text-slate-900">Uploaded by {source.created_by}</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {new Date(source.created_date).toLocaleDateString('en-US', { 
                    month: 'long', 
                    day: 'numeric', 
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </p>
              </div>
            </div>
            {linkedProjects.map(project => (
              <div key={project.id} className="flex items-start gap-3 text-sm">
                <div className="w-2 h-2 rounded-full bg-green-500 mt-1.5" />
                <div>
                  <p className="text-slate-900">Linked to {project.name}</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {new Date(project.created_date).toLocaleDateString('en-US', { 
                      month: 'long', 
                      day: 'numeric', 
                      year: 'numeric'
                    })}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Actions Footer */}
      <div className="sticky bottom-0 bg-white border-t border-slate-200 px-6 py-4 flex items-center gap-2">
        {source.file_url && (
          <a href={source.file_url} target="_blank" rel="noopener noreferrer">
            <Button variant="outline" size="sm">
              <Download className="w-4 h-4 mr-2" />
              Download
            </Button>
          </a>
        )}
        <Button variant="outline" size="sm" onClick={handleArchive} disabled={archiveSourceMutation.isPending}>
          <Archive className="w-4 h-4 mr-2" />
          Archive
        </Button>
        <Button variant="outline" size="sm" onClick={handleDelete} disabled={deleteSourceMutation.isPending} className="text-red-600 hover:text-red-700">
          <Trash2 className="w-4 h-4 mr-2" />
          Delete
        </Button>
      </div>
    </div>
  );
}