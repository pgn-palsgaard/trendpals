// TEMPORARY — Build B test T9c. Exercises the REAL shared pre-flight. Delete after the run.
import { runExportPreflight } from '../../shared/exportPreflight.ts';

export default async function () {
  const gate = { country_allow_list: ['Germany', 'France'] };
  return Response.json({
    smuggled_regional: runExportPreflight({
      region: 'EMEC', excluded_countries: [],
      evidence_gate: { ...gate, read_across: { rendered_by_country: { USA: 1 } } },
      evidence_gate_rendered_by_country: { Germany: 2, Japan: 1 },
    }),
    clean_read_across: runExportPreflight({
      region: 'EMEC', excluded_countries: [],
      evidence_gate: { ...gate, read_across: { rendered_by_country: { USA: 1, Japan: 2 } } },
      evidence_gate_rendered_by_country: { Germany: 2 },
    }),
  });
}