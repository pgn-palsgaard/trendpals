// Starts a Gamma PPTX export for a saved report, styled to the Palsgaard CVI.
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { secrets } from 'base44:runtime';
import { buildDeckMarkdown, productNameFromExample } from '../../shared/buildDeckMarkdown.ts';

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
        'B2B market intelligence deck for Palsgaard. Keep all facts exactly as written — never invent data. Use ONLY provided image URLs, as small thumbnails beside their product. Palsgaard CVI: blue #1D428A for headings and section dividers (H1-only cards = full-bleed Palsgaard blue divider slides with white text), dark blue #1D2B47 body text, cream #F7F4EE backgrounds, sage #6F8263 and teal #22566E accents, grey #969696 source citations. Never red/green/yellow. Titles are sentence-case insight statements, not topic labels.',
    };

    // GAMMA_TEMPLATE_ID may hold either a Gamma *theme* id (used directly) or a Gamma
    // *file* id (we resolve the file's theme). Branding must apply — fail loudly if not.
    const templateId = secrets.get('GAMMA_TEMPLATE_ID');
    if (templateId) {
      let themeId = null;
      try {
        const tRes = await fetch(`https://public-api.gamma.app/v1.0/gammas/${templateId}`, {
          headers: { 'X-API-KEY': secrets.get('GAMMA_API_KEY') },
        });
        if (tRes.ok) {
          const tData = await tRes.json();
          themeId = tData?.themeId || tData?.theme?.id || null;
        }
      } catch { /* not a file id — treat the value as a theme id below */ }
      body.themeId = themeId || templateId;
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
      theme_id: body.themeId || null,
      slide_count: (report.slides || []).length,
      warnings: data.warnings || null,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}