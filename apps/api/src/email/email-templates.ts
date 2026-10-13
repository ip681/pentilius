// Transactional email texts (owner decision, 2026-10-13). Rendered on the
// server, so they live here (bg/en) rather than in the web message files —
// same reasoning as the push texts. Every text cell sets its own colour —
// mail clients (e.g. Gmail) don't inherit it from <body>, and dark-on-dark
// text became unreadable.

export type EmailLocale = 'bg' | 'en';
type Kind = 'verify' | 'reset';

const TEXTS: Record<EmailLocale, Record<Kind, { subject: string; heading: string; body: string; button: string; footer: string }>> = {
  bg: {
    verify: {
      subject: 'Потвърди имейла си в Pentilius',
      heading: 'Здравей, {username}!',
      body: 'Натисни бутона, за да потвърдиш, че този имейл е твой. Така ще можеш да възстановиш акаунта си, ако забравиш паролата.',
      button: 'Потвърди имейла',
      footer: 'Линкът е валиден 3 дни. Ако не си се регистрирал(а) в Pentilius, просто игнорирай това писмо.',
    },
    reset: {
      subject: 'Нова парола за Pentilius',
      heading: 'Здравей, {username}!',
      body: 'Получихме заявка за нова парола за акаунта ти. Натисни бутона, за да зададеш нова.',
      button: 'Задай нова парола',
      footer: 'Линкът е валиден 1 час и може да се ползва само веднъж. Ако не си искал(а) нова парола, просто игнорирай това писмо — паролата ти остава същата.',
    },
  },
  en: {
    verify: {
      subject: 'Confirm your email for Pentilius',
      heading: 'Hi, {username}!',
      body: 'Press the button to confirm that this email is yours. That way you can recover your account if you ever forget your password.',
      button: 'Confirm email',
      footer: 'The link is valid for 3 days. If you did not sign up for Pentilius, just ignore this email.',
    },
    reset: {
      subject: 'New password for Pentilius',
      heading: 'Hi, {username}!',
      body: 'We received a request for a new password for your account. Press the button to set a new one.',
      button: 'Set a new password',
      footer: 'The link is valid for 1 hour and works only once. If you did not ask for a new password, just ignore this email — your password stays the same.',
    },
  },
};

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function renderEmail(
  locale: EmailLocale,
  kind: Kind,
  params: { username: string; link: string; logoUrl: string },
): { subject: string; html: string; text: string } {
  const t = TEXTS[locale][kind];
  const heading = t.heading.replace('{username}', params.username);
  const html = `<!doctype html>
<html><body style="margin:0;padding:0;background:#0b0f14;font-family:Arial,Helvetica,sans-serif;color:#d7dde3">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0b0f14;padding:32px 12px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#141b22;border:1px solid #26323d;border-radius:8px">
        <tr><td align="center" style="padding:28px 24px 8px"><img src="${params.logoUrl}" alt="Pentilius" width="160" style="display:block;width:160px;height:auto;border:0"></td></tr>
        <tr><td style="padding:12px 28px 0;font-size:18px;font-weight:bold;color:#ffffff">${escapeHtml(heading)}</td></tr>
        <tr><td style="padding:12px 28px 0;font-size:14px;line-height:1.6;color:#d7dde3">${escapeHtml(t.body)}</td></tr>
        <tr><td align="center" style="padding:24px 28px">
          <a href="${params.link}" style="display:inline-block;background:#1c2a33;border:1px solid #405360;border-radius:6px;padding:12px 22px;color:#ffffff;text-decoration:none;font-size:13px;text-transform:uppercase;letter-spacing:1px">${escapeHtml(t.button)}</a>
        </td></tr>
        <tr><td style="padding:0 28px 8px;font-size:11px;line-height:1.5;color:#9aa6b2;word-break:break-all"><a href="${params.link}" style="color:#9aa6b2;text-decoration:underline">${escapeHtml(params.link)}</a></td></tr>
        <tr><td style="padding:8px 28px 28px;font-size:11px;line-height:1.5;color:#9aa6b2">${escapeHtml(t.footer)}</td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
  const text = `${heading}\n\n${t.body}\n\n${params.link}\n\n${t.footer}`;
  return { subject: t.subject, html, text };
}
