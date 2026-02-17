import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Upload, FileText, AlertCircle, CheckCircle2, Loader2, ExternalLink, Trash2, History } from 'lucide-react';
import { toast } from 'sonner';

export default function ProjectSources({ project, sources }) {
  const queryClient = useQueryClient();
  const [uploading, setUploading] = useState(false);
  const [sourceType, setSourceType] = useState('mintel');
  const [url, setUrl] = useState('');
  const [failedUpload, setFailedUpload] = useState(null);
  const [gnpdHtmlFile, setGnpdHtmlFile] = useState(null);
  const [gnpdXlsxFile, setGnpdXlsxFile] = useState(null);

  const uploadSourceMutation = useMutation({
    mutationFn: async (data) => {
      const response = await base44.functions.invoke('processSource', data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sources', project.id] });
      queryClient.invalidateQueries({ queryKey: ['project', project.id] });
      toast.success('Source processed successfully');
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to process source');
    }
  });

  const deleteSourceMutation = useMutation({
    mutationFn: async (sourceId) => {
      await base44.entities.Source.delete(sourceId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sources', project.id] });
      queryClient.invalidateQueries({ queryKey: ['project', project.id] });
      toast.success('Source removed');
    },
    onError: (error) => {
      toast.error('Failed to remove source');
    }
  });

  const handleFileUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    // Check for duplicates
    const duplicates = files.filter(file => 
      sources.find(s => s.title === file.name)
    );
    
    if (duplicates.length > 0) {
      toast.error(`File(s) already exist: ${duplicates.map(f => f.name).join(', ')}`);
      e.target.value = ''; // Reset input
      return;
    }

    setUploading(true);
    setFailedUpload(null);
    
    try {
      // Upload all files
      for (const file of files) {
        const { file_url } = await base44.integrations.Core.UploadFile({ file });
        
        await uploadSourceMutation.mutateAsync({
          project_id: project.id,
          source_type: sourceType,
          file_url,
          title: file.name
        });
      }
      toast.success(`${files.length} file(s) uploaded successfully`);
      e.target.value = ''; // Reset input
    } catch (error) {
      toast.error('Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleRetryUpload = async () => {
    if (!failedUpload) return;

    setUploading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file: failedUpload.file });
      
      await uploadSourceMutation.mutateAsync({
        project_id: project.id,
        source_type: failedUpload.sourceType,
        file_url,
        title: failedUpload.fileName
      });
      setFailedUpload(null);
    } catch (error) {
      toast.error('Retry failed');
    } finally {
      setUploading(false);
    }
  };

  const handleUrlSubmit = async () => {
    if (!url) return;
    
    // Check for duplicate URL
    const duplicate = sources.find(s => s.title === url || s.url === url);
    if (duplicate) {
      toast.error('This URL has already been added');
      return;
    }
    
    await uploadSourceMutation.mutateAsync({
      project_id: project.id,
      source_type: 'url',
      url,
      title: url
    });
    setUrl('');
  };

  const handleMergeGNPD = async () => {
    if (!gnpdHtmlFile || !gnpdXlsxFile) {
      toast.error('Please select both HTML and Excel files');
      return;
    }

    setUploading(true);
    try {
      // Upload both files
      const htmlUpload = await base44.integrations.Core.UploadFile({ file: gnpdHtmlFile });
      const xlsxUpload = await base44.integrations.Core.UploadFile({ file: gnpdXlsxFile });

      // Merge and process
      const response = await base44.functions.invoke('mergeGNPDData', {
        project_id: project.id,
        html_file_url: htmlUpload.file_url,
        xlsx_file_url: xlsxUpload.file_url,
        title: `GNPD - ${gnpdXlsxFile.name}`
      });

      if (response.data.success) {
        toast.success(`Processed ${response.data.products_count} products with ${response.data.images_count} images`);
        queryClient.invalidateQueries({ queryKey: ['sources', project.id] });
        queryClient.invalidateQueries({ queryKey: ['project', project.id] });
        setGnpdHtmlFile(null);
        setGnpdXlsxFile(null);
      } else {
        toast.error('Failed to merge GNPD data');
      }
    } catch (error) {
      toast.error(error.message || 'Failed to process files');
    } finally {
      setUploading(false);
    }
  };

  const freshnessIcons = {
    recent: <CheckCircle2 className="w-4 h-4 text-green-500" />,
    aging: <AlertCircle className="w-4 h-4 text-yellow-500" />,
    outdated: <History className="w-4 h-4 text-slate-500" />
  };

  return (
    <div className="space-y-6">
      {/* Upload Section */}
      <Card>
        <CardHeader>
          <CardTitle>Upload Sources</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Source Type</Label>
            <Select value={sourceType} onValueChange={setSourceType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="mintel">Mintel Report</SelectItem>
                <SelectItem value="gnpd">GNPD Export</SelectItem>
                <SelectItem value="report">Other Report</SelectItem>
                <SelectItem value="url">URL</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {sourceType !== 'url' ? (
            <div className="space-y-2">
              <Label>Upload File (PDF, CSV, XLSX, XLS, HTML)</Label>
              <div className="flex items-center gap-4">
                <Input
                  type="file"
                  accept=".pdf,.csv,.xlsx,.xls,.html,.htm"
                  onChange={handleFileUpload}
                  disabled={uploading}
                  multiple
                />
                {uploading && <Loader2 className="w-5 h-5 animate-spin text-blue-600" />}
              </div>
              {failedUpload && (
                <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                  <AlertCircle className="w-4 h-4 text-red-600" />
                  <span className="text-sm text-red-700 flex-1">
                    Failed to upload "{failedUpload.fileName}"
                  </span>
                  <Button 
                    size="sm" 
                    variant="outline" 
                    onClick={handleRetryUpload}
                    disabled={uploading}
                  >
                    Retry
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <Label>URL</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="https://..."
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                />
                <Button onClick={handleUrlSubmit} disabled={!url || uploadSourceMutation.isPending}>
                  Add
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Sources List */}
      <Card>
        <CardHeader>
          <CardTitle>Uploaded Sources ({sources.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {sources.length === 0 ? (
            <div className="text-center py-8 text-slate-500">
              <Upload className="w-12 h-12 mx-auto mb-3 text-slate-300" />
              <p>No sources uploaded yet</p>
              <p className="text-sm mt-1">Upload Mintel reports, GNPD exports, or add URLs to get started</p>
            </div>
          ) : (
            <div className="space-y-3">
              {sources.map(source => (
                <Card key={source.id} className="border-slate-200">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-3 flex-1">
                        <FileText className="w-5 h-5 text-slate-400 mt-0.5" />
                        <div className="flex-1">
                          <h4 className="font-medium text-slate-900">{source.title}</h4>
                          <div className="flex items-center gap-3 mt-1 text-sm text-slate-600">
                            <span className="capitalize">{source.source_type}</span>
                            {source.date && <span>•</span>}
                            {source.date && <span>{new Date(source.date).toLocaleDateString()}</span>}
                          </div>
                          
                          {/* Data Summary */}
                          <div className="mt-2 space-y-1">
                            {source.excerpts && source.excerpts.length > 0 && (
                              <p className="text-xs text-slate-600">
                                📄 {source.excerpts.length} text excerpts extracted for trend analysis
                              </p>
                            )}
                            {source.gnpd_data && source.gnpd_data.length > 0 && (
                              <p className="text-xs text-slate-600">
                                🛒 {source.gnpd_data.length} GNPD product launches
                                {source.gnpd_data.filter(p => p.has_image).length > 0 && (
                                  <span className="ml-1">
                                    ({source.gnpd_data.filter(p => p.has_image).length} with images 📷)
                                  </span>
                                )}
                              </p>
                            )}
                            
                            {/* Explanation of what this source provides */}
                            <p className="text-xs text-slate-500 italic mt-2 pt-2 border-t border-slate-100">
                              {source.source_type === 'mintel' && 
                                'Provides market insights, consumer trends, and strategic framing for trend narratives'}
                              {source.source_type === 'gnpd' && 
                                'Provides real product examples and launch data to validate trends with market evidence'}
                              {source.source_type === 'report' && 
                                'Provides additional market context and supporting evidence from industry reports'}
                              {source.source_type === 'url' && 
                                'Provides web-based insights and supplementary information'}
                            </p>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {source.freshness && freshnessIcons[source.freshness]}
                        {source.file_url && (
                          <a href={source.file_url} target="_blank" rel="noopener noreferrer">
                            <Button variant="ghost" size="icon">
                              <ExternalLink className="w-4 h-4" />
                            </Button>
                          </a>
                        )}
                        <Button 
                          variant="ghost" 
                          size="icon"
                          onClick={() => {
                            if (confirm('Remove this source? This cannot be undone.')) {
                              deleteSourceMutation.mutate(source.id);
                            }
                          }}
                        >
                          <Trash2 className="w-4 h-4 text-red-500" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Enhanced Data Coverage Panel */}
      {sources.length > 0 && (
        <Card className={project.data_sufficiency_score < 60 ? 'border-yellow-300 bg-yellow-50' : 'border-green-300 bg-green-50'}>
          <CardHeader>
            <CardTitle className={project.data_sufficiency_score < 60 ? 'text-yellow-900' : 'text-green-900'}>
              Data Coverage Check
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span>Coverage Score:</span>
                <div className="flex items-center gap-2">
                  <div className="w-32 h-2 bg-slate-200 rounded-full overflow-hidden">
                    <div 
                      className={`h-full transition-all ${
                        project.data_sufficiency_score >= 60 ? 'bg-green-500' : 'bg-yellow-500'
                      }`}
                      style={{ width: `${project.data_sufficiency_score}%` }}
                    />
                  </div>
                  <span className="font-medium">{project.data_sufficiency_score}%</span>
                </div>
              </div>

              <div className="space-y-2 text-sm pt-2 border-t">
                <div className="flex items-center justify-between">
                  <span>Mintel/Reports:</span>
                  <span className="font-medium">
                    {sources.filter(s => s.source_type === 'mintel' || s.source_type === 'report').length} sources
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span>GNPD Products:</span>
                  <span className="font-medium">
                    {sources.reduce((sum, s) => sum + (s.gnpd_data?.length || 0), 0)} products
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Text Excerpts:</span>
                  <span className="font-medium">
                    {sources.reduce((sum, s) => sum + (s.excerpts?.length || 0), 0)} chunks
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Products with Images:</span>
                  <span className="font-medium">
                    {sources.reduce((sum, s) => sum + (s.gnpd_data?.filter(p => p.has_image).length || 0), 0)} 📷
                  </span>
                </div>
              </div>

              {project.data_sufficiency_score < 60 && (
                <div className="mt-4 p-3 bg-white rounded-lg border border-yellow-200">
                  <p className="text-sm font-medium text-yellow-900 mb-2">⚠️ Recommendations:</p>
                  <ul className="text-sm text-yellow-800 space-y-1">
                    {sources.filter(s => s.source_type === 'mintel').length === 0 && (
                      <li>• Add Mintel reports for stronger trend framing</li>
                    )}
                    {sources.reduce((sum, s) => sum + (s.gnpd_data?.length || 0), 0) < 20 && (
                      <li>• Upload GNPD exports with at least 20 products</li>
                    )}
                    {sources.reduce((sum, s) => sum + (s.gnpd_data?.filter(p => p.has_image).length || 0), 0) < 10 && (
                      <li>• Add GNPD HTML export or upload product images for visual proof</li>
                    )}
                  </ul>
                </div>
              )}

              {project.data_sufficiency_score >= 60 && (
                <div className="mt-3 text-sm text-green-800">
                  ✓ Sufficient data for trend generation
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}