import { useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';

// Transcript caps — keep the stored array well inside entity field size limits.
const MAX_MESSAGES = 60;
const MAX_CONTENT = 8000;

const REGION_CODES = ['ASPAC', 'AMERICAS', 'EMEC', 'IMEA', 'Global'];

function toRegionCode(raw) {
  const upper = String(raw || '').toUpperCase();
  return REGION_CODES.find(r => upper.includes(r)) || 'Global';
}

function trimTranscript(messages) {
  return messages.slice(-MAX_MESSAGES).map(m => ({
    role: m.role === 'user' ? 'user' : 'assistant',
    content: String(m.content || '').slice(0, MAX_CONTENT),
    timestamp: m.timestamp || new Date().toISOString(),
  }));
}

function deriveTitle(contract) {
  const raw = contract?.core_hypothesis || contract?.objective || '';
  return String(raw).slice(0, 120) || 'Untitled architect session';
}

function firstCategory(contract) {
  const c = contract?.categories;
  if (Array.isArray(c)) return c[0] || '';
  return c ? String(c) : '';
}

/**
 * Auto-persists a Report Architect chat session to an ArchitectSession record.
 * Creates the record on the first real user message, then updates it in place
 * whenever the transcript, contract or slides change.
 *
 * Returns a ref holding the session id, plus a helper to mark it converted
 * once the deck has been saved as a Report.
 */
export default function useArchitectSession({ messages, contract, slides, sessionStart, user, initialSessionId }) {
  // When resuming from history, keep writing to the SAME record instead of
  // creating a duplicate session.
  const sessionIdRef = useRef(initialSessionId || null);
  // Serialise writes so a change during an in-flight save is still persisted
  // (and so the create never races into two records).
  const queueRef = useRef(Promise.resolve());

  useEffect(() => {
    // The opener alone is not a session — wait for the user's first message.
    if (!user?.email) return;
    if (!messages.some(m => m.role === 'user')) return;

    const transcript = trimTranscript(messages);
    const payload = {
      owner_email: user.email,
      owner_name: user.full_name || user.email,
      session_started_at: sessionStart,
      last_message_at: transcript[transcript.length - 1]?.timestamp || new Date().toISOString(),
      messages: transcript,
      message_count: transcript.length,
      contract: contract || {},
      slides: Array.isArray(slides) ? slides : [],
      title: deriveTitle(contract),
      category: firstCategory(contract),
      region: toRegionCode(contract?.region),
    };

    queueRef.current = queueRef.current
      .then(() => (sessionIdRef.current
        ? base44.entities.ArchitectSession.update(sessionIdRef.current, payload)
        : base44.entities.ArchitectSession.create({ ...payload, status: 'active' })
            .then(rec => { sessionIdRef.current = rec.id; })))
      .catch(() => {});
  }, [messages, contract, slides, sessionStart, user]);

  function markConverted(reportId, projectId) {
    // Runs behind the same queue so the session record always exists first.
    queueRef.current = queueRef.current
      .then(() => (sessionIdRef.current
        ? base44.entities.ArchitectSession.update(sessionIdRef.current, {
            status: 'converted',
            linked_report_id: reportId,
            linked_project_id: projectId,
          })
        : null))
      .catch(() => {});
    return queueRef.current;
  }

  return { sessionIdRef, markConverted };
}