import React from 'react';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { LogOut } from 'lucide-react';

// Stripped-down layout for SME reviewers — no sidebar, no admin nav.
// Auth is handled upstream in App.jsx (AuthenticatedApp gates rendering
// behind isLoadingAuth / authError → navigateToLogin), so by the time this
// renders the user is authenticated.
export default function ReviewerLayout({ children }) {
  const { user } = useAuth();

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header */}
      <header
        className="shrink-0 flex items-center justify-between"
        style={{ background: '#1D428A', padding: '12px 24px', borderBottom: '1px solid rgba(255,255,255,0.12)' }}
      >
        <span style={{ fontFamily: "'Lora', Georgia, serif", fontWeight: 500, fontSize: 18, color: '#fff', letterSpacing: '0.2px' }}>
          TrendPals
        </span>
        <div className="flex items-center gap-4">
          {user && (
            <div className="text-right leading-tight">
              <p style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>{user.full_name}</p>
              <p style={{ fontSize: 11, color: '#C7D2E8' }}>{user.email}</p>
            </div>
          )}
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

      {/* Content */}
      <main className="flex-1 w-full" style={{ maxWidth: 800, margin: '0 auto', padding: 24 }}>
        {children}
      </main>

      {/* Footer */}
      <footer className="shrink-0 text-center" style={{ padding: '16px 24px' }}>
        <p style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))' }}>
          Palsgaard A/S · Expert Review Portal
        </p>
      </footer>
    </div>
  );
}