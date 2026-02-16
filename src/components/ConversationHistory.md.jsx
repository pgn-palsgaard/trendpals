# Trend Deck Builder App - Conversation History

## Project Overview
Building a "Trend Deck Builder App" for creating evidence-led trend reports and Gamma decks.

## Conversation Summary

### Initial Discussion
- **User Goal**: Create a Trend Deck Builder App for evidence-led trend reports
- **Entities Needed**: Project, Report, Source, TrendCandidate
- **Focus**: MVP - specifically the "New Project wizard"

### Project Entity Schema Discussion
- Proposed detailed `Project.json` schema based on project brief
- **Key Fields**:
  - name, category, region
  - trend_time_window, launch_time_window
  - audience (default: "Industrial manufacturers")
  - objective, meeting_context
  - customer_priorities (array)
  - state (draft → evidence_sufficient → publishable → published → aged)
  - selected_trend_ids (3-5 trends)
  - data_sufficiency_score (0-100)
  - warnings (array of objects)

- **Required Fields**: name, category, region, trend_time_window, launch_time_window, objective

### Implementation Steps
1. ✅ Created `Project` entity with full schema
2. ✅ Built `pages/NewProject.js` - New Project wizard page with:
   - React Hook Form with Zod validation
   - All required and optional fields from schema
   - Dropdowns for categories, regions, time windows
   - Checkboxes for customer priorities
   - Validation and error handling
   - Navigation to ProjectDetail page after creation

### Gamma API Configuration
- **Template ID**: g_8lwq3ubw9b2eyp8
- Confirmed environment variable `GAMMA_TEMPLATE_ID` is set
- Function `generateGammaReport` uses this template for deck generation

## Entities

### Project
```json
{
  "name": "Project",
  "type": "object",
  "properties": {
    "name": { "type": "string" },
    "category": { "type": "string" },
    "region": { "type": "string" },
    "trend_time_window": { "type": "string" },
    "launch_time_window": { "type": "string" },
    "audience": { "type": "string", "default": "Industrial manufacturers" },
    "objective": { "type": "string" },
    "meeting_context": { 
      "type": "string",
      "enum": ["discovery", "innovation_day", "technical_workshop", "other"]
    },
    "customer_priorities": {
      "type": "array",
      "items": { "type": "string" }
    },
    "state": {
      "type": "string",
      "enum": ["draft", "evidence_sufficient", "publishable", "published", "aged"],
      "default": "draft"
    },
    "selected_trend_ids": {
      "type": "array",
      "items": { "type": "string" }
    },
    "data_sufficiency_score": { "type": "number" },
    "warnings": {
      "type": "array",
      "items": { "type": "object" }
    }
  },
  "required": ["name", "category", "region", "trend_time_window", "launch_time_window", "objective"]
}
```

### TrendCandidate
```json
{
  "name": "TrendCandidate",
  "type": "object",
  "properties": {
    "project_id": { "type": "string" },
    "trend_name": { "type": "string" },
    "whats_changing": {
      "type": "array",
      "items": { "type": "string" }
    },
    "why_now": {
      "type": "array",
      "items": { "type": "string" }
    },
    "evidence_anchors": { "type": "object" },
    "confidence": {
      "type": "string",
      "enum": ["high", "medium", "low"]
    },
    "what_could_be_wrong": { "type": "string" },
    "is_selected": { "type": "boolean", "default": false },
    "is_excluded": { "type": "boolean", "default": false },
    "priority": {
      "type": "string",
      "enum": ["primary", "secondary"]
    }
  },
  "required": ["project_id", "trend_name"]
}
```

### Source
```json
{
  "name": "Source",
  "type": "object",
  "properties": {
    "project_id": { "type": "string" },
    "source_type": {
      "type": "string",
      "enum": ["mintel", "gnpd", "report", "url", "other"]
    },
    "title": { "type": "string" },
    "file_url": { "type": "string" },
    "url": { "type": "string" },
    "date": { "type": "string", "format": "date" },
    "excerpts": { "type": "array", "items": { "type": "object" } },
    "gnpd_data": { "type": "array", "items": { "type": "object" } },
    "status": {
      "type": "string",
      "enum": ["processing", "processed", "error"],
      "default": "processing"
    },
    "freshness": {
      "type": "string",
      "enum": ["recent", "aging", "outdated"]
    }
  },
  "required": ["project_id", "source_type", "title"]
}
```

### Report
```json
{
  "name": "Report",
  "type": "object",
  "properties": {
    "project_id": { "type": "string" },
    "title": { "type": "string" },
    "category": { "type": "string" },
    "region": { "type": "string" },
    "slides": { "type": "array", "items": { "type": "object" } },
    "evidence_pack": { "type": "array", "items": { "type": "object" } },
    "product_shortlist": { "type": "array", "items": { "type": "object" } },
    "image_map": { "type": "object" },
    "version": { "type": "number", "default": 1 },
    "status": {
      "type": "string",
      "enum": ["draft", "published", "aged"],
      "default": "draft"
    },
    "freshness": {
      "type": "string",
      "enum": ["fresh", "use_with_caution", "outdated"]
    },
    "selected_trends": { "type": "array", "items": { "type": "string" } },
    "warnings": { "type": "array", "items": { "type": "object" } },
    "gamma_url": { "type": "string" },
    "gamma_pptx_url": { "type": "string" },
    "gamma_pdf_url": { "type": "string" },
    "gamma_prompt": { "type": "string" }
  },
  "required": ["project_id", "title", "category", "region"]
}
```

## Pages Created

### NewProject.js
- Full wizard form for creating new projects
- Form validation with Zod
- All required and optional fields
- Dropdowns for categories, regions, time windows, meeting context
- Checkboxes for customer priorities
- Creates project and navigates to ProjectDetail page

## Backend Functions

### generateGammaReport
- Takes report_id as input
- Fetches report from database
- Builds prompt from report slides, evidence pack
- Calls Gamma API using template `g_8lwq3ubw9b2eyp8`
- Polls for completion
- Updates report with Gamma URLs (web, PPTX, PDF)

## Configuration Options Used

### Categories
- Ice Cream, Bakery, Confectionery, Chocolate, Dairy, Beverages

### Regions
- EMEA, APAC, Americas, Global

### Trend Time Windows
- last 6 months, last 12 months, last 24 months, last 36 months

### Launch Time Windows
- last 30 days, last 3 months, last 6 months, last 12 months

### Meeting Contexts
- discovery, innovation_day, technical_workshop, other

### Customer Priorities
- cost, clean label, sustainability, texture, indulgence, health & wellness, convenience

## Environment Variables
- `GAMMA_API_KEY` - Set in dashboard
- `GAMMA_TEMPLATE_ID` - Set to `g_8lwq3ubw9b2eyp8`

## Next Steps (Not Yet Implemented)
- Build out ProjectDetail tabs (Overview, Sources, Trends, Report)
- Implement source upload and processing
- Implement trend generation from sources
- Implement report generation
- Build UI for trend selection and prioritization
- Implement quality gates and warnings system