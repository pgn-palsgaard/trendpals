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
    account,
    region: region || undefined,
    deadline: deadline || undefined,
    categories: categories || undefined,
    purpose: purpose || undefined,
    challenges: challenges || undefined,
    notes: notes || undefined,
    status: 'new',
    submitted_at: new Date().toISOString(),
  });

  return Response.json({ success: true, id: record.id }, { status: 201, headers: corsHeaders });
});