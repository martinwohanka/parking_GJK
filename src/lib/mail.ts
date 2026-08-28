import fs from 'node:fs/promises';
import path from 'node:path';
import nodemailer, { type Transporter } from 'nodemailer';

export type MailMessage = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

let cached: Transporter | null = null;

/**
 * Odesílá aplikace opravdu e-maily? Bez nastaveného SMTP serveru se zprávy
 * jen zaznamenají – uživateli pak nesmíme tvrdit, že potvrzení dorazilo.
 */
export function isMailEnabled(): boolean {
  return Boolean(process.env.SMTP_HOST);
}

function transporter(): Transporter | null {
  const host = process.env.SMTP_HOST;
  if (!host) return null;
  if (cached) return cached;
  cached = nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD ?? '' }
      : undefined,
  });
  return cached;
}

/**
 * Odešle e-mail. Pokud není nakonfigurován SMTP server, zpráva se vypíše
 * do konzole a uloží do složky ./mail-outbox (vývojový režim).
 * Selhání odeslání nikdy neshodí probíhající akci – rezervace zůstane platná.
 */
export async function sendMail(message: MailMessage): Promise<void> {
  const from = process.env.MAIL_FROM ?? 'Parkoviště GJK <parkoviste@gjk.cz>';
  const tx = transporter();

  if (!tx) {
    console.info(`[mail] SMTP není nastaven – zpráva pro ${message.to}: ${message.subject}`);
    // Kopii ukládáme jen ve vývoji; hostingy typu Vercel mají souborový
    // systém jen pro čtení a zápis by zbytečně selhával při každé zprávě.
    if (process.env.NODE_ENV === 'production') return;

    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const dir = path.join(process.cwd(), 'mail-outbox');
    const body = [
      `From: ${from}`,
      `To: ${message.to}`,
      `Subject: ${message.subject}`,
      '',
      message.text,
    ].join('\n');
    try {
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(path.join(dir, `${stamp}-${sanitize(message.to)}.txt`), body, 'utf8');
    } catch (error) {
      console.warn('[mail] Zprávu se nepodařilo uložit do mail-outbox:', error);
    }
    return;
  }

  try {
    await tx.sendMail({ from, ...message });
  } catch (error) {
    console.error('[mail] Odeslání e-mailu selhalo:', error);
  }
}

function sanitize(value: string): string {
  return value.replace(/[^a-zA-Z0-9._@-]/g, '_');
}

/* --------------------------- šablony zpráv ------------------------------ */

const appUrl = () => process.env.APP_URL ?? 'http://localhost:3000';

function layout(title: string, lines: string[], footer?: string): string {
  return `<!doctype html><html lang="cs"><body style="margin:0;background:#f1f5f9;padding:24px;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;color:#0f172a">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;padding:24px;border:1px solid #e2e8f0">
    <p style="margin:0 0 4px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#64748b">Parkoviště GJK</p>
    <h1 style="margin:0 0 16px;font-size:20px">${escapeHtml(title)}</h1>
    ${lines.map((l) => `<p style="margin:0 0 10px;line-height:1.5">${l}</p>`).join('')}
    <p style="margin:20px 0 0"><a href="${appUrl()}" style="display:inline-block;background:#1d59f0;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px">Otevřít aplikaci</a></p>
    <p style="margin:20px 0 0;font-size:12px;color:#64748b">${escapeHtml(footer ?? 'Tato zpráva byla odeslána automaticky, neodpovídejte na ni.')}</p>
  </div></body></html>`;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export type ReservationMailData = {
  userName: string;
  userEmail: string;
  spotCode: string;
  dateLabel: string;
  timeLabel: string;
  tokensLeft?: number;
};

export function reservationCreatedMail(data: ReservationMailData): MailMessage {
  const lines = [
    `Dobrý den, ${data.userName},`,
    `vaše rezervace parkovacího místa <strong>č. ${escapeHtml(data.spotCode)}</strong> byla potvrzena.`,
    `Termín: <strong>${escapeHtml(data.dateLabel)}</strong>, čas <strong>${escapeHtml(data.timeLabel)}</strong>.`,
    data.tokensLeft !== undefined
      ? `Zbývající rezervace v tomto týdnu: <strong>${data.tokensLeft}</strong>.`
      : '',
  ].filter(Boolean);
  return {
    to: data.userEmail,
    subject: `Potvrzení rezervace – místo ${data.spotCode}, ${data.dateLabel}`,
    text: `Dobrý den, ${data.userName},\n\nvaše rezervace parkovacího místa č. ${data.spotCode} byla potvrzena.\nTermín: ${data.dateLabel}, čas ${data.timeLabel}.\n${
      data.tokensLeft !== undefined
        ? `Zbývající rezervace v tomto týdnu: ${data.tokensLeft}.\n`
        : ''
    }\nRezervaci můžete zrušit v aplikaci: ${appUrl()}/rezervace\n`,
    html: layout('Rezervace potvrzena', lines),
  };
}

export function reservationCancelledMail(
  data: ReservationMailData & { byAdmin: boolean; reason?: string },
): MailMessage {
  const who = data.byAdmin ? 'správcem parkoviště' : 'vámi';
  const lines = [
    `Dobrý den, ${data.userName},`,
    `rezervace místa <strong>č. ${escapeHtml(data.spotCode)}</strong> na <strong>${escapeHtml(data.dateLabel)}</strong> (${escapeHtml(data.timeLabel)}) byla zrušena ${who}.`,
    data.reason ? `Důvod: ${escapeHtml(data.reason)}` : '',
  ].filter(Boolean);
  return {
    to: data.userEmail,
    subject: `Zrušení rezervace – místo ${data.spotCode}, ${data.dateLabel}`,
    text: `Dobrý den, ${data.userName},\n\nrezervace místa č. ${data.spotCode} na ${data.dateLabel} (${data.timeLabel}) byla zrušena ${who}.\n${
      data.reason ? `Důvod: ${data.reason}\n` : ''
    }`,
    html: layout('Rezervace zrušena', lines),
  };
}

export function reservationChangedMail(
  data: ReservationMailData & { previous: string },
): MailMessage {
  const lines = [
    `Dobrý den, ${data.userName},`,
    `správce upravil vaši rezervaci.`,
    `Původně: ${escapeHtml(data.previous)}`,
    `Nově: <strong>místo č. ${escapeHtml(data.spotCode)}, ${escapeHtml(data.dateLabel)}, ${escapeHtml(data.timeLabel)}</strong>.`,
  ];
  return {
    to: data.userEmail,
    subject: `Změna rezervace – místo ${data.spotCode}, ${data.dateLabel}`,
    text: `Dobrý den, ${data.userName},\n\nsprávce upravil vaši rezervaci.\nPůvodně: ${data.previous}\nNově: místo č. ${data.spotCode}, ${data.dateLabel}, ${data.timeLabel}.\n`,
    html: layout('Rezervace upravena', lines),
  };
}

export function welcomeMail(data: { userName: string; userEmail: string }): MailMessage {
  const lines = [
    `Dobrý den, ${data.userName},`,
    'registrace do rezervačního systému parkoviště GJK proběhla úspěšně.',
    'Nyní se můžete přihlásit a rezervovat si volné parkovací místo.',
  ];
  return {
    to: data.userEmail,
    subject: 'Registrace do systému Parkoviště GJK',
    text: `Dobrý den, ${data.userName},\n\nregistrace do rezervačního systému parkoviště GJK proběhla úspěšně.\nPřihlásit se můžete na ${appUrl()}/prihlaseni\n`,
    html: layout('Vítejte v systému', lines),
  };
}

export function penaltyConfirmedMail(data: {
  userName: string;
  userEmail: string;
  plate: string;
  points: number;
  reason: string;
  totalPoints: number;
  tokensPerWeek: number;
  blocked: boolean;
}): MailMessage {
  const lines = [
    `Dobrý den, ${data.userName},`,
    `k vozidlu <strong>${escapeHtml(data.plate)}</strong> byly potvrzeny trestné body za nesprávné parkování: <strong>${data.points} b.</strong>`,
    `Důvod: ${escapeHtml(data.reason)}`,
    `Celkem aktivních trestných bodů: <strong>${data.totalPoints}</strong>.`,
    data.blocked
      ? 'Kvůli počtu trestných bodů máte dočasně <strong>pozastavenou možnost rezervace</strong>. Kontaktujte prosím správce parkoviště.'
      : `Váš týdenní příděl rezervací je nyní <strong>${data.tokensPerWeek}</strong>.`,
  ];
  return {
    to: data.userEmail,
    subject: `Trestné body za parkování – ${data.plate}`,
    text: `Dobrý den, ${data.userName},\n\nk vozidlu ${data.plate} byly potvrzeny trestné body za nesprávné parkování: ${data.points} b.\nDůvod: ${data.reason}\nCelkem aktivních trestných bodů: ${data.totalPoints}.\n`,
    html: layout('Trestné body', lines),
  };
}

export function reservationsSummaryMail(data: {
  userName: string;
  userEmail: string;
  items: { spotCode: string; dateLabel: string; timeLabel: string }[];
  tokensLeft: number;
}): MailMessage {
  const rows = data.items
    .map(
      (i) =>
        `<li style="margin-bottom:4px">Místo <strong>č. ${escapeHtml(i.spotCode)}</strong> – ${escapeHtml(
          i.dateLabel,
        )}, ${escapeHtml(i.timeLabel)}</li>`,
    )
    .join('');
  const lines = [
    `Dobrý den, ${data.userName},`,
    `potvrzujeme následující rezervace parkovacího místa:`,
    `<ul style="margin:0 0 10px;padding-left:18px">${rows}</ul>`,
    `Zbývající rezervace v tomto týdnu: <strong>${data.tokensLeft}</strong>.`,
  ];
  return {
    to: data.userEmail,
    subject: `Potvrzení ${data.items.length} rezervací parkovacího místa`,
    text: `Dobrý den, ${data.userName},\n\npotvrzujeme následující rezervace:\n${data.items
      .map((i) => `- místo č. ${i.spotCode}, ${i.dateLabel}, ${i.timeLabel}`)
      .join('\n')}\n\nZbývající rezervace v tomto týdnu: ${data.tokensLeft}.\n`,
    html: layout('Rezervace potvrzeny', lines),
  };
}
