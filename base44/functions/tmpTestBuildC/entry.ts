// TEMPORARY — Build C contractual test T5. Exercises the REAL shared pre-flight.
// Delete after the run.
import { runExportPreflight } from '../../shared/exportPreflight.ts';

export default async function (req) {
  const gate = { country_allow_list: ['Germany', 'France', 'Italy'] };

  // (a) read-across deck: out-of-region countries sit on read_across datapoints, so
  // they never entered evidence_gate_rendered_by_country and are recorded in the gate.
  const readAcrossDeck = {
    region: 'EMEC',
    excluded_countries: [],
    evidence_gate: { ...gate, read_across: { rendered_by_country: { Japan: 2, USA: 1 } } },
    evidence_gate_rendered_by_country: { Germany: 2 },
  };

  // (b) same brief, but a REGIONAL example rendered from Japan — the containment bug.
  const smuggledRegional = {
    region: 'EMEC',
    excluded_countries: [],
    evidence_gate: { ...gate, read_across: { rendered_by_country: { USA: 1 } } },
    evidence_gate_rendered_by_country: { Germany: 2, Japan: 1 },
  };

  // (c) a report with no read-across at all — behaviour must be unchanged.
  const legacyClean = {
    region: 'EMEC',
    excluded_countries: [],
    evidence_gate: gate,
    evidence_gate_rendered_by_country: { Germany: 3, France: 1 },
  };
  const legacyLeak = {
    region: 'EMEC',
    excluded_countries: [],
    evidence_gate: gate,
    evidence_gate_rendered_by_country: { Germany: 3, Japan: 2 },
  };

  return Response.json({
    a_read_across_deck: runExportPreflight(readAcrossDeck),
    b_smuggled_regional: runExportPreflight(smuggledRegional),
    c_legacy_clean: runExportPreflight(legacyClean),
    d_legacy_leak: runExportPreflight(legacyLeak),
  });
}