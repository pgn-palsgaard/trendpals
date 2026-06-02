import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  // Allow CORS for external form submissions
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return Response.json({ error: 'Method not allowed' }, { status: 405, headers: corsHeaders });
  }

  const base44 = createClientFromRequest(req);

  const body = await req.json();
  console.log('Incoming request body:', body);

  const {
    requester_name,
    requester_email,
    account,
    region,
    deadline,
    categories,
    purpose,
    challenges,
    notes,
    report_type,
    pains,
    context,
    region_zoom,
    contact_name,
    submitted_at,
  } = body;

  if (!requester_name || !requester_email || !account) {
    return Response.json(
      { success: false, error: 'requester_name, requester_email, and account are required' },
      { status: 400, headers: corsHeaders }
    );
  }

  const record = await base44.asServiceRole.entities.ReportRequest.create({
    requester_name,
    requester_email,
    account: account || '',
    region,
    deadline: deadline || null,
    categories,
    purpose,
    challenges,
    notes,
    report_type: report_type || 'category',
    pains: pains || '',
    context: context || '',
    region_zoom: region_zoom || '',
    contact_name: contact_name || '',
    status: 'new',
    submitted_at: submitted_at || new Date().toISOString(),
  });

  return Response.json({ success: true, id: record.id }, { status: 201, headers: corsHeaders });
});