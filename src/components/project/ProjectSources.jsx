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
import SourceLibrary from './SourceLibrary';
import DataReadinessCheck from './DataReadinessCheck';
import LinkedSourcesPanel from './LinkedSourcesPanel';

export default function ProjectSources({ project, sources, imageExtractions = [] }) {
  const queryClient = useQueryClient();
  const [uploading, setUploading] = useState(false);
  const [sourceType, setSourceType] = useState('mintel');
  const [url, setUrl] = useState('');
  const [failedUpload, setFailedUpload] = useState(null);
  const [gnpdHtmlFile, setGnpdHtmlFile] = useState(null);
  const [gnpdXlsxFile, setGnpdXlsxFile] = useState(null);

  const retryExtractionMutation = useMutation({
    mutationFn: async (jobId) => {
      await base44.entities.GNPDImageExtraction.update(jobId, {
        status: 'pending',
        error_message: null,
        extracted_images: []
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['imageExtractions', project.id] });
      toast.success('Retry initiated - Zapier will reprocess this job');
    },
    onError: () => {
      toast.error('Failed to retry extraction');
    }
  });

  const resetExtractionMutation = useMutation({
    mutationFn: async () => {
      const response = await base44.functions.invoke('resetImageExtraction', { project_id: project.id });
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['imageExtractions', project.id] });
      queryClient.invalidateQueries({ queryKey: ['sources', project.id] });
      toast.success(`Image extraction reset: removed ${data.deleted_extractions} jobs, cleared images from ${data.reset_sources} sources`);
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to reset image extraction');
    }
  });

  const uploadSourceMutation = useMutation({
    mutationFn: async (data) => {
      const response = await base44.functions.invoke('processSource', data);
      return response.data;
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['sources', project.id] });
      queryClient.invalidateQueries({ queryKey: ['project', project.id] });
      queryClient.invalidateQueries({ queryKey: ['sourcesLibrary'] });
      
      // If project_id was provided, also link the source to the project
      if (variables.project_id && data.source_id) {
        const updatedIds = [...(project.selected_source_ids || []), data.source_id];
        base44.entities.Project.update(project.id, {
          selected_source_ids: updatedIds
        });
      }
      
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

      // Create extraction job
      const extraction = await base44.entities.GNPDImageExtraction.create({
        project_id: project.id,
        html_file_url: htmlUpload.file_url,
        xlsx_file_url: xlsxUpload.file_url,
        status: 'pending',
        extracted_images: []
      });

      toast.success(`Files uploaded! Use Zapier to process extraction job ID: ${extraction.id}`);
      queryClient.invalidateQueries({ queryKey: ['sources', project.id] });
      queryClient.invalidateQueries({ queryKey: ['project', project.id] });
      setGnpdHtmlFile(null);
      setGnpdXlsxFile(null);
    } catch (error) {
      toast.error(error.message || 'Failed to upload files');
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
      {/* Data Readiness Check */}
      <DataReadinessCheck project={project} sources={sources} />

      {/* Linked Sources Panel */}
      <LinkedSourcesPanel project={project} sources={sources} />

      {/* Source Library - Browse and Select Existing Sources */}
      <SourceLibrary project={project} />

      {/* General Sources Upload */}
      <Card>
        <CardHeader>
          <CardTitle>Upload New Source to Library</CardTitle>
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




    </div>
  );
}