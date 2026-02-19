import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import * as XLSX from 'npm:xlsx';
import pdfParse from 'npm:pdf-parse';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { source_id } = await req.json();

        if (!source_id) {
            return Response.json({ error: 'source_id is required' }, { status: 400 });
        }

        // Fetch the source
        const source = await base44.entities.Source.get(source_id);
        if (!source) {
            return Response.json({ error: 'Source not found' }, { status: 404 });
        }

        // Initialize extraction result
        const extractedData = {};
        const missingFields = [];
        let extractionStatus = 'extracted';
        let page1TextRaw = '';

        // Extract metadata based on file type
        const fileUrl = source.file_url;
        const fileName = source.title || '';
        const fileExtension = fileName.split('.').pop()?.toLowerCase();

        try {
            if (fileExtension === 'pdf') {
                // Extract metadata from PDF (robust page 1 extraction)
                const pdfMetadata = await extractFromPDF(fileUrl, fileName, base44);
                Object.assign(extractedData, pdfMetadata.extractedData);
                page1TextRaw = pdfMetadata.page1TextRaw;
            } else if (['xls', 'xlsx', 'csv'].includes(fileExtension)) {
                // Extract metadata from Excel/CSV
                const excelMetadata = await extractFromExcel(fileUrl, fileName, base44);
                Object.assign(extractedData, excelMetadata);
            } else if (fileExtension === 'html') {
                // Extract metadata from HTML
                const htmlMetadata = await extractFromHTML(fileUrl, fileName, base44);
                Object.assign(extractedData, htmlMetadata);
            }

            // Check for missing required fields
            const requiredFields = ['title', 'source_type', 'category', 'region'];
            for (const field of requiredFields) {
                if (!extractedData[field] || extractedData[field].confidence < 0.7) {
                    missingFields.push(field);
                }
            }

            // Determine status
            if (missingFields.length === 0) {
                extractionStatus = 'extracted';
            } else if (Object.keys(extractedData).length > 0) {
                extractionStatus = 'partial';
            } else {
                extractionStatus = 'failed';
            }

            // Prepare update data
            const updateData = {
                metadata_extraction: {
                    status: extractionStatus,
                    page1_text_raw: page1TextRaw,
                    extracted_data: extractedData,
                    missing_fields: missingFields,
                    last_attempted: new Date().toISOString(),
                    verified: false
                }
            };

            // Auto-apply high-confidence fields
            for (const [field, data] of Object.entries(extractedData)) {
                if (data.confidence >= 0.8 && !source[field]) {
                    updateData[field] = data.value;
                }
            }

            // Update the source
            await base44.asServiceRole.entities.Source.update(source_id, updateData);

            return Response.json({
                success: true,
                status: extractionStatus,
                extracted_fields: Object.keys(extractedData),
                missing_fields: missingFields
            });

        } catch (error) {
            // Update source with failed status
            await base44.asServiceRole.entities.Source.update(source_id, {
                metadata_extraction: {
                    status: 'failed',
                    extracted_data: {},
                    missing_fields: [],
                    last_attempted: new Date().toISOString()
                }
            });

            throw error;
        }

    } catch (error) {
        console.error('Metadata extraction error:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});

// ==================== PDF EXTRACTION (STEP-BY-STEP) ====================

async function extractFromPDF(fileUrl, fileName, base44) {
    const extractedData = {};
    
    console.log('Starting PDF extraction for:', fileName);
    
    // STEP 1: Extract page 1 text
    const page1TextRaw = await extractPage1Text(fileUrl);
    
    if (!page1TextRaw || page1TextRaw.length < 50) {
        console.error('Page 1 text extraction failed or empty');
        return { extractedData: {}, page1TextRaw: '' };
    }

    console.log(`Page 1 text extracted: ${page1TextRaw.length} characters`);
    console.log('First 500 chars:', page1TextRaw.substring(0, 500));

    // STEP 2: Deterministic parsing (regex + heuristics)
    console.log('Running deterministic parsing...');
    const deterministicData = parsePage1Deterministic(page1TextRaw, fileName);
    console.log('Deterministic extraction results:', Object.keys(deterministicData));
    Object.assign(extractedData, deterministicData);

    // STEP 3: LLM fallback (only if needed)
    const needsLLM = 
        !extractedData.date_published || 
        !extractedData.document_type || 
        !extractedData.title || 
        !extractedData.region;

    console.log('LLM needed?', needsLLM, {
        date: !!extractedData.date_published,
        docType: !!extractedData.document_type,
        title: !!extractedData.title,
        region: !!extractedData.region
    });

    if (needsLLM) {
        console.log('Running LLM fallback for missing fields');
        const llmData = await llmFallbackExtraction(page1TextRaw, fileName, base44);
        console.log('LLM extraction results:', Object.keys(llmData));
        // Only fill in missing fields from LLM
        for (const [field, data] of Object.entries(llmData)) {
            if (!extractedData[field]) {
                extractedData[field] = data;
            }
        }
    }

    console.log('Final extracted fields:', Object.keys(extractedData));
    return { extractedData, page1TextRaw };
}

// STEP 1: Extract only page 1 text from PDF
async function extractPage1Text(fileUrl) {
    try {
        const response = await fetch(fileUrl);
        const arrayBuffer = await response.arrayBuffer();
        const buffer = new Uint8Array(arrayBuffer);
        
        // Parse entire PDF first (pdf-parse doesn't support page-specific extraction)
        const pdfData = await pdfParse(buffer);
        const fullText = pdfData.text;
        
        // Extract approximate first page (first 3000 characters or until page break)
        // Most Mintel first pages are under 2000 chars
        const page1Text = fullText.substring(0, 3000);
        
        console.log(`Extracted ${page1Text.length} chars from page 1`);
        return page1Text.trim();
    } catch (error) {
        console.error('Error extracting page 1 text:', error);
        return '';
    }
}

// STEP 2.1: Parse date + document type line
function parseDateAndType(text) {
    const result = {};
    
    // Pattern: DD MONTH YYYY | TYPE
    // e.g. "6 NOVEMBER 2025 | REPORT"
    const dateTypePattern = /(\d{1,2}\s+(?:JANUARY|FEBRUARY|MARCH|APRIL|MAY|JUNE|JULY|AUGUST|SEPTEMBER|OCTOBER|NOVEMBER|DECEMBER)\s+\d{4})\s*\|\s*([A-Z\s&]+)/i;
    const match = text.match(dateTypePattern);
    
    if (match) {
        const dateStr = match[1].trim();
        const typeStr = match[2].trim();
        
        // Convert date to ISO format
        const isoDate = convertToISODate(dateStr);
        if (isoDate) {
            result.date_published = {
                value: isoDate,
                confidence: 0.95,
                evidence: `"${dateStr}" from page 1 header`,
                method: 'regex'
            };
        }
        
        // Normalize document type
        const normalizedType = normalizeDocumentType(typeStr);
        if (normalizedType) {
            result.document_type = {
                value: normalizedType,
                confidence: 0.95,
                evidence: `"${typeStr}" from page 1 header`,
                method: 'regex'
            };
        }
    }
    
    return result;
}

// STEP 2.2: Parse title block
function parseTitle(text) {
    // Find the title as the largest uppercase text block after date/type line
    // Title stops when we hit subtitle (sentence case) or author box
    
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    
    // Skip until we find date/type line or first uppercase block
    let startIdx = 0;
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].match(/\d{1,2}\s+[A-Z]+\s+\d{4}\s*\|/)) {
            startIdx = i + 1;
            break;
        }
    }
    
    // Collect consecutive uppercase lines as title
    const titleLines = [];
    for (let i = startIdx; i < lines.length; i++) {
        const line = lines[i];
        
        // Stop if we hit subtitle (sentence case), author box, or footer
        if (line.match(/^[a-z]/)) break;  // Starts with lowercase
        if (line.length > 150) break;  // Too long, probably not title
        if (line.match(/^How today's|^An exploration|^The key trends/i)) break;  // Subtitle patterns
        
        // Check if line is mostly uppercase (title characteristic)
        const uppercaseRatio = (line.match(/[A-Z]/g) || []).length / line.length;
        if (uppercaseRatio > 0.6) {
            titleLines.push(line);
        } else if (titleLines.length > 0) {
            break;  // Stop when uppercase pattern ends
        }
    }
    
    if (titleLines.length > 0) {
        const titleText = titleLines.join(' ').trim();
        return {
            title: {
                value: titleText,
                confidence: 0.9,
                evidence: `"${titleText.substring(0, 100)}..." from page 1 title block`,
                method: 'heuristic'
            }
        };
    }
    
    return {};
}

// STEP 2.3: Extract region
function parseRegion(titleText, fullText) {
    if (!titleText) return {};
    
    // Region mapping with common variations
    const regionMap = {
        'APAC': ['APAC', 'ASIA PACIFIC', 'ASPAC'],
        'EMEA': ['EMEA', 'EUROPE', 'EMEC'],
        'NORTH AMERICA': ['NORTH AMERICA', 'AMERICAS', 'US AND CANADA'],
        'LATIN AMERICA': ['LATIN AMERICA', 'SOUTH AMERICA'],
        'MIDDLE EAST & AFRICA': ['MIDDLE EAST & AFRICA', 'MIDDLE EAST AND AFRICA', 'IMEA'],
        'Global': ['GLOBAL', 'WORLDWIDE']
    };
    
    // Strategy 1: Title ends with ": REGION"
    const colonPattern = /:\s*([A-Z\s&]+)$/;
    let match = titleText.match(colonPattern);
    if (match) {
        const extracted = match[1].trim();
        for (const [standardRegion, variations] of Object.entries(regionMap)) {
            if (variations.some(v => extracted.includes(v))) {
                return {
                    region: {
                        value: standardRegion,
                        confidence: 0.95,
                        evidence: `"${extracted}" from title`,
                        method: 'regex'
                    }
                };
            }
        }
    }
    
    // Strategy 2: "SPOTLIGHT ON REGION"
    const spotlightPattern = /SPOTLIGHT\s+ON\s+([A-Z\s&]+)/i;
    match = titleText.match(spotlightPattern);
    if (match) {
        const extracted = match[1].trim();
        for (const [standardRegion, variations] of Object.entries(regionMap)) {
            if (variations.some(v => extracted.includes(v))) {
                return {
                    region: {
                        value: standardRegion,
                        confidence: 0.95,
                        evidence: `"SPOTLIGHT ON ${extracted}" from title`,
                        method: 'regex'
                    }
                };
            }
        }
    }
    
    // Strategy 3: Region keyword anywhere in title
    for (const [standardRegion, variations] of Object.entries(regionMap)) {
        for (const variation of variations) {
            if (titleText.toUpperCase().includes(variation)) {
                return {
                    region: {
                        value: standardRegion,
                        confidence: 0.85,
                        evidence: `"${variation}" found in title`,
                        method: 'heuristic'
                    }
                };
            }
        }
    }
    
    return {};
}

// STEP 2: Full deterministic parsing
function parsePage1Deterministic(page1Text, fileName) {
    const extractedData = {};
    
    // 2.1: Parse date + document type
    const dateTypeData = parseDateAndType(page1Text);
    Object.assign(extractedData, dateTypeData);
    
    // 2.2: Parse title
    const titleData = parseTitle(page1Text);
    Object.assign(extractedData, titleData);
    
    // 2.3: Extract region (needs title first)
    const titleText = titleData.title?.value || '';
    const regionData = parseRegion(titleText, page1Text);
    Object.assign(extractedData, regionData);
    
    // Detect Mintel publisher
    const isMintel = page1Text.toLowerCase().includes('mintel') ||
                     fileName.toLowerCase().includes('mintel');
    if (isMintel) {
        extractedData.publisher = {
            value: 'Mintel',
            confidence: 0.95,
            evidence: 'Mintel branding detected',
            method: 'heuristic'
        };
        extractedData.source_type = {
            value: 'mintel',
            confidence: 0.95,
            evidence: 'publisher detection',
            method: 'heuristic'
        };
    }
    
    return extractedData;
}

// STEP 3: LLM fallback (only for missing fields)
async function llmFallbackExtraction(page1Text, fileName, base44) {
    const extractedData = {};
    
    const llmPrompt = `You are extracting metadata from a PDF report's first page. Return ONLY a JSON object.

CONTROLLED VOCABULARIES:
- region: One of [APAC, EMEA, NORTH AMERICA, LATIN AMERICA, MIDDLE EAST & AFRICA, Global]
- document_type: One of [REPORT, INDUSTRY TREND, WEBINAR, PRESENTATION, WHITEPAPER, OTHER]
- category: One of [Bakery, Confectionery, Dairy, Feed, Fine Food, Ice Cream, Lipid, Meat, Other Food Applications, PCI, Polymer, Tech]
- main_group: Either "Food" or "BSA" (BSA includes: PCI, Polymer, Tech; Food is everything else)

PAGE 1 TEXT:
${page1Text}

FILENAME: ${fileName}

Extract ONLY the fields you can confidently determine. For each field, provide:
- value
- confidence (0.0 to 1.0)
- evidence (exact quote from text)

If you cannot confidently extract a field, do not include it.`;

    try {
        const llmResult = await base44.integrations.Core.InvokeLLM({
            prompt: llmPrompt,
            response_json_schema: {
                type: 'object',
                properties: {
                    date_published: { type: 'object', properties: { value: {type: 'string'}, confidence: {type: 'number'}, evidence: {type: 'string'} } },
                    document_type: { type: 'object', properties: { value: {type: 'string'}, confidence: {type: 'number'}, evidence: {type: 'string'} } },
                    title: { type: 'object', properties: { value: {type: 'string'}, confidence: {type: 'number'}, evidence: {type: 'string'} } },
                    region: { type: 'object', properties: { value: {type: 'string'}, confidence: {type: 'number'}, evidence: {type: 'string'} } },
                    subtitle: { type: 'object', properties: { value: {type: 'string'}, confidence: {type: 'number'}, evidence: {type: 'string'} } },
                    category: { type: 'object', properties: { value: {type: 'string'}, confidence: {type: 'number'}, evidence: {type: 'string'} } },
                    main_group: { type: 'object', properties: { value: {type: 'string'}, confidence: {type: 'number'}, evidence: {type: 'string'} } }
                }
            }
        });
        
        // Add method: 'LLM' to each extracted field
        for (const [field, data] of Object.entries(llmResult)) {
            if (data && data.value) {
                extractedData[field] = {
                    ...data,
                    method: 'LLM'
                };
            }
        }
    } catch (error) {
        console.error('LLM fallback failed:', error);
    }
    
    return extractedData;
}

// ==================== HELPER FUNCTIONS ====================

function convertToISODate(dateStr) {
    // Convert "6 NOVEMBER 2025" to "2025-11-06"
    const months = {
        'JANUARY': '01', 'FEBRUARY': '02', 'MARCH': '03', 'APRIL': '04',
        'MAY': '05', 'JUNE': '06', 'JULY': '07', 'AUGUST': '08',
        'SEPTEMBER': '09', 'OCTOBER': '10', 'NOVEMBER': '11', 'DECEMBER': '12'
    };
    
    const match = dateStr.match(/(\d{1,2})\s+([A-Z]+)\s+(\d{4})/i);
    if (!match) return null;
    
    const day = match[1].padStart(2, '0');
    const month = months[match[2].toUpperCase()];
    const year = match[3];
    
    if (!month) return null;
    
    return `${year}-${month}-${day}`;
}

function normalizeDocumentType(typeStr) {
    const normalized = typeStr.trim().toUpperCase();
    const validTypes = ['REPORT', 'INDUSTRY TREND', 'WEBINAR', 'PRESENTATION', 'WHITEPAPER'];
    
    for (const validType of validTypes) {
        if (normalized.includes(validType)) {
            return validType;
        }
    }
    
    return 'OTHER';
}

// ==================== EXCEL/CSV EXTRACTION (unchanged) ====================

async function extractFromExcel(fileUrl, fileName, base44) {
    const extractedData = {};
    
    const response = await fetch(fileUrl);
    const arrayBuffer = await response.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer);
    
    // Extract title from filename
    const titleMatch = fileName.match(/^(.+?)\.(xlsx|xls|csv)$/i);
    if (titleMatch) {
        extractedData.title = {
            value: titleMatch[1].replace(/-|_/g, ' ').trim(),
            confidence: 0.85,
            evidence: 'filename',
            method: 'regex'
        };
    }
    
    // Check for GNPD export
    const searchDetailsSheet = workbook.Sheets['Search Details'];
    if (searchDetailsSheet) {
        extractedData.source_type = {
            value: 'gnpd',
            confidence: 0.95,
            evidence: '"Search Details" tab present',
            method: 'heuristic'
        };
        extractedData.publisher = {
            value: 'GNPD',
            confidence: 0.95,
            evidence: 'GNPD export structure',
            method: 'heuristic'
        };
        
        // Extract region and category from Search Details
        const searchData = XLSX.utils.sheet_to_json(searchDetailsSheet, { header: 1 });
        for (const row of searchData) {
            if (row[0] && row[0].toString().toLowerCase().includes('region')) {
                const region = mapRegion(row[1]?.toString());
                if (region) {
                    extractedData.region = {
                        value: region,
                        confidence: 0.9,
                        evidence: `Search Details tab: ${row[1]}`,
                        method: 'heuristic'
                    };
                }
            }
            if (row[0] && row[0].toString().toLowerCase().includes('category')) {
                extractedData.category = {
                    value: row[1]?.toString() || 'Other Food Applications',
                    confidence: 0.85,
                    evidence: `Search Details tab: ${row[1]}`,
                    method: 'heuristic'
                };
            }
        }
    }
    
    return extractedData;
}

// ==================== HTML EXTRACTION (unchanged) ====================

async function extractFromHTML(fileUrl, fileName, base44) {
    const extractedData = {};
    
    // Extract title from filename
    const titleMatch = fileName.match(/^(.+?)\.html?$/i);
    if (titleMatch) {
        extractedData.title = {
            value: titleMatch[1].replace(/-|_/g, ' ').trim(),
            confidence: 0.85,
            evidence: 'filename',
            method: 'regex'
        };
    }
    
    // Detect GNPD
    if (fileName.toLowerCase().includes('gnpd')) {
        extractedData.source_type = {
            value: 'gnpd',
            confidence: 0.9,
            evidence: 'filename contains "gnpd"',
            method: 'heuristic'
        };
        extractedData.publisher = {
            value: 'GNPD',
            confidence: 0.9,
            evidence: 'filename pattern',
            method: 'heuristic'
        };
    }
    
    return extractedData;
}

// ==================== VALIDATION ====================

function mapRegion(rawRegion) {
    if (!rawRegion) return null;
    const normalized = rawRegion.toString().toUpperCase();
    
    const regionMap = {
        'ASPAC': ['ASPAC', 'ASIA PACIFIC', 'APAC'],
        'AMERICAS': ['AMERICAS', 'NORTH AMERICA', 'SOUTH AMERICA'],
        'EMEC': ['EMEC', 'EUROPE', 'EMEA'],
        'IMEA': ['IMEA', 'MIDDLE EAST', 'AFRICA', 'INDIA'],
        'Global': ['GLOBAL', 'WORLDWIDE']
    };
    
    for (const [standard, variations] of Object.entries(regionMap)) {
        if (variations.some(v => normalized.includes(v))) {
            return standard;
        }
    }
    
    return null;
}