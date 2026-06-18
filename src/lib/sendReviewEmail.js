import { base44 } from '@/api/base44Client';

/**
 * Builds and sends a consolidated SME review notification email.
 *
 * @param {object} opts
 * @param {string} opts.reviewerEmail   - Recipient email address
 * @param {string} [opts.reviewerName]  - Recipient display name (optional)
 * @param {string} opts.dispatchedBy    - Name/email of the admin who dispatched
 * @param {Array}  opts.challenges      - Array of { name, category, trend_name? } objects
 * @param {string} opts.appUrl          - Base URL of this app (window.location.origin)
 * @returns {Promise<void>}             - Resolves on success, throws on failure
 */
export async function sendReviewNotificationEmail({ reviewerEmail, reviewerName, dispatchedBy, challenges, appUrl }) {
  const count = challenges.length;
  const challengeWord = count === 1 ? 'challenge' : 'challenges';
  const subject = `${count} ${challengeWord} for your review`;
  const reviewUrl = `${appUrl}/SMEReviewQueue`;

  // Build per-challenge rows for the {{#each challenges}} block
  const challengeRows = challenges.map(c => {
    const catLabel = c.category ? c.category.replace(/_/g, ' ') : '';
    const trendLine = [c.trend_name, catLabel].filter(Boolean).join(' · ');
    const raw = c.description || '';
    const descOneLine = raw.length > 120
      ? raw.slice(0, raw.lastIndexOf(' ', 120) || 120).trimEnd() + '…'
      : raw;

    return `
  <tr>
    <td style="background-color:#FFFFFF; padding:0 28px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#F7F4EE; border-radius:10px;">
        <tr>
          <td style="padding:16px 18px;">
            <p style="margin:0 0 5px 0; font-family:Arial,Helvetica,sans-serif; font-size:15px; line-height:1.4; font-weight:bold; color:#1D2B47;">${c.name}</p>
            <p style="margin:0 0 8px 0; font-family:Arial,Helvetica,sans-serif; font-size:12px; line-height:1.4; color:#6F7B90;">${trendLine}</p>
            <p style="margin:0; font-family:Arial,Helvetica,sans-serif; font-size:13px; line-height:1.5; color:#3A4A66;">${descOneLine}</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
  <tr><td style="background-color:#FFFFFF; height:12px; line-height:12px; font-size:12px;">&nbsp;</td></tr>`;
  }).join('');

  const body = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Review notification</title>
</head>
<body style="margin:0; padding:0; background-color:#F7F4EE;">
<div style="display:none; max-height:0; overflow:hidden; opacity:0;">${reviewerName}, ${dispatchedBy} would value your expert view on ${count} ${challengeWord}.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#F7F4EE;">
<tr>
<td align="center" style="padding:32px 16px;">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="width:560px; max-width:560px;">
  <tr>
    <td style="background-color:#1D428A; border-radius:14px 14px 0 0; padding:18px 28px;">
      <span style="font-family:Georgia,'Times New Roman',serif; font-size:20px; font-weight:bold; color:#FFFFFF; letter-spacing:0.3px;">Palsgaard<span style="font-size:11px; vertical-align:super;">&reg;</span></span>
      <span style="font-family:Arial,Helvetica,sans-serif; font-size:12px; color:#C7D2E8; padding-left:10px;">TrendPals</span>
    </td>
  </tr>
  <tr>
    <td style="background-color:#FFFFFF; padding:32px 28px 12px 28px;">
      <h1 style="margin:0 0 16px 0; font-family:Georgia,'Times New Roman',serif; font-size:23px; line-height:1.3; font-weight:bold; color:#1D2B47;">${count} ${challengeWord} for your review</h1>
      <p style="margin:0 0 8px 0; font-family:Arial,Helvetica,sans-serif; font-size:15px; line-height:1.6; color:#1D2B47;">Hi ${reviewerName || 'there'},</p>
      <p style="margin:0 0 24px 0; font-family:Arial,Helvetica,sans-serif; font-size:15px; line-height:1.6; color:#3A4A66;">${dispatchedBy} would value your expert view on the ${challengeWord} below — your read tells us whether each one is a real, addressable opportunity.</p>
    </td>
  </tr>
  ${challengeRows}
  <tr>
    <td style="background-color:#FFFFFF; padding:16px 28px 28px 28px;">
      <table role="presentation" cellpadding="0" cellspacing="0">
        <tr>
          <td align="center" style="background-color:#1D428A; border-radius:8px;">
            <a href="${reviewUrl}" style="display:inline-block; padding:13px 26px; font-family:Arial,Helvetica,sans-serif; font-size:15px; font-weight:bold; color:#FFFFFF; text-decoration:none;">Open my review queue &rarr;</a>
          </td>
        </tr>
      </table>
    </td>
  </tr>
  <tr>
    <td style="background-color:#FFFFFF; border-radius:0 0 14px 14px; padding:4px 28px 28px 28px;">
      <p style="margin:0; font-family:Arial,Helvetica,sans-serif; font-size:13px; line-height:1.6; color:#6F7B90;">Questions? Reach out to ${dispatchedBy} directly.</p>
    </td>
  </tr>
  <tr>
    <td style="padding:20px 28px 0 28px;" align="center">
      <p style="margin:0; font-family:Arial,Helvetica,sans-serif; font-size:11px; line-height:1.5; color:#A8AEBB;">Palsgaard A/S &middot; TrendPals internal platform</p>
    </td>
  </tr>
</table>
</td>
</tr>
</table>
</body>
</html>`;

  await base44.integrations.Core.SendEmail({
    to: reviewerEmail,
    subject,
    body,
    from_name: 'Palsgaard TrendPals',
  });
}