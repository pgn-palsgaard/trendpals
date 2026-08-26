import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';

// The report's product_shortlist is a snapshot frozen at save time, so a pack shot
// uploaded afterwards is invisible there. This reads the CURRENT image for each
// cited GNPD record, so the report shows what the database actually holds.
export function useLivePackshots(recordIds) {
  const key = (recordIds || []).filter(Boolean).join(',');
  const [images, setImages] = useState({});

  useEffect(() => {
    const ids = key ? key.split(',') : [];
    if (ids.length === 0) { setImages({}); return; }
    let alive = true;
    base44.entities.GNPDProduct
      .filter({ gnpd_record_id: { $in: ids } }, '-updated_date', 500)
      .then(rows => {
        if (!alive) return;
        const map = {};
        for (const r of rows || []) if (r.image_url) map[r.gnpd_record_id] = r.image_url;
        setImages(map);
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [key]);

  return images;
}