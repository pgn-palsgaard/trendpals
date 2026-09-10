import { base44 } from '@/api/base44Client';
import { deckSignature } from '@/components/briefbeta/reportPresentation';

// Older Report schemas omitted these fields even though the matching session
// preserved them. Restore only missing presentation fields on exact slide matches;
// never rewrite narrative, identifiers, citations, order, or evidence bindings.
const FIELDS = ['category', 'bullets_header', 'bullets', 'agenda_items', 'columns', 'rows', 'so_what', 'items', 'hypothesis_tieback', 'prepared_for', 'commercial_questions', 'trends_under_microscope'];
const empty = value => value == null || value === '' || (Array.isArray(value) && !value.length);
export default async function loadWorkspaceReport(session) {
  if (!session?.linked_report_id) return null;
  const report = await base44.entities.Report.get(session.linked_report_id);
  if (!report || session.deck_state || !session.slides?.length) return report;
  let changed = false;
  const slides = (report.slides || []).map(slide => {
    const matches = session.slides.filter(s => ['title', 'slide_type', 'preheader', 'trend_id'].every(k => (s[k] || '') === (slide[k] || '')) && (s.evidence_class || 'regional') === (slide.evidence_class || 'regional') && deckSignature(s.gnpd_examples) === deckSignature(slide.gnpd_examples));
    if (matches.length !== 1) return slide;
    const restored = { ...slide };
    for (const key of FIELDS) if (empty(slide[key]) && !empty(matches[0][key])) { restored[key] = matches[0][key]; changed = true; }
    return restored;
  });
  if (!changed) return report;
  await base44.entities.Report.update(report.id, { slides });
  return { ...report, slides };
}