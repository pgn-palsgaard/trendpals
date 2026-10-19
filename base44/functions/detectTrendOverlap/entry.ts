import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';

export default async function(req) {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        if (user.role !== 'admin') {
            return Response.json({ error: 'Forbidden' }, { status: 403 });
        }
        const body = await req.json();
        // Preserve the migrated workflow's legacy payload and direct-call support.
        // Ignore queued result-only updates when changed fields are supplied.
        const changedFields = body.event?.changed_fields || body.changed_fields;
        if (body.event?.type === 'update' && Array.isArray(changedFields) &&
            !changedFields.some(field => ['trend_keywords', 'category', 'is_active'].includes(field))) {
            return Response.json({ skipped: true, reason: 'Overlap inputs unchanged' });
        }
        // Can be called directly with a trend_id, or via entity automation payload
        const trendId = body.trend_id || body.event?.entity_id;

        if (!trendId) {
            return Response.json({ error: 'trend_id required' }, { status: 400 });
        }

        const result = await runOverlapDetection(base44.asServiceRole, trendId);
        return Response.json(result);
    } catch (error) {
        const status = error.status || error.response?.status;
        return Response.json({ error: error.message }, { status: status === 429 ? 429 : 500 });
    }
}

async function runOverlapDetection(base44, trendId) {
    // Fetch the trend being checked
    const trend = await base44.entities.GlobalTrend.get(trendId);
    if (!trend) {
        return { skipped: true, reason: 'Trend not found' };
    }

    // Must be active and have keywords + category
    if (!trend.is_active) {
        return { skipped: true, reason: 'Trend is not active' };
    }
    const keywords = (trend.trend_keywords || []).map(k => k.toLowerCase().trim()).filter(Boolean);
    if (keywords.length === 0 || !trend.category) {
        return { skipped: true, reason: 'No keywords or category' };
    }

    // Read one page at a time, restricted on the server to active category peers.
    let cursor;
    let peersChecked = 0;
    let flagsWritten = 0;
    let recordsUpdated = 0;
    let trendChanged = false;
    const now = new Date().toISOString();
    do {
        const page = await base44.entities.GlobalTrend.filter({
            category: trend.category, is_active: true, id: { $ne: trendId }
        }, {
            sort: 'id', limit: 50, cursor,
            fields: ['trend_keywords', 'overlap_flags']
        });
        const updates = [];
        for (const peer of page.items) {
            peersChecked++;
            const peerKeywords = (peer.trend_keywords || []).map(k => k.toLowerCase().trim()).filter(Boolean);
            if (peerKeywords.length === 0) continue;
            const shared = keywords.filter(k => peerKeywords.includes(k));
            const smallerSize = Math.min(keywords.length, peerKeywords.length);
            const overlapPct = shared.length / smallerSize;
            // Preserve the existing threshold and human review decisions.
            if (shared.length >= 3 || overlapPct >= 0.5) {
                const score = Math.round(overlapPct * 100);
                const currentChanged = upsertOverlapFlag(trend, peer.id, shared, score, now);
                const peerChanged = upsertOverlapFlag(peer, trendId, shared, score, now);
                trendChanged = currentChanged || trendChanged;
                if (peerChanged) updates.push({ id: peer.id, overlap_flags: peer.overlap_flags });
                if (currentChanged || peerChanged) flagsWritten++;
            }
        }
        // One write per changed peer, batched; bulk writes do not retrigger workflows.
        if (updates.length) {
            await base44.entities.GlobalTrend.bulkUpdate(updates);
            recordsUpdated += updates.length;
        }
        cursor = page.has_more ? page.next_cursor : null;
    } while (cursor);
    // Save the accumulated flags once, not once per matching peer.
    if (trendChanged) {
        await base44.entities.GlobalTrend.update(trendId, { overlap_flags: trend.overlap_flags });
        recordsUpdated++;
    }
    return { trend_id: trendId, category: trend.category, peers_checked: peersChecked,
        flags_written: flagsWritten, records_updated: recordsUpdated };
}

function upsertOverlapFlag(trend, overlappingId, sharedKeywords, score, now) {
    const existingFlags = [...(trend.overlap_flags || [])];
    sharedKeywords = [...sharedKeywords].sort();
    const existingIdx = existingFlags.findIndex(f => f.overlapping_trend_id === overlappingId);

    // Don't overwrite a human-resolved flag (confirmed_distinct / merge_recommended / resolved)
    if (existingIdx >= 0) {
        const existing = existingFlags[existingIdx];
        if (['confirmed_distinct', 'merge_recommended', 'resolved'].includes(existing.status)) {
            return false; // Human already reviewed — leave it alone
        }
        if (existing.status === 'pending' && existing.overlap_score === score &&
            JSON.stringify([...(existing.shared_keywords || [])].sort()) === JSON.stringify(sharedKeywords)) {
            return false; // Identical evidence: preserve timestamp and avoid another write.
        }
        // Update pending flag only when its evidence has changed
        existingFlags[existingIdx] = {
            ...existing,
            overlap_score: score,
            shared_keywords: sharedKeywords,
            detected_at: now,
            status: 'pending'
        };
    } else {
        existingFlags.push({
            overlapping_trend_id: overlappingId,
            overlap_score: score,
            shared_keywords: sharedKeywords,
            detected_at: now,
            status: 'pending'
        });
    }

    trend.overlap_flags = existingFlags;
    return true;
}