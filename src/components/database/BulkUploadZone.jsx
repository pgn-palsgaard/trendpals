import React, { useState, useCallback, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Upload, X, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import DuplicateDetectedModal from './DuplicateDetectedModal';
import { intakeFile, DuplicateSourceError } from '../intake/sourceIntake';

export default function BulkUploadZone({ onUploadComplete, projectId, onLinkSource }) {
  const queryClient = useQueryClient();
  const [isDragging, setIsDragging] = useState(false);
  const [uploadQueue, setUploadQueue] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [currentDuplicate, setCurrentDuplicate] = useState(null);

  // Poll for status updates on uploaded sources
  useEffect(() => {
    const uploadedItems = uploadQueue.filter(i => 
      i.status === 'uploading' || i.sourceId && !['success', 'failed', 'duplicate'].includes(i.status)
    );

    if (uploadedItems.length === 0) return;

    const interval = setInterval(async () => {
      for (const item of uploadedItems) {
        if (!item.sourceId) continue;
        
        try {
          const source = await base44.entities.Source.get(item.sourceId);
          const newStatus = source.status === 'ready' ? 'success' : 
                           source.status === 'failed' ? 'error' : 
                           'uploading';
          
          setUploadQueue(prev => prev.map(i => 
            i.id === item.id ? { ...i, status: newStatus, error: source.status_message } : i
          ));
        } catch (err) {
          console.error('Failed to fetch source status:', err);
        }
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [uploadQueue]);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setIsDragging(false);
    
    const files = Array.from(e.dataTransfer.files).filter(file => {
      const ext = file.name.split('.').pop().toLowerCase();
      return ['pdf', 'csv', 'xlsx', 'xls', 'html', 'htm'].includes(ext);
    });

    if (files.length > 0) {
      addFilesToQueue(files);
    } else {
      toast.error('Please drop valid files (PDF, CSV, Excel, HTML)');
    }
  }, []);

  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      addFilesToQueue(files);
    }
  };

  const addFilesToQueue = (files) => {
    const newItems = files.map((file, idx) => ({
      id: `${Date.now()}-${idx}`,
      file,
      name: file.name,
      size: file.size,
      status: 'pending', // pending, uploading, success, error
      progress: 0,
      error: null,
      sourceId: null,
    }));

    setUploadQueue(prev => [...prev, ...newItems]);
  };



  const removeFromQueue = (id) => {
    setUploadQueue(prev => prev.filter(item => item.id !== id));
  };

  const uploadAll = async () => {
    setUploading(true);
    const pendingItems = uploadQueue.filter(item => item.status === 'pending' || item.status === 'error');

    for (const item of pendingItems) {
      try {
        // Update status to uploading
        setUploadQueue(prev => prev.map(i => 
          i.id === item.id ? { ...i, status: 'uploading', progress: 0 } : i
        ));

        // Use canonical intake: dedup check + auto-classification (source_type set by LLM)
        const result = await intakeFile({ file: item.file, title: item.name });

        setUploadQueue(prev => prev.map(i => 
          i.id === item.id ? { ...i, status: 'success', progress: 100, sourceId: result.sourceId } : i
        ));
      } catch (error) {
        if (error instanceof DuplicateSourceError) {
          const duplicate = error.duplicates?.[0];
          setUploadQueue(prev => prev.map(i => 
            i.id === item.id ? { 
              ...i, 
              status: 'duplicate', 
              progress: 0, 
              duplicate,
              error: error.message,
            } : i
          ));
        } else {
          setUploadQueue(prev => prev.map(i => 
            i.id === item.id ? { ...i, status: 'error', error: error.message || 'Upload failed' } : i
          ));
        }
      }
    }

    setUploading(false);
    queryClient.invalidateQueries({ queryKey: ['sourcesDatabase'] });
    
    const successCount = uploadQueue.filter(i => i.status === 'success').length;
    const failCount = uploadQueue.filter(i => i.status === 'error').length;
    const duplicateCount = uploadQueue.filter(i => i.status === 'duplicate').length;
    
    if (successCount > 0) {
      toast.success(`${successCount} source${successCount > 1 ? 's' : ''} uploaded ✓`);
      if (onUploadComplete) {
        onUploadComplete(uploadQueue.filter(i => i.status === 'success').map(i => i.sourceId));
      }
    }
    if (failCount > 0) {
      toast.error(`${failCount} upload${failCount > 1 ? 's' : ''} failed`);
    }
    if (duplicateCount > 0) {
      toast.warning(`${duplicateCount} duplicate${duplicateCount > 1 ? 's' : ''} detected and skipped`);
    }
  };

  const clearCompleted = () => {
    setUploadQueue(prev => prev.filter(item => item.status !== 'success'));
  };

  const hasItems = uploadQueue.length > 0;
  const hasPending = uploadQueue.some(item => item.status === 'pending' || item.status === 'error');
  const successCount = uploadQueue.filter(i => i.status === 'success').length;
  const needsMetadata = uploadQueue.filter(i => i.status === 'success').length;

  return (
    <div className="space-y-4">
      {/* Drop Zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-lg p-8 transition-all ${
          isDragging 
            ? 'border-blue-500 bg-blue-50' 
            : 'border-slate-300 bg-slate-50 hover:border-blue-400 hover:bg-blue-50/50'
        }`}
      >
        <div className="text-center">
          <Upload className={`w-12 h-12 mx-auto mb-4 ${isDragging ? 'text-blue-600' : 'text-slate-400'}`} />
          <p className="text-lg font-medium text-slate-900 mb-2">
            {isDragging ? 'Drop files here' : 'Drag & drop files here'}
          </p>
          <p className="text-sm text-slate-600 mb-4">
            or click to browse (PDF, CSV, Excel, HTML)
          </p>
          <input
            type="file"
            multiple
            accept=".pdf,.csv,.xlsx,.xls,.html,.htm"
            onChange={handleFileSelect}
            className="hidden"
            id="bulk-file-input"
          />
          <label htmlFor="bulk-file-input">
            <Button type="button" variant="outline" className="cursor-pointer" asChild>
              <span>Browse files</span>
            </Button>
          </label>
        </div>
      </div>

      {/* Upload Queue */}
      {hasItems && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-slate-900">Upload Queue ({uploadQueue.length})</h3>
              <div className="flex items-center gap-2">
                {successCount > 0 && (
                  <Button variant="ghost" size="sm" onClick={clearCompleted}>
                    Clear completed
                  </Button>
                )}
                {hasPending && (
                  <Button size="sm" onClick={uploadAll} disabled={uploading}>
                    {uploading ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Uploading...
                      </>
                    ) : (
                      'Upload all'
                    )}
                  </Button>
                )}
              </div>
            </div>

            <div className="space-y-2 max-h-64 overflow-y-auto">
              {uploadQueue.map(item => (
                <div key={item.id} className="flex items-center gap-3 p-3 border border-slate-200 rounded-lg">
                  <div className="flex-shrink-0">
                    {item.status === 'pending' && <div className="w-5 h-5 rounded-full border-2 border-slate-300" />}
                    {item.status === 'uploading' && <Loader2 className="w-5 h-5 animate-spin text-blue-600" />}
                    {item.status === 'success' && <CheckCircle className="w-5 h-5 text-green-600" />}
                    {item.status === 'duplicate' && <AlertCircle className="w-5 h-5 text-orange-600" />}
                    {item.status === 'error' && <AlertCircle className="w-5 h-5 text-red-600" />}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-sm font-medium text-slate-900 truncate">{item.name}</p>
                      <span className="text-xs text-slate-500 ml-2 flex-shrink-0">
                        {(item.size / 1024 / 1024).toFixed(1)} MB
                      </span>
                    </div>
                    
                    {item.status === 'uploading' && (
                      <Progress value={item.progress} className="h-1" />
                    )}
                    
                    {item.status === 'duplicate' && item.duplicate && (
                      <div className="mt-1 p-2 bg-orange-50 border border-orange-200 rounded text-xs">
                        <p className="font-medium text-orange-900 mb-1">⚠️ Duplicate detected</p>
                        <p className="text-orange-700 mb-1">{item.error}</p>
                        <p className="text-orange-800">
                          Exists: <span className="font-medium">{item.duplicate.title}</span>
                          {item.duplicate.date && ` (${new Date(item.duplicate.date).toLocaleDateString()})`}
                        </p>
                      </div>
                    )}
                    
                    {item.status === 'error' && (
                      <p className="text-xs text-red-600">{item.error}</p>
                    )}
                    
                    {item.status === 'success' && (
                      <p className="text-xs text-green-600">Uploaded • Needs metadata</p>
                    )}
                    
                    {item.status === 'pending' && (
                      <p className="text-xs text-slate-500">Classification pending</p>
                    )}
                  </div>

                  {item.status === 'pending' && !uploading && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeFromQueue(item.id)}
                      className="flex-shrink-0"
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>

            {needsMetadata > 0 && (
              <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <p className="text-sm font-medium text-amber-900 mb-2">
                  {needsMetadata} source{needsMetadata > 1 ? 's' : ''} need{needsMetadata === 1 ? 's' : ''} metadata
                </p>
                <p className="text-xs text-amber-700 mb-3">
                  Add region, category, and publication date to make these sources discoverable
                </p>
                <Button 
                  size="sm" 
                  variant="outline"
                  onClick={() => {
                    if (onUploadComplete) {
                      const ids = uploadQueue.filter(i => i.status === 'success').map(i => i.sourceId);
                      onUploadComplete(ids);
                    }
                  }}
                  className="border-amber-300 text-amber-900 hover:bg-amber-100"
                >
                  Fix in bulk →
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}