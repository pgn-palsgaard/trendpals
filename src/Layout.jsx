import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from './utils';
import { base44 } from '@/api/base44Client';
import { LogOut } from 'lucide-react';

export default function Layout({ children, currentPageName }) {
  const [newBriefCount, setNewBriefCount] = useState(0);

  useEffect(() => {
    base44.entities.ReportRequest.filter({ status: 'new' }).then(results => {
      setNewBriefCount(results.length);
    }).catch(() => {});
  }, []);

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header with Palsgaard Logo */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-50">
        <div className="px-6 py-4 flex items-center justify-between">
          <Link to={createPageUrl('Home')} className="inline-block">
            <img 
              src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/6987a5428ef229e6ee55cbb6/16cea8b8e_Palsgaardlogo_blue_250x250.png" 
              alt="Palsgaard" 
              className="h-10"
            />
          </Link>
          <nav className="flex items-center gap-6">
            <Link 
              to={createPageUrl('Projects')} 
              className={`text-sm font-medium transition-colors ${
                currentPageName === 'Projects' || currentPageName === 'ProjectDetail' || currentPageName === 'NewProject'
                  ? 'text-blue-600' 
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Projects
            </Link>
            <Link 
              to={createPageUrl('KnowledgeSources')} 
              className={`text-sm font-medium transition-colors ${
                currentPageName === 'KnowledgeSources'
                  ? 'text-blue-600' 
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Knowledge Sources
            </Link>
            <Link 
              to={createPageUrl('SourcesDatabase')} 
              className={`text-sm font-medium transition-colors ${
                currentPageName === 'SourcesDatabase'
                  ? 'text-blue-600' 
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Market Intelligence
            </Link>
            <Link 
              to="/GNPD" 
              className={`text-sm font-medium transition-colors ${
                currentPageName === 'GNPD'
                  ? 'text-blue-600' 
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              GNPD
            </Link>
            <Link 
              to={createPageUrl('ReportsLibrary')} 
              className={`text-sm font-medium transition-colors ${
                currentPageName === 'ReportsLibrary'
                  ? 'text-blue-600' 
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Reports
            </Link>
            <Link 
              to="/Briefs" 
              className={`text-sm font-medium transition-colors relative inline-flex items-center gap-1.5 ${
                currentPageName === 'Briefs'
                  ? 'text-blue-600' 
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Briefs
              {newBriefCount > 0 && (
                <span style={{ background: '#C15338', color: 'white', borderRadius: '50%', width: 17, height: 17, fontSize: 10, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {newBriefCount > 9 ? '9+' : newBriefCount}
                </span>
              )}
            </Link>
            <Link 
              to="/TrendLibrary" 
              className={`text-sm font-medium transition-colors ${
                currentPageName === 'TrendLibrary'
                  ? 'text-blue-600' 
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Trend Library
            </Link>
            <Link 
              to="/AgentActivity" 
              className={`text-sm font-medium transition-colors ${
                currentPageName === 'AgentActivity'
                  ? 'text-blue-600' 
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Agent Activity
            </Link>
            <Link 
              to="/ChallengeLibrary" 
              className={`text-sm font-medium transition-colors ${
                currentPageName === 'ChallengeLibrary'
                  ? 'text-blue-600' 
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Challenges
            </Link>
            <Link 
              to="/TrendReport" 
              className={`text-sm font-medium transition-colors ${
                currentPageName === 'TrendReport'
                  ? 'text-blue-600' 
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Trend Report
            </Link>
            <Link 
              to="/ThemeLibrary" 
              className={`text-sm font-medium transition-colors ${
                currentPageName === 'ThemeLibrary'
                  ? 'text-blue-600' 
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Themes
            </Link>
            <Link 
              to="/ThemeMatrix" 
              className={`text-sm font-medium transition-colors ${
                currentPageName === 'ThemeMatrix'
                  ? 'text-blue-600' 
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Theme Matrix
            </Link>
            <button
              onClick={() => base44.auth.logout()}
              className="flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors"
            >
              <LogOut className="w-4 h-4" />
              Logout
            </button>
          </nav>
        </div>
      </header>

      {/* Page Content */}
      <main>
        {children}
      </main>
    </div>
  );
}