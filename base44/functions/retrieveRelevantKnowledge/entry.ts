import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Category → palsgaard.com URL mapping
const PALSGAARD_URLS = {
  'Ice Cream': 'https://www.palsgaard.com/en/food-emulsifiers-and-stabilisers/solutions/ice-cream/',
  'Plant-Based': 'https://www.palsgaard.com/en/food-emulsifiers-and-stabilisers/solutions/plant-based-products/',
  'Bakery': 'https://www.palsgaard.com/en/food-emulsifiers-and-stabilisers/solutions/bakery/',
  'Dairy': 'https://www.palsgaard.com/en/food-emulsifiers-and-stabilisers/solutions/dairy/',
  'Oils & Fats': 'https://www.palsgaard.com/en/food-emulsifiers-and-stabilisers/solutions/oils-and-fats/',
  'Confectionery': 'https://www.palsgaard.com/en/food-emulsifiers-and-stabilisers/solutions/confectionery/',
  'Fine Food': 'https://www.palsgaard.com/en/food-emulsifiers-and-stabilisers/solutions/dairy/',
  'Lipid': 'https://www.palsgaard.com/en/food-emulsifiers-and-stabilisers/solutions/oils-and-fats/',
};

function scoreExcerpt(excerpt, keywords, trendName, category) {
  let score = 0;
  const text = (excerpt.text + ' ' + (excerpt.trend_keywords || []).join(' ')).toLowerCase();
  const trendLower = trendName.toLowerCase();

  // Keyword matches
  for (const kw of keywords) {
    if (text.includes(kw.toLowerCase())) score += 2;
  }

  // Trend name words match
  const trendWords = trendLower.split(/\s+/).filter(w => w.length > 3);
  for (const w of trendWords) {
    if (text.includes(w)) score += 1;
  }

  // Category match
  if (category && excerpt.application && excerpt.application.toLowerCase().includes(category.toLowerCase())) {
    score += 3;
  }

  // Boost for quantitative data (more credible)
  if (excerpt.quantitative_data) score += 2;

  // Boost for specific product name
  if (excerpt.product_name && excerpt.product_name.includes('Palsgaard®')) score += 1;

  return score;
}

async function fetchWebContent(url) {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Palsgaard RAG)' },
      signal: AbortSignal.timeout(8000)
    });
    if (!res.ok) return null;
    const html = await res.text();
    // Strip HTML tags, keep readable text
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 3000);
    return text;
  } catch (_) {
    return null;
  }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { trend_name, trend_keywords = [], category = '' } = await req.json();

    if (!trend_name) {
      return Response.json({ error: 'trend_name required' }, { status: 400 });
    }

    // Fetch all processed knowledge sources
    const knowledgeSources = await base44.entities.Source.filter({
      source_type: 'knowledge',
      is_archived: false
    }, '-updated_date', 500);

    // Score and collect all excerpts
    const scored = [];
    for (const source of knowledgeSources) {
      if (!source.excerpts || source.excerpts.length === 0) continue;
      for (const excerpt of source.excerpts) {
        const score = scoreExcerpt(excerpt, trend_keywords, trend_name, category);
        if (score > 0) {
          scored.push({
            ...excerpt,
            _score: score,
            _source_title: source.title,
            _source_id: source.id
          });
        }
      }
    }

    // Sort by score, take top 8
    scored.sort((a, b) => b._score - a._score);
    const topExcerpts = scored.slice(0, 8);

    // Fetch relevant web content from palsgaard.com
    let webContent = null;
    const webUrl = PALSGAARD_URLS[category] || PALSGAARD_URLS['Ice Cream'];
    if (webUrl) {
      webContent = await fetchWebContent(webUrl);
    }

    return Response.json({
      success: true,
      excerpts: topExcerpts,
      web_content: webContent,
      web_url: webUrl,
      total_sources_searched: knowledgeSources.length,
      total_excerpts_found: scored.length
    });

  } catch (error) {
    console.error('retrieveRelevantKnowledge error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});