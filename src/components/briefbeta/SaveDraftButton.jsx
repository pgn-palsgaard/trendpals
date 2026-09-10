import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Save, Check } from 'lucide-react';

// Explicit draft save for the Architect flow. The session is auto-saved as the
// chat runs; this makes it visible and confirms where to pick the work up again.
export default function SaveDraftButton({ onSave, disabled }) {
  const [state, setState] = useState('idle'); // idle | saving | saved
  const [error, setError] = useState(null);

  async function handleClick() {
    setState('saving');
    setError(null);
    try {
      await onSave();
      setState('saved');
    } catch (e) {
      setError(e.message || 'The draft could not be saved. Please try again.');
      setState('idle');
    }
  }

  if (state === 'saved') {
    return (
      <div className="text-right">
        <p className="inline-flex items-center gap-1.5 text-sm font-medium" style={{ color: '#6F8263' }}>
          <Check className="w-4 h-4" />
          Draft saved
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">
          Continue here, or find it again under{' '}
          <Link to="/ArchitectHistory" className="underline">Saved work</Link>.
        </p>
      </div>
    );
  }

  return (
    <div><button
      onClick={handleClick}
      disabled={disabled || state === 'saving'}
      title={disabled ? 'Write your first message before saving' : 'Save this workspace and return later'}
      className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold transition-colors disabled:opacity-50"
      style={{ borderColor: '#1D428A', color: '#1D428A' }}
    >
      <Save className="w-4 h-4" />
      {state === 'saving' ? 'Saving…' : 'Save draft'}
    </button>{error && <p role="alert" className="text-xs text-destructive mt-2">{error}</p>}</div>
  );
}