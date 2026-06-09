import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await req.json();
        // Can be called directly with a trend_id, or via entity automation payload
        const trendId = body.trend_id || body.event?.entity_id;

        if (!trendId) {
            return Response.json({ error: 'trend_id required' }, { status: 400 });
        }

        const result = await runOverlapDetection(base44, trendId);
        return Response.json(result);
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});

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

    // Fetch all other active trends in the SAME category
    const sameCategoryTrends = await base44.entities.GlobalTrend.filter({
        category: trend.category,
        is_active: true
    });

    const peers = sameCategoryTrends.filter(t => t.id !== trendId);
    if (peers.length === 0) {
        return { checked: 0, flags_written: 0 };
    }

    let flagsWritten = 0;
    const now = new Date().toISOString();

    for (const peer of peers) {
        const peerKeywords = (peer.trend_keywords || []).map(k => k.toLowerCase().trim()).filter(Boolean);
        if (peerKeywords.length === 0) continue;

        const shared = keywords.filter(k => peerKeywords.includes(k));
        const smallerSize = Math.min(keywords.length, peerKeywords.length);
        const overlapPct = shared.length / smallerSize;

        // Flag if ≥3 shared keywords OR ≥50% of smaller set overlaps
        if (shared.length >= 3 || overlapPct >= 0.5) {
            const overlapScore = Math.round((shared.length / smallerSize) * 100);

            // Update the current trend's overlap_flags
            await upsertOverlapFlag(base44, trend, peer.id, shared, overlapScore, now);
            // Update the peer's overlap_flags symmetrically
            await upsertOverlapFlag(base44, peer, trendId, shared, overlapScore, now);
            flagsWritten++;
        }
    }

    return { trend_id: trendId, category: trend.category, peers_checked: peers.length, flags_written: flagsWritten };
}

async function upsertOverlapFlag(base44, trend, overlappingId, sharedKeywords, score, now) {
    const existingFlags = (trend.overlap_flags || []);
    const existingIdx = existingFlags.findIndex(f => f.overlapping_trend_id === overlappingId);

    // Don't overwrite a human-resolved flag (confirmed_distinct / merge_recommended / resolved)
    if (existingIdx >= 0) {
        const existing = existingFlags[existingIdx];
        if (['confirmed_distinct', 'merge_recommended', 'resolved'].includes(existing.status)) {
            return; // Human already reviewed — leave it alone
        }
        // Update pending flag with fresh data
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

    await base44.entities.GlobalTrend.update(trend.id, { overlap_flags: existingFlags });
}