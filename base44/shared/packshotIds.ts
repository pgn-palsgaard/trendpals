// Shared helper: derive a GNPD Record ID from an uploaded pack shot filename.
// Handles "14535734.jpg", "mintel_14535734 (1).png", "packshots/14535734.webp".
export function recordIdFromFilename(name) {
  const base = String(name || '').split('/').pop().split('\\').pop();
  const stem = base.replace(/\.[^.]+$/, '');
  const runs = stem.match(/\d{4,}/g);
  if (!runs) return null;
  return runs.sort((a, b) => b.length - a.length)[0];
}

export function isImageName(name) {
  return /\.(jpe?g|png|webp|gif)$/i.test(String(name || ''));
}

// GNPD bulk downloads ship several shots per record, named
// "<recordId>-<shotIndex>.jpg" (14291314-0.jpg … 14291314-8.jpg).
// Returns the shot index, or 0 when the name carries no suffix.
export function shotIndexFromFilename(name) {
  const stem = String(name || '').split('/').pop().split('\\').pop().replace(/\.[^.]+$/, '');
  const m = stem.match(/-(\d{1,3})$/);
  return m ? Number(m[1]) : 0;
}

// Keeps one image per Record ID — the lowest shot index, which is the pack shot
// GNPD lists first. The rest are returned as extras so they can be reported
// rather than silently overwriting each other.
export function pickPrimaryShots(names) {
  const best = new Map();
  const extras = [];
  for (const name of names) {
    const id = recordIdFromFilename(name);
    if (!id) continue;
    const idx = shotIndexFromFilename(name);
    const current = best.get(id);
    if (!current || idx < current.idx) {
      if (current) extras.push(current.name);
      best.set(id, { name, idx });
    } else {
      extras.push(name);
    }
  }
  return { primary: [...best.values()].map(v => v.name), extras };
}