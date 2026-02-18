import React from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from './utils';

export default function Layout({ children, currentPageName }) {
  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header with Palsgaard Logo */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-50">
        <div className="px-6 py-4">
          <Link to={createPageUrl('Home')} className="inline-block">
            <img 
              src="https://www.palsgaard.com/media/g3rnmlmk/palsgaard-logo.svg" 
              alt="Palsgaard" 
              className="h-8"
            />
          </Link>
        </div>
      </header>

      {/* Page Content */}
      <main>
        {children}
      </main>
    </div>
  );
}