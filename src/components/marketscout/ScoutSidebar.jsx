import React from 'react';
import { Plus, MessageSquare } from 'lucide-react';

export default function ScoutSidebar({ conversations, activeId, onSelect, onNew }) {
  return (
    <div className="pal-card flex h-full flex-col overflow-hidden">
      <div className="border-b border-border p-3">
        <button
          onClick={onNew}
          className="flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90"
          style={{ background: '#1D428A' }}
        >
          <Plus className="w-4 h-4" />New sweep
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {conversations.length === 0 && (
          <p className="px-2 py-4 text-xs text-muted-foreground">No sweeps yet.</p>
        )}
        {conversations.map(c => {
          const active = c.id === activeId;
          return (
            <button
              key={c.id}
              onClick={() => onSelect(c.id)}
              className="mb-1 flex w-full items-start gap-2 rounded-lg px-2.5 py-2 text-left transition-colors"
              style={{
                background: active ? 'rgba(29,66,138,0.08)' : 'transparent',
                color: active ? '#1D428A' : '#1D2B47',
              }}
            >
              <MessageSquare className="mt-0.5 w-3.5 h-3.5 shrink-0" />
              <span className="line-clamp-2 text-xs font-medium leading-snug">
                {c.metadata?.name || 'Untitled sweep'}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}