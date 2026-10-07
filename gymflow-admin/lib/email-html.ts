/**
 * The HTML version of a support reply, dressed like the product emails (the Resend
 * templates): white card on the pale blue ground, the GymFlow landscape logo on top, brand
 * blue for the accent. The plain-text part is sent alongside it unchanged, so clients that
 * show text only still get the full message.
 *
 * The logo is the one the product templates use, served from the public `assets` bucket.
 * It is a PNG on purpose: Gmail and Outlook do not render SVG in email.
 */
const DEFAULT_LOGO_URL =
  'https://lrzacwfypnsnjqyhidpn.supabase.co/storage/v1/object/public/assets/logo_landspace_without_bg.png'

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** Escaped text with http(s) addresses made clickable; nothing else is interpreted as markup. */
function bodyHtml(text: string): string {
  return escapeHtml(text).replace(
    /\bhttps?:\/\/[^\s<]+/gi,
    url => `<a href="${url}" style="color:#1D8CFF;text-decoration:none;">${url}</a>`,
  )
}

export function renderReplyHtml(text: string): string {
  const logo = process.env.SUPPORT_EMAIL_LOGO_URL || DEFAULT_LOGO_URL
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light only">
  <meta name="supported-color-schemes" content="light">
</head>
<body style="margin:0;padding:0;background:#F3F7FF;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#F3F7FF">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:20px;border:1px solid #E6EDFF;">
          <tr>
            <td align="center" style="padding:36px 40px 12px;text-align:center;">
              <img src="${escapeHtml(logo)}" width="220" alt="GymFlow" style="display:block;margin:0 auto;border:0;max-width:220px;width:100%;height:auto;">
            </td>
          </tr>
          <tr>
            <td style="padding:16px 40px 32px;">
              <div style="white-space:pre-wrap;color:#334155;font-size:16px;line-height:26px;">${bodyHtml(text)}</div>
            </td>
          </tr>
          <tr>
            <td style="padding:0 40px;"><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td height="1" bgcolor="#EAEFF8"></td></tr></table></td>
          </tr>
          <tr>
            <td style="padding:20px 40px 28px;color:#94A3B8;font-size:13px;line-height:20px;">
              Reply to this email and we will get back to you.<br>
              <a href="https://www.gymflow.sbs" style="color:#1D8CFF;text-decoration:none;">www.gymflow.sbs</a> &middot; support@gymflow.sbs
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}
