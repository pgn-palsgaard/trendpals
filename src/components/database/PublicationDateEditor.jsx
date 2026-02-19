import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Calendar, AlertTriangle, RotateCcw, Check, Edit2 } from 'lucide-react';
import { toast } from 'sonner';

export default function PublicationDateEditor({ source, onSave, user }) {
  const [editMode, setEditMode] = useState(false);
  const [newDate, setNewDate] = useState(source.date_published || '');
  const [reason, setReason] = useState('');
  const [showFutureWarning, setShowFutureWarning] = useState(false);

  const extractedDate = source.date_published_source === 'manual_override' 
    ? source.date_published_original_extracted 
    : source.date_published;
  
  const extractionInfo = source.metadata_extraction?.extracted_data?.date_published;
  const hasExtracted = !!extractedDate;
  const isOverridden = source.date_published_source === 'manual_override';

  const handleDateChange = (value) => {
    setNewDate(value);
    
    // Check if future date
    if (value) {
      const selectedDate = new Date(value);
      const now = new Date();
      setShowFutureWarning(selectedDate > now);
    } else {
      setShowFutureWarning(false);
    }
  };

  const handleSave = async () => {
    if (!newDate) {
      toast.error('Please enter a valid date');
      return;
    }

    const updates = {
      date_published: newDate,
      date_published_source: 'manual_override',
      date_published_override_reason: reason || 'Manual correction',
      date_published_last_updated_at: new Date().toISOString(),
      date_published_updated_by: user.email
    };

    // Save original extracted value if this is the first override
    if (!isOverridden && source.date_published) {
      updates.date_published_original_extracted = source.date_published;
    }

    await onSave(updates);
    setEditMode(false);
    toast.success('Publication date updated ✓');
  };

  const handleRevert = async () => {
    if (!hasExtracted) return;
    
    if (!confirm('Revert to extracted date? This will discard your manual override.')) return;

    const updates = {
      date_published: extractedDate,
      date_published_source: 'extracted',
      date_published_override_reason: null,
      date_published_last_updated_at: new Date().toISOString(),
      date_published_updated_by: user.email
    };

    await onSave(updates);
    toast.success('Reverted to extracted date ✓');
  };

  if (editMode) {
    return (
      <div className="space-y-3 p-4 border border-blue-200 rounded-lg bg-blue-50">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-semibold text-blue-900">Edit Publication Date</Label>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setEditMode(false)}
            className="h-6 px-2"
          >
            Cancel
          </Button>
        </div>

        {hasExtracted && (
          <div className="text-xs p-2 bg-white border border-blue-200 rounded">
            <span className="text-slate-600">Extracted: </span>
            <span className="font-medium">{new Date(extractedDate).toLocaleDateString()}</span>
            {extractionInfo?.confidence && (
              <Badge variant="outline" className="ml-2 text-xs">
                {Math.round(extractionInfo.confidence * 100)}% confidence
              </Badge>
            )}
          </div>
        )}

        <div className="space-y-2">
          <Label>New Publication Date *</Label>
          <Input
            type="date"
            value={newDate}
            onChange={(e) => handleDateChange(e.target.value)}
          />
          {showFutureWarning && (
            <div className="flex items-start gap-2 text-xs text-orange-600 bg-orange-50 p-2 rounded">
              <AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0" />
              <span>This date is in the future. Please verify it's correct.</span>
            </div>
          )}
        </div>

        <div className="space-y-2">
          <Label>Reason for override (optional)</Label>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g., Extraction misread format, actual date found on page 3..."
            rows={2}
            maxLength={200}
          />
          <p className="text-xs text-slate-500">{reason.length}/200</p>
        </div>

        <Button onClick={handleSave} size="sm" className="w-full">
          <Check className="w-4 h-4 mr-1" />
          Save Override
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-sm text-slate-600">Publication Date</Label>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setEditMode(true)}
          className="h-6 px-2 gap-1"
        >
          <Edit2 className="w-3 h-3" />
          Edit
        </Button>
      </div>

      <div className="flex items-center gap-2">
        <Calendar className="w-4 h-4 text-slate-400" />
        <span className="font-medium">
          {source.date_published 
            ? new Date(source.date_published).toLocaleDateString() 
            : '-'
          }
        </span>
        
        {isOverridden && (
          <Badge variant="outline" className="text-orange-600 border-orange-300 bg-orange-50">
            Manual override
          </Badge>
        )}
        
        {!isOverridden && hasExtracted && extractionInfo?.confidence && (
          <Badge variant="outline" className="text-green-600 border-green-300">
            {Math.round(extractionInfo.confidence * 100)}% confidence
          </Badge>
        )}
      </div>

      {isOverridden && (
        <div className="text-xs space-y-1 p-2 bg-orange-50 border border-orange-200 rounded">
          {source.date_published_override_reason && (
            <p className="text-orange-800">
              <span className="font-medium">Reason: </span>
              {source.date_published_override_reason}
            </p>
          )}
          {source.date_published_original_extracted && (
            <p className="text-orange-700">
              <span className="font-medium">Original: </span>
              {new Date(source.date_published_original_extracted).toLocaleDateString()}
            </p>
          )}
          {source.date_published_updated_by && (
            <p className="text-orange-700">
              <span className="font-medium">By: </span>
              {source.date_published_updated_by}
              {source.date_published_last_updated_at && (
                <span> on {new Date(source.date_published_last_updated_at).toLocaleDateString()}</span>
              )}
            </p>
          )}
          {hasExtracted && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleRevert}
              className="h-6 px-2 gap-1 text-orange-600 hover:text-orange-700 hover:bg-orange-100"
            >
              <RotateCcw className="w-3 h-3" />
              Revert to extracted
            </Button>
          )}
        </div>
      )}
    </div>
  );
}