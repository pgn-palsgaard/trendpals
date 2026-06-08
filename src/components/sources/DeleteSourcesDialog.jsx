import React, { useState } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

export default function DeleteSourcesDialog({ open, onClose, onConfirm, count, sources = [] }) {
  const [confirmText, setConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);

  const totalExcerptsLost = sources.reduce((sum, s) => sum + (s.rag_excerpt_count || 0), 0);
  const previewSources = sources.slice(0, 10);
  const remaining = sources.length - previewSources.length;

  const handleConfirm = async () => {
    setDeleting(true);
    await onConfirm();
    setDeleting(false);
    setConfirmText('');
  };

  const handleClose = () => {
    if (deleting) return;
    setConfirmText('');
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-600">
            <AlertTriangle className="w-5 h-5" />
            Permanently delete {count} source{count !== 1 ? 's' : ''}?
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            This action <strong>cannot be undone</strong>. The selected sources will be permanently removed from the database.
          </p>

          {/* Preview */}
          <div className="max-h-40 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100">
            {previewSources.map(s => (
              <div key={s.id} className="px-3 py-2 flex items-center justify-between gap-2">
                <span className="text-sm text-slate-800 truncate">{s.title || 'Untitled'}</span>
                {s.rag_excerpt_count > 0 && (
                  <span className="text-xs text-slate-500 shrink-0">{s.rag_excerpt_count} excerpts</span>
                )}
              </div>
            ))}
            {remaining > 0 && (
              <div className="px-3 py-2 text-xs text-slate-500 italic">
                ... and {remaining} more
              </div>
            )}
          </div>

          {/* Excerpts warning */}
          {totalExcerptsLost > 0 && (
            <div className="flex gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                <strong>{totalExcerptsLost} extracted excerpt{totalExcerptsLost !== 1 ? 's' : ''}</strong> will also be lost. These are used to link sources to global trends.
              </span>
            </div>
          )}

          {/* Confirm input */}
          <div className="space-y-1.5">
            <p className="text-sm text-slate-600">
              Type <strong className="font-mono">DELETE</strong> to confirm:
            </p>
            <Input
              value={confirmText}
              onChange={e => setConfirmText(e.target.value)}
              placeholder="DELETE"
              disabled={deleting}
              className="font-mono"
            />
          </div>

          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={handleClose} disabled={deleting}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirm}
              disabled={confirmText !== 'DELETE' || deleting}
            >
              {deleting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                  Deleting...
                </>
              ) : (
                'Delete'
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}