import React from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from './utils';

export default function Layout({ children, currentPageName }) {
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
              to={createPageUrl('SourcesDatabase')} 
              className={`text-sm font-medium transition-colors ${
                currentPageName === 'SourcesDatabase'
                  ? 'text-blue-600' 
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Evidence Sources
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
              to={createPageUrl('ReportsLibrary')} 
              className={`text-sm font-medium transition-colors ${
                currentPageName === 'ReportsLibrary'
                  ? 'text-blue-600' 
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Reports
            </Link>
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