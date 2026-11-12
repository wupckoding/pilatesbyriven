import { config } from '../config.js'

/** Mensajes capturados en modo 'capture' (pruebas y desarrollo). */
export const outbox = []

let transport
async function smtp() {
  if (!transport) {
    const { default: nodemailer } = await import('nodemailer')
    transport = nodemailer.createTransport({
      host: config.mail.host,
      port: config.mail.port,
      secure: config.mail.port === 465,
      auth: config.mail.user ? { user: config.mail.user, pass: config.mail.pass } : undefined,
      connectionTimeout: 10_000,
      socketTimeout: 15_000,
    })
  }
  return transport
}

export const mailEnabled = () => config.mail.mode !== 'off'

/** Envía un correo. Lanza si el servidor de correo lo rechaza. */
export async function sendMail({ to, subject, text, html }) {
  if (config.mail.mode === 'off') throw new Error('Correo saliente no configurado')
  if (config.mail.mode === 'capture') {
    outbox.push({ to, subject, text, html, at: new Date() })
    if (outbox.length > 200) outbox.shift()
    if (!config.isTest) console.log(`[correo → ${to}] ${subject}\n${text}`)
    return
  }
  await (await smtp()).sendMail({ from: config.mail.from, to, subject, text, html })
}

const escapeHtml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))

/** Correo con el código de verificación de cuenta. */
export function verificationMail({ to, name, code, minutes }) {
  const first = (name || '').trim().split(/\s+/)[0]
  const hello = first ? `Hola, ${first}:` : 'Hola:'
  const text = [
    hello, '',
    `Tu código para confirmar tu correo en Pilates by Riven es: ${code}`, '',
    `Vence en ${minutes} minutos. Si no creaste una cuenta, ignora este mensaje.`,
  ].join('\n')
  const html = `<!doctype html><html lang="es"><body style="margin:0;background:#F5F0E8;font-family:Helvetica,Arial,sans-serif;color:#2B221D">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:440px;background:#FFFDFA;border-radius:24px;padding:36px 32px">
<tr><td style="font-size:12px;letter-spacing:6px;color:#8A6548;font-weight:bold">RIVEN</td></tr>
<tr><td style="padding-top:24px;font-size:16px;line-height:24px">${escapeHtml(hello)}</td></tr>
<tr><td style="padding-top:8px;font-size:16px;line-height:24px">Tu código para confirmar tu correo es:</td></tr>
<tr><td style="padding:24px 0;font-size:36px;letter-spacing:10px;font-weight:bold;color:#2B221D">${escapeHtml(code)}</td></tr>
<tr><td style="font-size:14px;line-height:21px;color:#6B5D54">Vence en ${minutes} minutos. Si no creaste una cuenta en Pilates by Riven, ignora este mensaje.</td></tr>
</table></td></tr></table></body></html>`
  return { to, subject: `${code} es tu código de Pilates by Riven`, text, html }
}
