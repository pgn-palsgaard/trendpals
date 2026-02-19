import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import * as XLSX from 'npm:xlsx';

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

        // Extract metadata based on file type
        const fileUrl = source.file_url;
        const fileName = source.title || '';
        const fileExtension = fileName.split('.').pop()?.toLowerCase();

        try {
            if (fileExtension === 'pdf') {
                // Extract metadata from PDF
                const pdfMetadata = await extractFromPDF(fileUrl, fileName, base44);
                Object.assign(extractedData, pdfMetadata);
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
                if (!extractedData[field] || extractedData[field].confidence < 0.8) {
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
                    extracted_data: extractedData,
                    missing_fields: missingFields,
                    last_attempted: new Date().toISOString()
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

// Helper: Extract metadata from PDF
async function extractFromPDF(fileUrl, fileName, base44) {
    const extractedData = {};

    // Fetch PDF content
    const response = await fetch(fileUrl);
    const arrayBuffer = await response.arrayBuffer();
    const textContent = await extractTextFromPDF(arrayBuffer);

    // Extract title
    const titleMatch = fileName.match(/^(.+?)\.pdf$/i);
    if (titleMatch) {
        extractedData.title = {
            value: titleMatch[1].replace(/-|_/g, ' ').trim(),
            confidence: 0.9,
            evidence: 'filename'
        };
    }

    // Extract coverage period from filename or text
    const yearMatch = fileName.match(/\b(20\d{2})\b/) || textContent.match(/\b(20\d{2})\b/);
    if (yearMatch) {
        extractedData.coverage_period = {
            value: yearMatch[1],
            confidence: 0.85,
            evidence: yearMatch[0] === fileName.match(/\b(20\d{2})\b/)?.[0] ? 'filename' : 'document text'
        };
    }

    // Detect publisher
    if (fileName.toLowerCase().includes('mintel') || textContent.toLowerCase().includes('mintel')) {
        extractedData.publisher = {
            value: 'Mintel',
            confidence: 0.95,
            evidence: 'filename/content'
        };
        extractedData.source_type = {
            value: 'mintel',
            confidence: 0.95,
            evidence: 'publisher detection'
        };
    }

    // Use LLM to extract region, category, and other metadata
    const llmPrompt = `Extract metadata from this document excerpt. Return ONLY a JSON object with these fields:
- region (one of: ASPAC, AMERICAS, EMEC, IMEA, Global)
- category (one of: Bakery, Confectionery, Dairy, Feed, Fine Food, Ice Cream, Lipid, Meat, Other Food Applications, PCI, Polymer, Tech)
- main_group (Food or BSA)
- publisher (e.g., Mintel, GNPD, Other/Unknown)

Document title: ${fileName}
First 3000 characters: ${textContent.substring(0, 3000)}

Only include fields you can confidently extract. If uncertain, omit the field.`;

    const llmResult = await base44.integrations.Core.InvokeLLM({
        prompt: llmPrompt,
        response_json_schema: {
            type: 'object',
            properties: {
                region: { type: 'string' },
                category: { type: 'string' },
                main_group: { type: 'string' },
                publisher: { type: 'string' }
            }
        }
    });

    // Add LLM-extracted fields
    for (const [field, value] of Object.entries(llmResult)) {
        if (value && !extractedData[field]) {
            extractedData[field] = {
                value: value,
                confidence: 0.75,
                evidence: 'LLM analysis of document content'
            };
        }
    }

    return extractedData;
}

// Helper: Extract text from PDF (simplified - returns first page text)
async function extractTextFromPDF(arrayBuffer) {
    // For a production system, you'd use a proper PDF parser
    // For now, convert buffer to string and extract visible text
    const decoder = new TextDecoder('utf-8');
    const text = decoder.decode(arrayBuffer);
    
    // Basic extraction - look for readable text between stream objects
    const textMatches = text.match(/\(([^)]+)\)/g);
    if (textMatches) {
        return textMatches.map(m => m.slice(1, -1)).join(' ').substring(0, 5000);
    }
    
    return text.substring(0, 5000);
}

// Helper: Extract metadata from Excel/CSV
async function extractFromExcel(fileUrl, fileName, base44) {
    const extractedData = {};

    // Fetch file
    const response = await fetch(fileUrl);
    const arrayBuffer = await response.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer);

    // Extract title from filename
    const titleMatch = fileName.match(/^(.+?)\.(xls|xlsx|csv)$/i);
    if (titleMatch) {
        extractedData.title = {
            value: titleMatch[1].replace(/-|_/g, ' ').trim(),
            confidence: 0.9,
            evidence: 'filename'
        };
    }

    // Check if this is a GNPD export
    if (fileName.toLowerCase().includes('gnpd')) {
        extractedData.source_type = {
            value: 'gnpd',
            confidence: 0.95,
            evidence: 'filename'
        };
        extractedData.publisher = {
            value: 'GNPD',
            confidence: 0.95,
            evidence: 'filename'
        };
    }

    // Look for "Search Details" tab
    const searchDetailsSheet = workbook.Sheets['Search Details'];
    if (searchDetailsSheet) {
        const searchDetailsData = XLSX.utils.sheet_to_txt(searchDetailsSheet);
        
        // Extract region
        const regionMatch = searchDetailsData.match(/Region matches ([^\n]+)/i);
        if (regionMatch) {
            const regionText = regionMatch[1].trim();
            const region = mapRegion(regionText);
            if (region) {
                extractedData.region = {
                    value: region,
                    confidence: 0.9,
                    evidence: 'Search Details tab'
                };
            }
        }

        // Extract category
        const categoryMatch = searchDetailsData.match(/Sub-Category matches ([^\n]+?)(?:\s+and|$)/i);
        if (categoryMatch) {
            const categoryText = categoryMatch[1].trim();
            const category = mapCategory(categoryText);
            if (category) {
                extractedData.category = {
                    value: category,
                    confidence: 0.85,
                    evidence: 'Search Details tab'
                };
            }
        }

        // Extract date/period
        const dateMatch = searchDetailsData.match(/Date Published matches ([^\n]+)/i);
        if (dateMatch) {
            extractedData.coverage_period = {
                value: dateMatch[1].trim(),
                confidence: 0.8,
                evidence: 'Search Details tab'
            };
        }
    }

    // Extract coverage period from filename
    const yearMatch = fileName.match(/\b(20\d{2})\b/);
    if (yearMatch && !extractedData.coverage_period) {
        extractedData.coverage_period = {
            value: yearMatch[1],
            confidence: 0.85,
            evidence: 'filename'
        };
    }

    return extractedData;
}

// Helper: Extract metadata from HTML
async function extractFromHTML(fileUrl, fileName, base44) {
    const extractedData = {};

    // Fetch HTML content
    const response = await fetch(fileUrl);
    const htmlText = await response.text();

    // Extract title from filename
    const titleMatch = fileName.match(/^(.+?)\.html?$/i);
    if (titleMatch) {
        extractedData.title = {
            value: titleMatch[1].replace(/-|_/g, ' ').trim(),
            confidence: 0.9,
            evidence: 'filename'
        };
    }

    // Check for GNPD
    if (fileName.toLowerCase().includes('gnpd') || htmlText.toLowerCase().includes('gnpd')) {
        extractedData.source_type = {
            value: 'gnpd',
            confidence: 0.9,
            evidence: 'filename/content'
        };
        extractedData.publisher = {
            value: 'GNPD',
            confidence: 0.9,
            evidence: 'filename/content'
        };
    }

    return extractedData;
}

// Helper: Map region text to enum value
function mapRegion(text) {
    const regionMap = {
        'asia pacific': 'ASPAC',
        'asia': 'ASPAC',
        'australia': 'ASPAC',
        'new zealand': 'ASPAC',
        'americas': 'AMERICAS',
        'north america': 'AMERICAS',
        'south america': 'AMERICAS',
        'latin america': 'AMERICAS',
        'europe': 'EMEC',
        'emea': 'EMEC',
        'middle east': 'IMEA',
        'africa': 'IMEA',
        'india': 'IMEA',
        'global': 'Global'
    };

    const lowerText = text.toLowerCase();
    for (const [key, value] of Object.entries(regionMap)) {
        if (lowerText.includes(key)) {
            return value;
        }
    }

    return null;
}

// Helper: Map category text to enum value
function mapCategory(text) {
    const categoryMap = {
        'bakery': 'Bakery',
        'confectionery': 'Confectionery',
        'dairy': 'Dairy',
        'ice cream': 'Ice Cream',
        'frozen yogurt': 'Ice Cream',
        'feed': 'Feed',
        'fine food': 'Fine Food',
        'lipid': 'Lipid',
        'meat': 'Meat',
        'pci': 'PCI',
        'polymer': 'Polymer',
        'tech': 'Tech'
    };

    const lowerText = text.toLowerCase();
    for (const [key, value] of Object.entries(categoryMap)) {
        if (lowerText.includes(key)) {
            return value;
        }
    }

    return 'Other Food Applications';
}