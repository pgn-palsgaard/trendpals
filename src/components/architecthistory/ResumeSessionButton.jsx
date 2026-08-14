import React from 'react';
import { Link } from 'react-router-dom';
import { MessageSquare } from 'lucide-react';

export default function ResumeSessionButton({ sessionId }) {
  if (!sessionId) return null;
  return (
    <Link
      to={`/SubmitBriefBeta?session=${sessionId}`}
      className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold shrink-0 border"
      style={{ borderColor: '#1D428A', color: '#1D428A' }}
    >
      <MessageSquare className="w-4 h-4" />
      Continue this chat
    </Link>
  );
}