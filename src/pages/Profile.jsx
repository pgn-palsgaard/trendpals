import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CheckCircle2, User as UserIcon } from 'lucide-react';

export default function Profile() {
  const { user } = useAuth();
  const [fullName, setFullName] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (user?.full_name) setFullName(user.full_name);
  }, [user]);

  async function handleSave() {
    if (!fullName.trim()) { setError('Your name cannot be empty.'); return; }
    setError('');
    setSaving(true);
    setSaved(false);
    try {
      await base44.auth.updateMe({ full_name: fullName.trim() });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      setError(e.message || 'Could not save — please try again.');
    }
    setSaving(false);
  }

  return (
    <div className="max-w-xl mx-auto px-6 py-10">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: '#EBF0F8' }}>
          <UserIcon className="w-5 h-5" style={{ color: '#1D428A' }} />
        </div>
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Profile</h1>
          <p className="text-sm text-muted-foreground">Manage your account details.</p>
        </div>
      </div>

      <div className="pal-card p-6 space-y-5">
        <div>
          <Label htmlFor="full_name" className="mb-1.5 block">Full name</Label>
          <Input
            id="full_name"
            value={fullName}
            onChange={e => { setFullName(e.target.value); setError(''); }}
            placeholder="Your name"
          />
        </div>

        <div>
          <Label className="mb-1.5 block">Email</Label>
          <Input value={user?.email || ''} disabled className="bg-muted" />
          <p className="text-xs text-muted-foreground mt-1">Email is managed by your login and cannot be changed here.</p>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex items-center gap-3 pt-1">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save changes'}
          </Button>
          {saved && (
            <span className="flex items-center gap-1.5 text-sm" style={{ color: '#4A6040' }}>
              <CheckCircle2 className="w-4 h-4" /> Saved
            </span>
          )}
        </div>
      </div>
    </div>
  );
}