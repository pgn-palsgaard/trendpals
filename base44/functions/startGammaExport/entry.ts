import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { secrets } from 'base44:runtime';
import { buildDeckMarkdown, productNameFromExample } from './buildDeckMarkdown.ts';

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { report_id } = await req.json();
    if (!report_id) return Response.json({ error: 'report_id is required' }, { status: 400 });

    const report = await base44.asServiceRole.entities.Report.get(report_id);
    if (!report) return Response.json({ error: 'Report not found' }, { status: 404 });
    if (!report.slides || report.slides.length === 0) {
      return Response.json({ error: 'This report has no slides to export' }, { status: 400 });
    }

    // Resolve GNPD product images for every product referenced in the deck, so the
    // exported PPTX shows real pack shots next to the market evidence.
    const productNames = [...new Set(
      (report.slides || [])
        .flatMap(s => s.gnpd_examples || [])
        .map(productNameFromExample)
        .filter(n => n.length >= 4)
    )].slice(0, 40);

    const imageMap = {};
    for (const name of productNames) {
      try {
        const esc = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const hits = await base44.asServiceRole.entities.GNPDProduct.filter(
          { product_name: { $regex: esc, $options: 'i' } }, null, 3
        );
        const withImage = hits.find(h => h.image_url && String(h.image_url).startsWith('http'));
        if (withImage) imageMap[name.toLowerCase()] = withImage.image_url;
      } catch { /* skip unresolvable product names */ }
    }

    const inputText = buildDeckMarkdown(report, imageMap);

    const body = {
      inputText,
      textMode: 'preserve',
      format: 'presentation',
      cardSplit: 'inputTextBreaks',
      exportAs: 'pptx',
      title: report.title?.slice(0, 200),
      additionalInstructions:
        'Professional B2B market intelligence deck for Palsgaard. Calm, authoritative tone. Keep all facts exactly as written — do not invent data. Use ONLY the image URLs provided in the markdown; do not generate or stock-source any other images. Place each provided product image as a small thumbnail directly next to the product it belongs to.',
    };

    // GAMMA_TEMPLATE_ID holds a Gamma *file* id, not a theme id — look up the file's
    // theme so the export inherits the Palsgaard branding. Optional: skipped on failure.
    const templateId = secrets.get('GAMMA_TEMPLATE_ID');
    if (templateId) {
      try {
        const tRes = await fetch(`https://public-api.gamma.app/v1.0/gammas/${templateId}`, {
          headers: { 'X-API-KEY': secrets.get('GAMMA_API_KEY') },
        });
        const tData = await tRes.json();
        const themeId = tData?.themeId || tData?.theme?.id;
        if (tRes.ok && themeId) body.themeId = themeId;
      } catch { /* branding is optional — continue without a theme */ }
    }

    const res = await fetch('https://public-api.gamma.app/v1.0/generations', {
      method: 'POST',
      headers: {
        'X-API-KEY': secrets.get('GAMMA_API_KEY'),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok || !data.generationId) {
      const message = data?.message || data?.error || `Gamma returned ${res.status}`;
      await base44.asServiceRole.entities.Report.update(report_id, {
        gamma_export_status: 'failed',
        gamma_export_error: String(message).slice(0, 500),
      });
      return Response.json({ error: message }, { status: 502 });
    }

    await base44.asServiceRole.entities.Report.update(report_id, {
      gamma_generation_id: data.generationId,
      gamma_export_status: 'generating',
      gamma_export_error: null,
      gamma_export_started_at: new Date().toISOString(),
    });

    return Response.json({
      success: true,
      generation_id: data.generationId,
      slide_count: (report.slides || []).length,
      warnings: data.warnings || null,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}