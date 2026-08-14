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

    if (recordId) {
      hits = await base44.asServiceRole.entities.GNPDProduct.filter(
        { gnpd_record_id: String(recordId) }, null, 3
      ).catch(() => []);
    }
    if (hits.length === 0 && name.length >= 4) {
      const esc = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      hits = await base44.asServiceRole.entities.GNPDProduct.filter(
        { product_name: { $regex: esc, $options: 'i' } }, null, 3
      ).catch(() => []);
    }

    const withImage = hits.find(h => h.image_url && String(h.image_url).startsWith('http'));
    out.push({
      example,
      record_id: recordId || (hits[0]?.gnpd_record_id ? String(hits[0].gnpd_record_id) : null),
      name: hits[0]?.product_name || name,
      label: name || (hits[0]?.product_name ?? ''),
      image_url: withImage?.image_url || null,
      found: hits.length > 0,
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