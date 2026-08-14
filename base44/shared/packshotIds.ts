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