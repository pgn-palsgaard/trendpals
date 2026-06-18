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

  const firstName = reviewerName ? reviewerName.split(' ')[0] : null;
  const greeting = firstName ? `Hi ${firstName},` : 'Hi,';
  const reviewUrl = `${appUrl}/SMEReviewQueue`;

  // Per-challenge cards: name (bold), trend + category (muted sub-line), truncated description
  const challengeCards = challenges.map((c, i) => {
    const catLabel = c.category ? c.category.replace(/_/g, ' ') : '';
    const subLine = [c.trend_name, catLabel].filter(Boolean).join(' · ');
    const desc = c.description
      ? (c.description.length > 120 ? c.description.slice(0, 117).trimEnd() + '…' : c.description)
      : '';
    const isLast = i === challenges.length - 1;
    return `
      <tr>
        <td style="padding:14px 16px;background:#FAFAF8;border-radius:8px;${isLast ? '' : 'margin-bottom:8px;'}vertical-align:top;">
          <p style="margin:0 0 2px 0;font-size:14px;font-weight:600;color:#1D2B47;line-height:1.4;">${c.name}</p>
          ${subLine ? `<p style="margin:0 0 ${desc ? '6px' : '0'} 0;font-size:12px;color:#8A8A8A;line-height:1.4;">${subLine}</p>` : ''}
          ${desc ? `<p style="margin:0;font-size:13px;color:#4B5563;line-height:1.5;">${desc}</p>` : ''}
        </td>
      </tr>
      ${!isLast ? '<tr><td style="height:8px;"></td></tr>' : ''}`;
  }).join('');

  const body = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1.0" />
</head>
<body style="margin:0;padding:0;background:#F7F4EE;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F7F4EE;padding:36px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width:580px;">

          <!-- Slim header bar -->
          <tr>
            <td style="background:#1D428A;border-radius:10px 10px 0 0;padding:14px 28px;">
              <img src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/6987a5428ef229e6ee55cbb6/16cea8b8e_Palsgaardlogo_blue_250x250.png"
                   alt="Palsgaard" width="96" style="display:block;filter:brightness(0) invert(1);" />
            </td>
          </tr>

          <!-- White content card -->
          <tr>
            <td style="background:#FFFFFF;border-radius:0 0 10px 10px;padding:32px 36px 28px 36px;box-shadow:0 2px 10px rgba(29,43,71,0.09);">

              <!-- Greeting + context -->
              <p style="margin:0 0 6px 0;font-size:13px;font-weight:600;color:#1D2B47;letter-spacing:0.04em;text-transform:uppercase;">${count} ${challengeWord} for your review</p>
              <p style="margin:0 0 20px 0;font-size:22px;font-weight:600;color:#1D2B47;line-height:1.25;">${greeting}</p>
              <p style="margin:0 0 28px 0;font-size:15px;color:#374151;line-height:1.65;">
                ${dispatchedBy} would value your expert view on ${count === 1 ? 'the industry challenge' : `these ${count} industry challenges`} below — your read tells us whether ${count === 1 ? 'it is' : 'each is'} a real, addressable opportunity.
              </p>

              <!-- Per-challenge cards -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:30px;">
                <tbody>
                  ${challengeCards}
                </tbody>
              </table>

              <!-- CTA button -->
              <table role="presentation" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
                <tr>
                  <td style="border-radius:8px;background:#1D428A;">
                    <a href="${reviewUrl}"
                       style="display:inline-block;padding:13px 26px;font-size:15px;font-weight:600;color:#FFFFFF;text-decoration:none;border-radius:8px;letter-spacing:-0.01em;">
                      Open my review queue
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:0;font-size:13px;color:#9CA3AF;line-height:1.6;">
                Questions? Reach out to ${dispatchedBy} directly.
              </p>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:18px 0 0 0;">
              <p style="margin:0;font-size:11px;color:#B0A898;text-align:center;">
                Palsgaard A/S &middot; TrendPals internal platform
              </p>
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