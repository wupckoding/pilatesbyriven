// Envía un correo de prueba para comprobar la configuración SMTP.
//   node src/mail-test.js destinatario@ejemplo.com
// En la VPS:  ./compose.sh exec app node src/mail-test.js destinatario@ejemplo.com
import { config } from './config.js'
import { sendMail, verificationMail } from './lib/mail.js'

const to = process.argv[2]
if (!to) {
  console.error('uso: node src/mail-test.js destinatario@ejemplo.com')
  process.exit(1)
}
if (config.mail.mode !== 'smtp') {
  console.error('SMTP no configurado (falta SMTP_HOST): no se envió nada.')
  process.exit(1)
}
try {
  await sendMail(verificationMail({ to, name: 'Prueba', code: '123456', minutes: 15 }))
  console.log(`Enviado a ${to} desde ${config.mail.from} vía ${config.mail.host}:${config.mail.port}`)
} catch (err) {
  console.error(`No se pudo enviar: ${err.message}`)
  process.exit(1)
}
