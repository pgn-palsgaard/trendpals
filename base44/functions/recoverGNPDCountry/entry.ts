import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// ── Canonical region map (mirror of lib/regions.js — no local imports in Deno) ──
const MARKET_TO_REGION = {
  'japan': 'aspac', 'china': 'aspac', 'south korea': 'aspac', 'korea': 'aspac',
  'indonesia': 'aspac', 'thailand': 'aspac', 'vietnam': 'aspac', 'philippines': 'aspac',
  'malaysia': 'aspac', 'singapore': 'aspac', 'australia': 'aspac', 'new zealand': 'aspac',
  'india': 'aspac', 'taiwan': 'aspac', 'hong kong': 'aspac',
  'taiwan, china': 'aspac', 'hong kong, china': 'aspac', 'sri lanka': 'aspac',
  'bangladesh': 'aspac', 'pakistan': 'aspac', 'cambodia': 'aspac',
  'myanmar': 'aspac', 'laos': 'aspac',
  'uk': 'europe', 'united kingdom': 'europe', 'great britain': 'europe',
  'germany': 'europe', 'france': 'europe', 'italy': 'europe', 'spain': 'europe',
  'netherlands': 'europe', 'belgium': 'europe', 'sweden': 'europe', 'denmark': 'europe',
  'norway': 'europe', 'finland': 'europe', 'poland': 'europe', 'switzerland': 'europe',
  'austria': 'europe', 'ireland': 'europe', 'czech republic': 'europe', 'czechia': 'europe',
  'portugal': 'europe', 'greece': 'europe', 'romania': 'europe', 'hungary': 'europe',
  'russia': 'europe', 'lithuania': 'europe', 'slovenia': 'europe',
  'latvia': 'europe', 'croatia': 'europe',
  'united states': 'north_america', 'us': 'north_america', 'usa': 'north_america',
  'u.s.': 'north_america', 'u.s.a.': 'north_america', 'canada': 'north_america',
  'brazil': 'latam', 'mexico': 'latam', 'argentina': 'latam', 'colombia': 'latam',
  'chile': 'latam', 'peru': 'latam', 'ecuador': 'latam',
  'puerto rico': 'latam', 'venezuela': 'latam', 'guatemala': 'latam', 'panama': 'latam',
  'uae': 'mena', 'united arab emirates': 'mena', 'saudi arabia': 'mena', 'egypt': 'mena',
  'turkey': 'mena', 'israel': 'mena', 'south africa': 'mena', 'morocco': 'mena',
  'tunisia': 'mena', 'lebanon': 'mena', 'kuwait': 'mena', 'qatar': 'mena',
  'bahrain': 'mena', 'jordan': 'mena', 'algeria': 'mena', 'oman': 'mena',
  'nigeria': 'sub_saharan_africa', 'kenya': 'sub_saharan_africa', 'ghana': 'sub_saharan_africa',
  'ethiopia': 'sub_saharan_africa', 'tanzania': 'sub_saharan_africa',
  'cameroon': 'sub_saharan_africa', 'ivory coast': 'sub_saharan_africa',
};

// Normalise a few common Spanish/Portuguese country spellings to the map keys.
const COUNTRY_NORMALIZE = {
  'brasil': 'brazil',
  'méxico': 'mexico', 'mexico': 'mexico',
  'perú': 'peru', 'peru': 'peru',
  'colombia': 'colombia',
  'chile': 'chile',
  'argentina': 'argentina',
  'ecuador': 'ecuador',
  'guatemala': 'guatemala',
  'venezuela': 'venezuela',
  'panamá': 'panama', 'panama': 'panama',
};

// Adjective → country (for "100% Guatemalan" style)
const ADJECTIVE_TO_COUNTRY = {
  'guatemalan': 'guatemala', 'mexican': 'mexico', 'brazilian': 'brazil',
  'argentinian': 'argentina', 'argentine': 'argentina', 'chilean': 'chile',
  'colombian': 'colombia', 'peruvian': 'peru', 'ecuadorian': 'ecuador',
  'italian': 'italy', 'french': 'france', 'spanish': 'spain', 'german': 'germany',
};

// Ordered extraction patterns (capture group 1 = country / region phrase).
const PATTERNS = [
  /Secretar[ií]a de Salud de ([\w][\w\sáéíóúñ]*?)(?:\s*-|\s*$)/i,
  /Ministerio de Salud (?:y Protección Social )?de ([\w][\w\sáéíóúñ]*?)(?:\s*-|\s*$)/i,
  /Ministerio de Salud P[uú]blica de ([\w][\w\sáéíóúñ]*?)(?:\s*-|\s*$)/i,
  /Hecho en ([\w][\w\sáéíóúñ]*?)(?:\s*[,\-\)]|\s*$)/i,
  /Minist[eé]rio (?:da Sa[uú]de|de Agricultura) (?:do|de) ([\w][\w\sãáéíóúç]*?)(?:\s*-|\s*$)/i,
  /Ministry of Health of ([\w][\w\s]*?)(?:\s*-|\s*$)/i,
];

function extractCountry(description) {
  if (!description || typeof description !== 'string') return null;

  for (const p of PATTERNS) {
    const m = description.match(p);
    if (m && m[1]) {
      const raw = m[1].trim().toLowerCase();
      const normalized = COUNTRY_NORMALIZE[raw] || raw;
      if (MARKET_TO_REGION[normalized]) return normalized;
    }
  }

  // Adjective-based: "100% Guatemalan"
  const adj = description.match(/100%\s+([A-Za-zÀ-ÿ]+)\b/i);
  if (adj && adj[1]) {
    const a = adj[1].trim().toLowerCase();
    if (ADJECTIVE_TO_COUNTRY[a]) return ADJECTIVE_TO_COUNTRY[a];
  }

  // Brazilian fallback: "High in added sugar" warning with no other country match.
  if (/high in added sugar/i.test(description)) return 'brazil';

  return null;
}

// Title-case the canonical country key for storage.
function toTitle(key) {
  return key.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Load all unknown-region products with a description in the country field.
    let candidates = [];
    let skip = 0;
    while (true) {
      const batch = await base44.asServiceRole.entities.GNPDProduct.filter({ region: 'unknown' }, null, 500, skip);
      if (!batch.length) break;
      candidates = candidates.concat(batch);
      skip += 500;
      if (batch.length < 500) break;
    }
    candidates = candidates.filter(r => (r.country || '').trim().length > 50);

    let processed = 0;
    let recovered = 0;
    const recoveredBreakdown = {};
    const unrecoverableIds = [];

    // Process in batches of 50.
    for (let i = 0; i < candidates.length; i += 50) {
      const batch = candidates.slice(i, i + 50);
      for (const r of batch) {
        processed++;
        const countryKey = extractCountry(r.country);
        if (countryKey) {
          const region = MARKET_TO_REGION[countryKey];
          const countryName = toTitle(countryKey);
          await base44.asServiceRole.entities.GNPDProduct.update(r.id, {
            country: countryName,
            region,
          });
          recovered++;
          recoveredBreakdown[countryName] = (recoveredBreakdown[countryName] || 0) + 1;
        } else {
          unrecoverableIds.push(r.gnpd_record_id || r.id);
        }
      }
    }

    console.log(`[recoverGNPDCountry] processed=${processed} recovered=${recovered} unrecoverable=${unrecoverableIds.length}`);
    console.log(`[recoverGNPDCountry] unrecoverable record ids:`, unrecoverableIds.join(', '));

    return Response.json({
      processed,
      recovered,
      unrecoverable: unrecoverableIds.length,
      recovered_breakdown: Object.entries(recoveredBreakdown).sort((a, b) => b[1] - a[1]),
      unrecoverable_sample: unrecoverableIds.slice(0, 20),
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});