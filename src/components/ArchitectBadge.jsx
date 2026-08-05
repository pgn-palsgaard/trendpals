import React from 'react';
import { Bot } from 'lucide-react';

// Marks a report or project that was built automatically by the Report Architect
// agent, rather than assembled manually in the project workspace.
export default function ArchitectBadge({ className = '' }) {
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-[5px] ${className}`}
      style={{ background: '#EBF0F8', color: '#1D428A' }}
      title="Generated automatically by the Report Architect agent"
    >
      <Bot className="w-3 h-3" />
      Architect
    </span>
  );
}