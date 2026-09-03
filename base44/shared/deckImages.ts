// Single resolver for the pack shots a deck references, used by the image
// preflight, the Gamma export and the Claude PPTX export so all three see
// exactly the same images.
//
// Resolution order per example: exact GNPD Record ID (authoritative), then a
// name search for legacy examples that carry no ID.
import { recordIdFromExample, productNameFromExample } from './productNames.ts';

export async function resolveDeckProducts(base44, report, limit = 40) {
  const examples = [...new Set((report.slides || []).flatMap(s => s.gnpd_examples || []))].slice(0, limit);
  const out = [];

  for (const example of examples) {
    const recordId = recordIdFromExample(example);
    const name = productNameFromExample(example);
    let hits = [];
    // Only an exact Record ID hit is authoritative. The name search below is a
    // heuristic (first of up to 3 regex hits) and must never enrich a card with
    // another product's country or date.
    let matchedBy = null;

    if (recordId) {
      hits = await base44.asServiceRole.entities.GNPDProduct.filter(
        { gnpd_record_id: String(recordId) }, null, 3
      ).catch(() => []);
      if (hits.length > 0) matchedBy = 'record_id';
    }
    if (hits.length === 0 && name.length >= 4) {
      matchedBy = 'name_fallback';
      const esc = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      hits = await base44.asServiceRole.entities.GNPDProduct.filter(
        { product_name: { $regex: esc, $options: 'i' } }, null, 3
      ).catch(() => []);
    }

    const withImage = hits.find(h => h.image_url && String(h.image_url).startsWith('http'));
    const exact = matchedBy === 'record_id' ? hits[0] : null;
    out.push({
      example,
      record_id: recordId || (hits[0]?.gnpd_record_id ? String(hits[0].gnpd_record_id) : null),
      name: hits[0]?.product_name || name,
      label: name || (hits[0]?.product_name ?? ''),
      image_url: withImage?.image_url || null,
      found: hits.length > 0,
      matched_by: hits.length > 0 ? matchedBy : null,
      brand: exact?.brand || null,
      country: exact?.country || null,
      launch_date: exact?.launch_date || null,
    });
  }

  return out;
}

// { [record id or lowercased name]: image_url } — the key shape buildDeckMarkdown looks up.
export function imageMapFrom(resolved) {
  const map = {};
  for (const r of resolved) {
    if (!r.image_url) continue;
    if (r.record_id) map[r.record_id] = r.image_url;
    if (r.label) map[r.label.toLowerCase()] = r.image_url;
    if (r.name) map[r.name.toLowerCase()] = r.image_url;
  }
  return map;
}