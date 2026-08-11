import { base44 } from '@/api/base44Client';
import { sendReviewNotificationEmail } from '@/lib/sendReviewEmail';

/**
 * Single shared dispatch code path for SME challenge assignment.
 * Used by both entry points: challenge-first (Review Queue) and person-first (Users page).
 *
 * IMMUTABLE RULE: only dispatcher-set fields are written here.
 * SME-set fields (verdict, comment, suggested_capability_fit, responded_at) are never touched.
 */
export async function dispatchAssignments({
  challenges,
  reviewers,          // [{ name, email }]
  region,             // canonical region key
  dispatchedBy,
  existingAssignments = [],
  trendMap = {},
  appUrl = window.location.origin,
}) {
  const newlyAssignedPerReviewer = {};
  let created = 0;
  let skipped = 0;
  const writeErrors = [];

  for (const challenge of challenges) {
    for (const reviewer of reviewers) {
      const emailKey = reviewer.email.trim().toLowerCase();

      const existing = existingAssignments.find(a =>
        a.challenge_id === challenge.id &&
        a.reviewer_email === emailKey &&
        a.status !== 'responded'
      );
      if (existing) { skipped++; continue; }

      const payload = {
        challenge_id: challenge.id,
        challenge_name: challenge.name,
        global_trend_id: challenge.global_trend_id || undefined,
        category: challenge.category || undefined,
        reviewer_email: emailKey,
        reviewer_name: (reviewer.name || '').trim() || undefined,
        reviewer_region: region,
        assigned_by: dispatchedBy,
        assigned_at: new Date().toISOString(),
        status: 'sent',
      };
      Object.keys(payload).forEach(k => payload[k] === undefined && delete payload[k]);

      const createdRec = await base44.entities.ReviewAssignment.create(payload);

      // Read-back confirmation
      const readBack = await base44.entities.ReviewAssignment.filter({ id: createdRec.id });
      const rec = readBack[0];
      if (!rec || rec.status !== 'sent') {
        writeErrors.push(`${challenge.name} → ${reviewer.email}`);
        continue;
      }

      created++;
      if (!newlyAssignedPerReviewer[emailKey]) {
        newlyAssignedPerReviewer[emailKey] = { reviewer, challenges: [] };
      }
      newlyAssignedPerReviewer[emailKey].challenges.push(challenge);
    }
  }

  // Ensure each new reviewer is a 'reviewer'-role user (gated to /review).
  for (const emailKey of Object.keys(newlyAssignedPerReviewer)) {
    try {
      await base44.users.inviteUser(emailKey, 'reviewer');
    } catch {
      // Already a user, or invite not permitted — assignment + email still proceed.
    }
  }

  const failedEmails = [];
  const pendingEmails = [];

  for (const [emailKey, { reviewer, challenges: assigned }] of Object.entries(newlyAssignedPerReviewer)) {
    const enrichedChallenges = assigned.map(c => ({
      name: c.name,
      category: c.category,
      trend_name: c.global_trend_id ? trendMap[c.global_trend_id]?.trend_name : undefined,
    }));

    try {
      await sendReviewNotificationEmail({
        reviewerEmail: emailKey,
        reviewerName: (reviewer.name || '').trim() || undefined,
        dispatchedBy,
        challenges: enrichedChallenges,
        appUrl,
      });
    } catch (err) {
      const msg = (err?.response?.data?.error || err?.message || '').toLowerCase();
      if (msg.includes('outside the app')) pendingEmails.push(emailKey);
      else {
        failedEmails.push(emailKey);
        console.error(`Failed to send email to ${emailKey}:`, err);
      }
    }
  }

  return { created, skipped, failedEmails, pendingEmails, writeErrors };
}