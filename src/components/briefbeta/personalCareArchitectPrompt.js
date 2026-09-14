export function personalCareArchitectInstructions(enabled) {
  if (!enabled) return '';
  return `
### PERSONAL CARE MODE — HIGHEST PRIORITY OVERRIDE
This brief is exclusively for Beauty & Personal Care. Follow these rules wherever they conflict with the standard deck instructions above:
- Use ONLY verified personal_care trends and BSA GNPD launches from the evidence block. Never combine Personal Care with a Food category in one deck.
- Do not include strategic implications, Palsgaard support, Palsgaard capabilities, Einar products, formulation recommendations, a synthesis table or strategic imperatives.
- Mirror the supplied legacy-report sequence: cover/opening, global trend overview, regional trend overview, then detailed regional product-launch slides.
- Slide 1: opening slide with slide_type "content", title, subtitle, market_signal and agenda_items naming the selected trends. No citations or products.
- Slide 2: global trend overview with slide_type "table", preheader "GLOBAL TRENDS | BEAUTY & PERSONAL CARE", columns ["Trend", "Global signal", "Evidence"], and one row per selected trend. Ground each row in that trend's verified market_signal and sources; do not mention regional GNPD as global proof.
- Slide 3: regional trend overview with slide_type "table", preheader "REGIONAL TRENDS | <REGION>", columns ["Trend", "Regional expression", "Launch proof"], and one row per selected trend. Ground every regional expression in that trend's in-region GNPD products.
- Then emit exactly ONE product_detail slide per selected trend, using the strongest in-region GNPD product listed first under that trend. Never use a cross-region product on a product_detail slide.
- Product detail shape: {"slide_type":"product_detail","category":"personal_care","trend_id":"exact trend id","evidence_class":"regional","preheader":"TRENDS: INSPIRATION | <TREND>","title":"exact product name","subtitle":"Brand | Country | Launch date","market_signal":"concise product description from the supplied GNPD record","bullets_header":"Positioning claims","bullets":["up to 4 exact or lightly shortened claims"],"ingredients":"ingredient list from the supplied GNPD record, max 1200 characters","gnpd_examples":["<exact GNPD Record ID> | Product — Brand (Country): supports <trend>"],"evidence_footer":"Mintel GNPD"}.
- Never invent missing descriptions, claims or ingredients. If a field is absent in the evidence, leave it empty.
- Do not emit section_header or implications slides in Personal Care mode.
`;
}