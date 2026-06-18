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
  const subject = count === 1
    ? `1 challenge for your review`
    : `${count} challenges for your review`;

  const greeting = reviewerName ? `Hi ${reviewerName.split(' ')[0]},` : 'Hi,';
  const reviewUrl = `${appUrl}/SMEReviewQueue`;

  const challengeRows = challenges.map(c => {
    const catLabel = c.category ? c.category.replace(/_/g, ' ') : '';
    const trendLine = c.trend_name ? `<span style="color:#6B7280;font-size:13px;"> — ${c.trend_name}${catLabel ? ` (${catLabel})` : ''}</span>` : (catLabel ? `<span style="color:#6B7280;font-size:13px;"> — ${catLabel}</span>` : '');
    return `
      <tr>
        <td style="padding:8px 0;border-bottom:1px solid #EAE6DD;vertical-align:top;">
          <span style="font-size:14px;color:#1D2B47;font-weight:500;">• ${c.name}</span>${trendLine}
        </td>
      </tr>`;
  }).join('');

  const body = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1.0" />
</head>
<body style="margin:0;padding:0;background:#F7F4EE;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F7F4EE;padding:40px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width:600px;background:#FFFFFF;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(29,43,71,0.08);">

          <!-- Header -->
          <tr>
            <td style="background:#1D428A;padding:28px 40px;">
              <img src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/6987a5428ef229e6ee55cbb6/16cea8b8e_Palsgaardlogo_blue_250x250.png"
                   alt="Palsgaard" width="120" style="display:block;filter:brightness(0) invert(1);" />
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:36px 40px 0 40px;">
              <p style="margin:0 0 8px 0;font-size:22px;font-weight:600;color:#1D2B47;line-height:1.3;">${subject}</p>
              <p style="margin:0 0 24px 0;font-size:15px;color:#1D2B47;">${greeting}</p>
              <p style="margin:0 0 24px 0;font-size:15px;color:#374151;line-height:1.6;">
                ${dispatchedBy} has asked for your expert input to help validate ${count === 1 ? 'an industry challenge' : 'a set of industry challenges'}.
                Your review helps us assess whether these challenges represent real market opportunities for Palsgaard.
              </p>

              <!-- Challenge list -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
                <thead>
                  <tr>
                    <th style="text-align:left;font-size:11px;font-weight:600;color:#6B7280;letter-spacing:0.08em;text-transform:uppercase;padding-bottom:8px;border-bottom:2px solid #EAE6DD;">
                      ${count === 1 ? 'Challenge' : `${count} challenges`}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  ${challengeRows}
                </tbody>
              </table>

              <!-- CTA button -->
              <table role="presentation" cellpadding="0" cellspacing="0" style="margin-bottom:32px;">
                <tr>
                  <td style="border-radius:8px;background:#1D428A;">
                    <a href="${reviewUrl}"
                       style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:600;color:#FFFFFF;text-decoration:none;border-radius:8px;letter-spacing:-0.01em;">
                      Go to my review queue →
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 32px 0;font-size:14px;color:#6B7280;line-height:1.6;">
                If you have any questions, please reply to this email or reach out to ${dispatchedBy} directly.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:20px 40px;border-top:1px solid #EAE6DD;">
              <p style="margin:0;font-size:12px;color:#9CA3AF;">
                Palsgaard A/S · TrendPals internal platform
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