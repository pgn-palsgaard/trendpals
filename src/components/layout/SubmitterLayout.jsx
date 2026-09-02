import React from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { LogOut, User as UserIcon } from 'lucide-react';

// Lightweight layout for the 'submitter' role — header with Submit Brief
// + Profile links only, no admin sidebar. Auth is handled upstream in App.jsx.
export default function SubmitterLayout({ children }) {
  const { user } = useAuth();

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header
        className="shrink-0 flex items-center justify-between"
        style={{ background: '#1D428A', padding: '12px 24px', borderBottom: '1px solid rgba(255,255,255,0.12)' }}
      >
        <span style={{ fontFamily: "'Lora', Georgia, serif", fontWeight: 500, fontSize: 18, color: '#fff', letterSpacing: '0.2px' }}>
          TrendPals
        </span>
        <div className="flex items-center gap-2">
          <Link
            to="/SubmitBriefBeta"
            className="rounded-lg transition-colors"
            style={{ fontSize: 13, fontWeight: 500, color: '#C7D2E8', padding: '6px 10px' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; e.currentTarget.style.color = '#fff'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#C7D2E8'; }}
          >
            Report Architect
          </Link>
          <Link
            to="/Profile"
            className="flex items-center gap-1.5 rounded-lg transition-colors"
            style={{ fontSize: 13, fontWeight: 500, color: '#C7D2E8', padding: '6px 10px' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; e.currentTarget.style.color = '#fff'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#C7D2E8'; }}
          >
            <UserIcon className="w-4 h-4" />
            {user?.full_name || 'Profile'}
          </Link>
          <button
            onClick={() => base44.auth.logout()}
            className="flex items-center gap-1.5 rounded-lg transition-colors"
            style={{ fontSize: 13, fontWeight: 500, color: '#C7D2E8', padding: '6px 10px' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; e.currentTarget.style.color = '#fff'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#C7D2E8'; }}
          >
            <LogOut className="w-4 h-4" />
            Sign out
          </button>
        </div>
      </header>

      <main className="flex-1 w-full">
        {children}
      </main>

      <footer className="shrink-0 text-center" style={{ padding: '16px 24px' }}>
        <p style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))' }}>
          Palsgaard A/S · Market Intelligence
        </p>
      </footer>
    </div>
  );
}