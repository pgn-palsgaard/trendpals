import React from 'react';
import { FlaskConical } from 'lucide-react';
import ScopeIntro from '@/components/submitbrief/ScopeIntro';
import JtbdPicker from '@/components/submitbrief/JtbdPicker';
import { ARCHITECT_DESCRIPTIONS } from '@/components/briefbeta/architectJtbd';
import DivisionSwitcher from '@/components/layout/DivisionSwitcher';
import PersonalCareScope from '@/components/briefbeta/PersonalCareScope';

// The Architect's start screen — the same job-to-be-done question the brief
// intake opens on, so both routes into a report begin the same way.
export default function ArchitectStart({ onSelect, personalCare = false }) {
  return (
    <div className="page-shell">
      <div className="page-inner">
        <div className="page-header">
          <div className="flex items-center gap-2">
            <h1 className="page-title">Report Architect</h1>
            <span className="badge-pending"><FlaskConical className="w-3 h-3 mr-1" />BETA</span>
          </div>
          <p className="page-subtitle">
            {personalCare ? 'Build a Personal Care trend overview directly from your approved research reports.' : 'Chat your way to a full trend deck. Isolated test environment — saved reports are prefixed [BETA].'}
          </p>
        </div>

        <div className="mb-5 max-w-xs"><DivisionSwitcher /></div>
        {personalCare ? <PersonalCareScope /> : <ScopeIntro />}

        <JtbdPicker
          onSelect={onSelect}
          heading="What are you building?"
          descriptions={ARCHITECT_DESCRIPTIONS}
        />
      </div>
    </div>
  );
}