import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import * as XLSX from 'npm:xlsx';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { project_id, selected_trends } = await req.json();

    if (!project_id || !selected_trends || selected_trends.length === 0) {
      return Response.json({ 
        error: 'project_id and selected_trends are required' 
      }, { status: 400 });
    }

    // Fetch full trend details
    const trendCandidates = await base44.entities.TrendCandidate.filter({ 
      project_id,
      is_selected: true 
    });

    if (trendCandidates.length === 0) {
      return Response.json({ 
        error: 'No selected trends found' 
      }, { status: 400 });
    }

    // Fetch project context and sources
    const project = await base44.entities.Project.get(project_id);
    const sources = await base44.entities.Source.filter({ project_id });

    // Helper function to parse Excel data into text
    const parseExcelToText = async (fileUrl) => {
      try {
        const response = await fetch(fileUrl);
        const arrayBuffer = await response.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer);
        
        let excelText = '';
        
        workbook.SheetNames.forEach((sheetName) => {
          const worksheet = workbook.Sheets[sheetName];
          const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
          
          excelText += `\n\n=== ${sheetName} ===\n`;
          jsonData.forEach((row, idx) => {
            if (row && row.length > 0) {
              excelText += row.join(' | ') + '\n';
            }
          });
        });
        
        return excelText;
      } catch (error) {
        console.error('Error parsing Excel:', error);
        return '';
      }
    };

    // Extract Mintel report content
    const mintelContent = sources
      .filter(s => s.source_type === 'mintel')
      .map(s => {
        const excerpts = s.excerpts?.map(e => e.text).join('\n\n') || '';
        return `Report: ${s.title}\n${excerpts}`;
      })
      .join('\n\n---\n\n');

    // Extract aggregated Excel data (launch data tables)
    let launchDataTables = '';
    for (const source of sources) {
      if (source.source_type === 'gnpd' && source.file_url && 
          (source.title.toLowerCase().includes('region') || 
           source.title.toLowerCase().includes('claim') ||
           source.title.toLowerCase().includes('chart'))) {
        const excelText = await parseExcelToText(source.file_url);
        if (excelText) {
          launchDataTables += `\n\nFile: ${source.title}\n${excelText}`;
        }
      }
    }

    // Calculate launch window (last 3 months from today)
    const today = new Date();
    const threeMonthsAgo = new Date(today);
    threeMonthsAgo.setMonth(today.getMonth() - 3);
    const launchWindow = `published < 3 months (from ${threeMonthsAgo.toISOString().split('T')[0]} to ${today.toISOString().split('T')[0]})`;

    // Determine subcategories from project category
    const subcategoriesMap = {
      'Ice Cream': 'Dairy based ice cream & frozen yogurt; Plant-based ice cream & frozen yogurt; Water-based lollies/pops/sorbets; Frozen desserts',
      'Bakery': 'Bread; Cakes & pastries; Cookies & biscuits; Other baked goods',
      'Confectionery': 'Chocolate; Sugar confectionery; Gum & mints'
    };
    const subcategories = subcategoriesMap[project.category] || project.category;

    // Build comprehensive trend analysis prompt
    const analysisPrompt = `Purpose

Identify and articulate evidence-led commercial trends for a specified region and sub-category within ${project.category.toLowerCase()}, using the provided Mintel reports and recent launch data tables. Output must be credible for a B2B manufacturer audience (R&D, application, quality, procurement, commercial leadership) who already have strong category knowledge.

Role

You are a Senior B2B Commercial Insights Lead for industrial food ingredients. You translate market signals into manufacturer-relevant implications (formulation, processing, cost, risk, scalability). You are calm, factual, and never hype-driven.

Project Inputs

- Category / Industry: ${project.category}
- Sub-categories in scope: ${subcategories}
- Region in scope: ${project.region}
- Time window for launches: ${launchWindow}
- Audience type: ${project.audience}
- Business objective: ${project.objective}
- Customer priorities: ${project.customer_priorities?.join(', ') || 'Not specified'}

Data You Must Use (and how)

Use only the information contained in the provided sources below. Do not invent statistics, claims, or examples.

Source types:

1. Mintel narrative reports
   - Use for: macro drivers, consumer attitudes, strategic opportunity areas, and why now.
   - Treat as: qualitative + cited quantitative where present.

2. Recent launch data tables (Excel extracts)
   - Use for: regional pattern validation (format mix, claim mix, flavour mix, launch type mix, ingredient claim distribution).
   - Treat as: quantitative evidence for "what is happening in market now".

Operating Rules (non-negotiable)

- Evidence discipline: Every trend must be supported by both:
  * at least one Mintel report insight (driver/context), and
  * at least one launch-data signal (regional validation).
- No hallucinations: Do not create numbers, brands, product examples, or regulatory claims not present in the inputs.
- Manufacturer lens: Always translate trends into implications for industrial manufacturing (texture systems, stability, process tolerance, cost-in-use, ingredient simplification, label strategy, supply risk).
- Audience sophistication: Assume the reader knows the category; avoid basic explanations. Focus on what is changing, what is material, and what decisions it affects.
- Regional specificity: If ${project.region} is specified, prioritise signals from that region. Only reference other regions for contrast, and label it clearly.
- Time relevance: Prefer signals from the stated launch window. If using longer-term context from reports, label it as "strategic outlook" vs "recent launches".
- No product selling: Do not mention supplier product names/grades. You may describe "where an ingredients partner can support" in capability terms only.

MINTEL REPORTS PROVIDED:
${mintelContent || 'No Mintel reports uploaded yet'}

RECENT LAUNCH DATA TABLES:
${launchDataTables || 'No aggregated launch data uploaded yet'}

Trend Identification Method

Follow this sequence:

1. Scan & extract signals
   - From Mintel reports: list the key drivers/opportunity areas relevant to ${project.region} and ${subcategories}.
   - From launch tables: identify the top patterns for ${project.region} (claims, ingredient claims, formats, flavours, launch types).

2. Cluster into trend candidates (5–7)
   - Each trend must be a coherent "what's changing" statement that a manufacturer can act on.

3. Stress-test each trend
   - Ask: Is this truly a trend (directional change) vs a static preference?
   - What could be wrong? (data gaps, short window bias, regional outliers)
   - What would we need to confirm next?

Required Output Format

Produce 5–7 trends in JSON. For each trend, use this exact structure within the "trends" array.

Also include:
- "regional_pattern_snapshot": Array of 5 bullets max for ${project.region} (formats, claims, flavours, launch types that stand out)
- "implication_map": Object with trend names as keys, each containing: { "rd": "string", "ops": "string", "quality_reg": "string", "procurement": "string", "marketing": "string" }

Quality Checklist (run before final answer)

- Did every trend include both a Mintel anchor and a launch-data signal?
- Are all numbers and examples traceable to inputs?
- Is the language calm, factual, and manufacturer-relevant?
- Did you avoid generic consumer marketing phrasing?
- Are you clearly aligned to ${project.region}, ${subcategories}, and ${project.audience}?

Format response as valid JSON only.`;

    const analysis = await base44.integrations.Core.InvokeLLM({
      prompt: analysisPrompt,
      add_context_from_internet: false,
      response_json_schema: {
        type: "object",
        properties: {
          trends: {
            type: "array",
            items: {
              type: "object",
              properties: {
                trend_name: { type: "string" },
                whats_changing: { type: "string" },
                why_now: { type: "array", items: { type: "string" } },
                evidence: {
                  type: "object",
                  properties: {
                    mintel_anchor: { type: "string" },
                    launch_data_signal: { type: "string" }
                  }
                },
                so_what_for_manufacturers: { type: "array", items: { type: "string" } },
                what_to_watch_risks: { type: "array", items: { type: "string" } },
                where_partner_supports: { type: "array", items: { type: "string" } }
              }
            }
          },
          regional_pattern_snapshot: {
            type: "array",
            items: { type: "string" }
          },
          implication_map: {
            type: "object",
            additionalProperties: {
              type: "object",
              properties: {
                rd: { type: "string" },
                ops: { type: "string" },
                quality_reg: { type: "string" },
                procurement: { type: "string" },
                marketing: { type: "string" }
              }
            }
          }
        }
      }
    });

    return Response.json({ 
      success: true,
      analysis
    });
  } catch (error) {
    console.error('Trend analysis error:', error);
    return Response.json({ 
      error: error.message || 'Failed to analyze trends',
      details: error.stack
    }, { status: 500 });
  }
});