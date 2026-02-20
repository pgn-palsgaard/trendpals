import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { 
  Loader2, CheckCircle, AlertCircle, Clock, FileUp, 
  Cog, RefreshCw, X, ExternalLink 
} from 'lucide-react';
import { cn } from '@/lib/utils';

const STATUS_CONFIG = {
  queued: {
    icon: Clock,
    label: 'Queued',
    color: 'text-slate-500',
    bg: 'bg-slate-100',
    description: 'Waiting to upload'
  },
  uploading: {
    icon: FileUp,
    label: 'Uploading',
    color: 'text-blue-600',
    bg: 'bg-blue-100',
    description: 'Uploading file...',
    spin: true
  },
  uploaded: {
    icon: CheckCircle,
    label: 'Uploaded',
    color: 'text-green-600',
    bg: 'bg-green-100',
    description: 'File uploaded successfully'
  },
  processing: {
    icon: Cog,
    label: 'Processing',
    color: 'text-blue-600',
    bg: 'bg-blue-100',
    description: 'Extracting metadata...',
    spin: true
  },
  gnpd_processing: {
    icon: Cog,
    label: 'Processing GNPD',
    color: 'text-blue-600',
    bg: 'bg-blue-100',
    description: 'Parsing GNPD data...',
    spin: true
  },
  gnpd_ready: {
    icon: CheckCircle,
    label: 'GNPD Ready',
    color: 'text-green-600',
    bg: 'bg-green-100',
    description: 'GNPD data parsed successfully'
  },
  ready: {
    icon: CheckCircle,
    label: 'Ready',
    color: 'text-green-600',
    bg: 'bg-green-100',
    description: 'Source ready to use'
  },
  failed: {
    icon: AlertCircle,
    label: 'Failed',
    color: 'text-red-600',
    bg: 'bg-red-100',
    description: 'An error occurred'
  }
};

export default function UploadStatusCard({ 
  sourceId, 
  initialStatus = 'queued',
  onRemove,
  onViewSource
}) {
  const [source, setSource] = useState(null);
  const [status, setStatus] = useState(initialStatus);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState(null);
  const [stuckWarning, setStuckWarning] = useState(false);
  const [pollInterval, setPollInterval] = useState(null);

  // Fetch source data periodically if not in terminal state
  useEffect(() => {
    if (!sourceId) return;

    const fetchSource = async () => {
      try {
        const fetchedSource = await base44.entities.Source.get(sourceId);
        setSource(fetchedSource);
        
        // Check GNPD-specific status first
        if (fetchedSource.source_type === 'gnpd' && fetchedSource.gnpd_processing_status) {
          if (fetchedSource.gnpd_processing_status === 'processing') {
            setStatus('gnpd_processing');
          } else if (fetchedSource.gnpd_processing_status === 'ready') {
            setStatus('gnpd_ready');
          } else if (fetchedSource.gnpd_processing_status === 'failed') {
            setStatus('failed');
            setError(fetchedSource.gnpd_processing_error || 'GNPD processing failed');
          } else {
            setStatus(fetchedSource.status || 'queued');
          }
        } else {
          setStatus(fetchedSource.status || 'queued');
        }
        setProgress(fetchedSource.upload_progress || 0);
        setError(fetchedSource.status_message);

        // Stop polling if terminal state reached
        if (['ready', 'failed'].includes(fetchedSource.status)) {
          if (pollInterval) {
            clearInterval(pollInterval);
            setPollInterval(null);
          }
        }
      } catch (err) {
        console.error('Failed to fetch source:', err);
      }
    };

    fetchSource();

    // Poll every 2 seconds if not in terminal state
    if (!['ready', 'failed'].includes(status)) {
      const interval = setInterval(fetchSource, 2000);
      setPollInterval(interval);
      
      return () => clearInterval(interval);
    }
  }, [sourceId, status]);

  // Check if stuck (processing too long)
  useEffect(() => {
    if (['processing', 'uploading'].includes(status)) {
      const timeout = setTimeout(() => {
        setStuckWarning(true);
      }, 30000); // 30 seconds

      return () => clearTimeout(timeout);
    }
  }, [status]);

  const config = STATUS_CONFIG[status] || STATUS_CONFIG.queued;
  const Icon = config.icon;
  const isTerminal = ['ready', 'failed'].includes(status);
  const isActive = ['uploading', 'processing'].includes(status);

  const handleRetry = async () => {
    if (!sourceId) return;
    
    try {
      // Trigger re-processing
      await base44.functions.invoke('extractSourceMetadata', { source_id: sourceId });
      setStatus('processing');
      setError(null);
      setStuckWarning(false);
    } catch (err) {
      setError(err.message || 'Retry failed');
    }
  };

  return (
    <div className={cn(
      "border rounded-lg p-4 transition-all",
      status === 'failed' ? 'border-red-200 bg-red-50' : 'border-slate-200 bg-white'
    )}>
      <div className="flex items-start gap-3">
        {/* Status Icon */}
        <div className={cn("p-2 rounded-lg", config.bg)}>
          <Icon className={cn("w-5 h-5", config.color, config.spin && "animate-spin")} />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between mb-1">
            <div className="flex-1">
              <p className="font-medium text-slate-900 truncate">
                {source?.title || 'Uploading...'}
              </p>
              <p className="text-xs text-slate-500 mt-0.5">{config.description}</p>
            </div>
            
            <Badge variant="outline" className={config.color}>
              {config.label}
            </Badge>
          </div>

          {/* Progress Bar */}
          {isActive && (
            <Progress value={progress} className="h-1.5 mt-2" />
          )}

          {/* Error Message */}
          {status === 'failed' && error && (
            <div className="mt-2 text-xs text-red-700 bg-red-100 p-2 rounded">
              {error}
            </div>
          )}

          {/* Stuck Warning */}
          {stuckWarning && isActive && (
            <div className="mt-2 flex items-start gap-2 text-xs text-orange-700 bg-orange-50 p-2 rounded">
              <AlertCircle className="w-3 h-3 mt-0.5 flex-shrink-0" />
              <span>
                This upload is taking longer than expected. You can retry processing.
              </span>
            </div>
          )}

          {/* Actions */}
          {isTerminal && (
            <div className="flex gap-2 mt-3">
              {status === 'ready' && source && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onViewSource?.(source)}
                  className="h-7 text-xs gap-1"
                >
                  <ExternalLink className="w-3 h-3" />
                  View Source
                </Button>
              )}
              
              {status === 'failed' && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleRetry}
                  className="h-7 text-xs gap-1"
                >
                  <RefreshCw className="w-3 h-3" />
                  Retry
                </Button>
              )}

              <Button
                size="sm"
                variant="ghost"
                onClick={() => onRemove?.(sourceId)}
                className="h-7 text-xs gap-1"
              >
                <X className="w-3 h-3" />
                Dismiss
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Timestamp */}
      {source && (
        <div className="text-xs text-slate-500 mt-3 pt-3 border-t border-slate-200">
          {status === 'ready' && source.processing_completed_at && (
            <span>Completed {new Date(source.processing_completed_at).toLocaleTimeString()}</span>
          )}
          {status === 'processing' && source.processing_started_at && (
            <span>Started {new Date(source.processing_started_at).toLocaleTimeString()}</span>
          )}
          {!isTerminal && (
            <span>Started {new Date(source.created_date).toLocaleTimeString()}</span>
          )}
        </div>
      )}
    </div>
  );
}