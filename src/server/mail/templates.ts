import "server-only";

type Brand = { appName: string; primaryColor: string; logoUrl: string };

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function layout(brand: Brand, title: string, bodyHtml: string): string {
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${esc(title)}</title></head>
<body style="margin:0;background:#f3f5f9;font-family:Inter,Segoe UI,Arial,sans-serif;color:#1f2937">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f5f9;padding:32px 12px">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb">
<tr><td style="padding:20px 28px;border-bottom:4px solid ${esc(brand.primaryColor)}">
<img src="${esc(brand.logoUrl)}" alt="MiTC" height="36" style="display:block;height:36px">
</td></tr>
<tr><td style="padding:28px">${bodyHtml}</td></tr>
<tr><td style="padding:16px 28px;background:#f9fafb;font-size:12px;color:#6b7280">${esc(brand.appName)} — message automatique, merci de ne pas y répondre directement.</td></tr>
</table></td></tr></table></body></html>`;
}

const button = (brand: Brand, href: string, label: string) =>
  `<a href="${esc(href)}" style="display:inline-block;background:${esc(brand.primaryColor)};color:#ffffff;text-decoration:none;font-weight:600;padding:12px 22px;border-radius:8px">${esc(label)}</a>`;

export function loginEmail(brand: Brand, p: { code: string; link: string; minutes: number }) {
  const subject = `Votre code de connexion : ${p.code}`;
  const html = layout(
    brand,
    subject,
    `<h1 style="font-size:20px;margin:0 0 12px">Connexion à ${esc(brand.appName)}</h1>
<p style="margin:0 0 20px;line-height:1.5">Cliquez sur le bouton pour vous connecter :</p>
<p style="margin:0 0 24px">${button(brand, p.link, "Me connecter")}</p>
<p style="margin:0 0 8px;line-height:1.5">Ou saisissez ce code dans la page de connexion (pratique si vous lisez ce message sur un autre appareil) :</p>
<p style="font-size:30px;letter-spacing:8px;font-weight:700;margin:0 0 20px;font-family:Consolas,monospace">${esc(p.code)}</p>
<p style="margin:0;color:#4b5563;font-size:14px;line-height:1.5">Le lien et le code sont valables ${p.minutes} minutes et ne peuvent servir qu'une fois. Si vous n'êtes pas à l'origine de cette demande, ignorez ce message.</p>`,
  );
  const text = `Connexion à ${brand.appName}\n\nLien : ${p.link}\nCode : ${p.code}\n\nValables ${p.minutes} minutes, usage unique. Si vous n'êtes pas à l'origine de cette demande, ignorez ce message.`;
  return { subject, html, text };
}

export function invitationEmail(brand: Brand, p: { inviterName: string; loginUrl: string; email: string }) {
  const subject = `${p.inviterName} vous invite sur ${brand.appName}`;
  const html = layout(
    brand,
    subject,
    `<h1 style="font-size:20px;margin:0 0 12px">Vous êtes invité(e) sur ${esc(brand.appName)}</h1>
<p style="margin:0 0 20px;line-height:1.5">${esc(p.inviterName)} vous a donné accès à l'outil de gestion de projets de MiTC. Pour vous connecter, aucun mot de passe n'est nécessaire : saisissez votre adresse <strong>${esc(p.email)}</strong> et vous recevrez un code par e-mail.</p>
<p style="margin:0 0 24px">${button(brand, p.loginUrl, "Accéder à l'application")}</p>
<p style="margin:0;color:#4b5563;font-size:14px">Cette invitation est valable 14 jours.</p>`,
  );
  const text = `${p.inviterName} vous invite sur ${brand.appName}.\nConnectez-vous avec votre adresse ${p.email} : ${p.loginUrl}\nInvitation valable 14 jours.`;
  return { subject, html, text };
}

export function testEmail(brand: Brand) {
  const subject = `${brand.appName} : e-mail de test`;
  const html = layout(
    brand,
    subject,
    `<h1 style="font-size:20px;margin:0 0 12px">La configuration SMTP fonctionne</h1>
<p style="margin:0;line-height:1.5">Ce message confirme que ${esc(brand.appName)} peut envoyer des e-mails avec les paramètres saisis.</p>`,
  );
  return { subject, html, text: `La configuration SMTP de ${brand.appName} fonctionne.` };
}
