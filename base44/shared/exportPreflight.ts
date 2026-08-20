// Phase 6 — export pre-flight: regional containment check.
//
// The last gate before a deck leaves the building. Everything upstream (the
// region gate, the exclusion list, the save-time rendered_by_country count) is
// about producing a correct report; this is about never SHIPPING an incorrect
// one. It runs before any call to Anthropic or Gamma, so a report with
// out-of-scope evidence cannot be turned into a file a salesperson emails to a
// customer.
//
// Deliberately conservative in one direction only: a report with no extracted
// countries passes silently. Reports predating rendered_by_country have nothing
// to check, and blocking them would punish age rather than catch a defect.
import { resolveAllowList } from './regionTaxonomy.ts';

// Country keys on rendered_by_country come from the deck's own prose, where the
// architect may mark a country with a trailing '*' (a footnote marker, not part
// of the name). The marker is stripped for MATCHING only — violations are
// reported with the name as it was written, so the report stays traceable.
function normaliseCountry(key: string): string {
  return String(key || '').trim().replace(/\*+$/, '').trim();
}

export function runExportPreflight(report: any): {
  ok: boolean;
  violations: Array<{ country: string; count: number }>;
  effective_allow_list: string[];
  payload?: Record<string, unknown>;
} {
  const rendered = report?.evidence_gate_rendered_by_country || {};
  const excluded = Array.isArray(report?.excluded_countries) ? report.excluded_countries : [];

  // Scope source, in priority order. evidence_gate.country_allow_list is the
  // authoritative scope — it is what the gate actually filtered evidence by at
  // fetch time. report.region is only a coarse code that cannot express a
  // sub-region scope (a LATAM brief is stored as 'AMERICAS'), so re-resolving
  // from it would widen the scope and let a real leak through.
  const gateList: string[] = Array.isArray(report?.evidence_gate?.country_allow_list)
    ? report.evidence_gate.country_allow_list
    : [];

  let allowList: string[];
  let scope: string;
  if (gateList.length > 0) {
    // Exclusions still subtract — fail-closed, even off the authoritative list.
    const exLc = new Set(excluded.map(c => normaliseCountry(c).toLowerCase()));
    allowList = gateList.filter(c => !exLc.has(normaliseCountry(c).toLowerCase()));
    scope = 'countries';
  } else if (excluded.length > 0) {
    const resolved = resolveAllowList(String(report?.region || ''), excluded);
    allowList = resolved.countries;
    scope = resolved.scope;
  } else {
    // No authoritative scope and no explicit exclusion — there is nothing to
    // check against. Skipped rather than re-resolved from the coarse region code,
    // which would produce a confident answer from an unreliable source.
    return { ok: true, violations: [], effective_allow_list: [] };
  }

  // Nothing extracted → nothing to verify. Not a pass on the evidence, a pass on
  // the absence of a claim to check.
  const keys = Object.keys(rendered).filter(k => k !== '_unresolved');
  if (keys.length === 0) {
    return { ok: true, violations: [], effective_allow_list: allowList };
  }

  // Global scope has no country restriction, but an explicit exclusion still binds.
  const allowLc = new Set(allowList.map(c => c.toLowerCase()));
  const excludedLc = new Set(excluded.map(c => normaliseCountry(c).toLowerCase()));

  const violations: Array<{ country: string; count: number }> = [];
  for (const key of keys) {
    const name = normaliseCountry(key);
    if (!name) continue;
    const lc = name.toLowerCase();
    const isViolation = excludedLc.has(lc)
      || (scope !== 'global' && !allowLc.has(lc));
    if (isViolation) violations.push({ country: name, count: rendered[key] });
  }

  if (violations.length === 0) {
    return { ok: true, violations: [], effective_allow_list: allowList };
  }

  return {
    ok: false,
    violations,
    effective_allow_list: allowList,
    payload: {
      preflight_failed: true,
      reason: 'gnpd_evidence_out_of_scope',
      violations,
      effective_allow_list: allowList,
      message: 'This report contains GNPD evidence from countries outside its regional scope. Regenerate the report before exporting.',
    },
  };
}

// Records the failure on the report so the UI can state the reason without the
// user having to read a console error.
export async function recordPreflightFailure(base44: any, reportId: string, result: any) {
  const detail = result.violations.map((v: any) => `${v.country} (${v.count})`).join(', ');
  await base44.asServiceRole.entities.Report.update(reportId, {
    preflight_failed: true,
    preflight_error: `GNPD evidence outside regional scope: ${detail}. Regenerate the report before exporting.`.slice(0, 500),
  }).catch(() => {});
}