import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from './utils';
import { base44 } from '@/api/base44Client';
import {
  LogOut, FolderOpen, FileText, BarChart2, TrendingUp, Zap, BookOpen, CheckSquare,
  Palette, LayoutGrid, Library, Database, Grid, Activity, ChevronLeft, ChevronRight, Menu, X, ClipboardList
} from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';

const SIDEBAR_WIDTH = 220;
const SIDEBAR_COLLAPSED_WIDTH = 56;

const ADMIN_NAV = [
  {
    section: 'WORKSPACE',
    items: [
      { label: 'Projects', to: createPageUrl('Projects'), icon: FolderOpen, pages: ['Projects', 'ProjectDetail', 'NewProject'] },
      { label: 'Briefs', to: '/Briefs', icon: FileText, pages: ['Briefs'], badge: true },
      { label: 'Reports', to: createPageUrl('ReportsLibrary'), icon: BarChart2, pages: ['ReportsLibrary'] },
    ],
  },
  {
    section: 'TRENDS',
    items: [
      { label: 'Trend Library', to: '/TrendLibrary', icon: TrendingUp, pages: ['TrendLibrary'] },
      { label: 'Challenges', to: '/ChallengeLibrary', icon: Zap, pages: ['ChallengeLibrary'] },
      { label: 'Trend Report', to: '/TrendReport', icon: BookOpen, pages: ['TrendReport'] },
      { label: 'Validation', to: '/ValidationTracking', icon: CheckSquare, pages: ['ValidationTracking'] },
    ],
  },
  {
    section: 'THEMES',
    items: [
      { label: 'Themes', to: '/ThemeLibrary', icon: Palette, pages: ['ThemeLibrary'] },
      { label: 'Theme Matrix', to: '/ThemeMatrix', icon: LayoutGrid, pages: ['ThemeMatrix'] },
    ],
  },
  {
    section: 'SOURCES',
    items: [
      { label: 'Knowledge Sources', to: createPageUrl('KnowledgeSources'), icon: Library, pages: ['KnowledgeSources'] },
      { label: 'Market Intelligence', to: createPageUrl('SourcesDatabase'), icon: Database, pages: ['SourcesDatabase'] },
      { label: 'GNPD', to: '/GNPD', icon: Grid, pages: ['GNPD'] },
    ],
  },
  {
    section: 'SYSTEM',
    items: [
      { label: 'Agent Activity', to: '/AgentActivity', icon: Activity, pages: ['AgentActivity'] },
    ],
  },
];

const REVIEWER_NAV = [
  {
    section: 'REVIEW',
    items: [
      { label: 'Review Queue', to: '/SMEReviewQueue', icon: ClipboardList, pages: ['SMEReviewQueue'] },
    ],
  },
];

function SidebarLink({ item, currentPageName, collapsed, badgeCount }) {
  const isActive = item.pages?.some(p => p === currentPageName);
  const Icon = item.icon;

  return (
    <Link
      to={item.to}
      title={collapsed ? item.label : undefined}
      className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all group relative"
      style={{
        color: isActive ? '#fff' : '#1D2B47',
        background: isActive ? '#1D428A' : 'transparent',
        fontWeight: isActive ? 600 : 500,
      }}
      onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'rgba(29,66,138,0.07)'; }}
      onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
    >
      <Icon className="w-4 h-4 shrink-0" style={{ color: isActive ? '#fff' : '#1D428A' }} />
      {!collapsed && (
        <span className="flex-1 truncate">{item.label}</span>
      )}
      {!collapsed && item.badge && badgeCount > 0 && (
        <span style={{ background: '#C15338', color: 'white', borderRadius: '50%', width: 18, height: 18, fontSize: 10, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          {badgeCount > 9 ? '9+' : badgeCount}
        </span>
      )}
      {collapsed && item.badge && badgeCount > 0 && (
        <span className="absolute top-1 right-1 w-2 h-2 rounded-full" style={{ background: '#C15338' }} />
      )}
    </Link>
  );
}

function Sidebar({ collapsed, onToggle, currentPageName, navGroups, newBriefCount, user, isMobile, mobileOpen, onMobileClose }) {
  const sidebarContent = (
    <div
      className="flex flex-col h-full"
      style={{
        width: collapsed && !isMobile ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_WIDTH,
        background: '#F7F4EE',
        borderRight: '1px solid #E8E3D8',
        transition: 'width 0.2s ease',
        overflow: 'hidden',
      }}
    >
      {/* Logo + collapse toggle */}
      <div className="flex items-center justify-between px-3 py-4 shrink-0" style={{ borderBottom: '1px solid #E8E3D8', minHeight: 64 }}>
        {(!collapsed || isMobile) && (
          <Link to={createPageUrl('Home')} className="inline-block">
            <img
              src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/6987a5428ef229e6ee55cbb6/16cea8b8e_Palsgaardlogo_blue_250x250.png"
              alt="Palsgaard"
              className="h-8"
            />
          </Link>
        )}
        {collapsed && !isMobile && (
          <Link to={createPageUrl('Home')} className="mx-auto">
            <img
              src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/6987a5428ef229e6ee55cbb6/16cea8b8e_Palsgaardlogo_blue_250x250.png"
              alt="Palsgaard"
              className="h-6 w-6 object-contain"
            />
          </Link>
        )}
        {!isMobile && (
          <button
            onClick={onToggle}
            className="ml-auto p-1.5 rounded-lg transition-colors"
            style={{ color: '#6B7280' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(29,66,138,0.07)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        )}
        {isMobile && (
          <button onClick={onMobileClose} className="ml-auto p-1.5 rounded-lg" style={{ color: '#6B7280' }}>
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Nav groups */}
      <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-4">
        {navGroups.map(group => (
          <div key={group.section}>
            {!collapsed || isMobile ? (
              <p className="px-3 mb-1 text-xs font-semibold tracking-widest" style={{ color: '#9CA3AF' }}>
                {group.section}
              </p>
            ) : (
              <div className="mx-3 mb-1 border-t" style={{ borderColor: '#E8E3D8' }} />
            )}
            <div className="space-y-0.5">
              {group.items.map(item => (
                <SidebarLink
                  key={item.label}
                  item={item}
                  currentPageName={currentPageName}
                  collapsed={collapsed && !isMobile}
                  badgeCount={item.badge ? newBriefCount : 0}
                />
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* Bottom: user info + logout */}
      <div className="shrink-0 px-2 pb-4 pt-3" style={{ borderTop: '1px solid #E8E3D8' }}>
        {(!collapsed || isMobile) && user && (
          <div className="px-3 pb-3">
            <p className="text-xs font-semibold truncate" style={{ color: '#1D2B47' }}>{user.full_name}</p>
            <p className="text-xs truncate" style={{ color: '#9CA3AF' }}>{user.email}</p>
          </div>
        )}
        <button
          onClick={() => base44.auth.logout()}
          className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm font-medium transition-all"
          style={{ color: '#6B7280' }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(29,66,138,0.07)'; e.currentTarget.style.color = '#1D2B47'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#6B7280'; }}
          title={collapsed && !isMobile ? 'Logout' : undefined}
        >
          <LogOut className="w-4 h-4 shrink-0" />
          {(!collapsed || isMobile) && <span>Logout</span>}
        </button>
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <>
        {mobileOpen && (
          <div className="fixed inset-0 z-40" style={{ background: 'rgba(0,0,0,0.3)' }} onClick={onMobileClose} />
        )}
        <div
          className="fixed inset-y-0 left-0 z-50 flex flex-col"
          style={{
            transform: mobileOpen ? 'translateX(0)' : 'translateX(-100%)',
            transition: 'transform 0.25s ease',
            width: SIDEBAR_WIDTH,
          }}
        >
          {sidebarContent}
        </div>
      </>
    );
  }

  return (
    <div className="shrink-0 h-screen sticky top-0" style={{ width: collapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_WIDTH, transition: 'width 0.2s ease' }}>
      <div className="h-full overflow-hidden" style={{ width: collapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_WIDTH, transition: 'width 0.2s ease' }}>
        {sidebarContent}
      </div>
    </div>
  );
}

export default function Layout({ children, currentPageName }) {
  const { user } = useAuth();
  const [newBriefCount, setNewBriefCount] = useState(0);
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem('sidebar_collapsed') === 'true'; } catch { return false; }
  });
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  const isReviewer = user?.role === 'reviewer';

  useEffect(() => {
    if (isReviewer) return;
    base44.entities.ReportRequest.filter({ status: 'new' }).then(r => setNewBriefCount(r.length)).catch(() => {});
  }, [isReviewer]);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  const handleToggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    try { localStorage.setItem('sidebar_collapsed', String(next)); } catch {}
  };

  const navGroups = isReviewer ? REVIEWER_NAV : ADMIN_NAV;

  return (
    <div className="flex min-h-screen bg-slate-50">
      {/* Mobile hamburger */}
      {isMobile && (
        <button
          onClick={() => setMobileOpen(true)}
          className="fixed top-3 left-3 z-30 p-2 rounded-lg bg-white border border-slate-200 shadow-sm"
          style={{ color: '#1D2B47' }}
        >
          <Menu className="w-5 h-5" />
        </button>
      )}

      <Sidebar
        collapsed={collapsed}
        onToggle={handleToggle}
        currentPageName={currentPageName}
        navGroups={navGroups}
        newBriefCount={newBriefCount}
        user={user}
        isMobile={isMobile}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
      />

      {/* Main content */}
      <main className="flex-1 min-w-0" style={{ paddingTop: isMobile ? 48 : 0 }}>
        {children}
      </main>
    </div>
  );
}