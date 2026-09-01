// Architect-specific framing per job-to-be-done. The Architect builds the deck
// itself (unlike the brief intake, which hands a request to the MI team), so the
// openers ask for what the evidence gates need: category, region, audience.

export const ARCHITECT_DESCRIPTIONS = {
  prepare_customer_meeting: 'Build a deck for a specific customer visit.',
  build_trend_deck: 'Build a category trend deck for a team or customer.',
  understand_market: 'Explore what the evidence shows in a category or region.',
  support_innovation_pipeline: 'Build the market case behind an NPD direction.',
  other: 'Describe the report you need — the architect will structure it.',
};

export const ARCHITECT_OPENERS = {
  prepare_customer_meeting: "I'm the Report Architect (BETA). Let's build the deck for your customer meeting. Paste the email or invite, or tell me who you're meeting, what they make, and which markets they sell in. I'll structure the brief with you, then build the full deck for your review before anything is saved.",
  build_trend_deck: "I'm the Report Architect (BETA). Let's build your trend deck. Tell me the category, the markets and who it's for — or paste any rough context. I'll structure the brief with you, then build the full deck for your review before anything is saved.",
  understand_market: "I'm the Report Architect (BETA). Let's look at what the evidence actually shows. Which category and which markets do you want to understand, and what's the question behind it? I'll structure the brief with you, then build the full deck for your review before anything is saved.",
  support_innovation_pipeline: "I'm the Report Architect (BETA). Let's build the market case behind your NPD direction. Describe the application or idea, the category and the markets in scope. I'll structure the brief with you, then build the full deck for your review before anything is saved.",
  other: "I'm the Report Architect (BETA). Tell me what report you need — paste an email, a meeting note, or just describe it. I'll structure the brief with you, then build the full slide deck for your review before anything is saved.",
};

// Prepended to the transcript so the architect knows the errand from turn one.
// Framing only — it never relaxes the evidence gates or the region scope.
export function jtbdFraming(jtbd, label) {
  if (!jtbd) return '';
  return `The user selected this job to be done: ${label}. Keep the brief and the deck aimed at that errand.\n\n`;
}