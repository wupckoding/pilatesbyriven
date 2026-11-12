import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import { existsSync } from 'fs'
import { join, sep } from 'path'
import { config } from './config.js'
import { db } from './db.js'
import { HttpError } from './lib/http.js'
import authRoutes from './routes/auth.js'
import clientRoutes from './routes/client.js'
import adminRoutes from './routes/admin.js'
import commerceRoutes from './routes/commerce.js'
import { clientIntake, adminIntake } from './routes/intake.js'
import { clientOrders, adminOrders } from './routes/orders.js'

export function createApp() {
  const app = express()
  app.disable('x-powered-by')
  app.set('trust proxy', 1) // detrás de nginx en la VPS

  // En producción el navegador solo puede cargar y llamar a este mismo servidor.
  // (En desarrollo Vite inyecta scripts en línea, por eso allí queda apagada.)
  const contentSecurityPolicy = config.isProd && {
    useDefaults: false,
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"], // las animaciones escriben estilos en línea
      imgSrc: ["'self'", 'data:', 'blob:'],
      fontSrc: ["'self'", 'data:'], // Vite incrusta las fuentes pequeñas en el CSS
      connectSrc: ["'self'"],
      workerSrc: ["'self'"],
      manifestSrc: ["'self'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
    },
  }
  app.use(helmet({ contentSecurityPolicy, crossOriginResourcePolicy: { policy: 'same-site' } }))
  // Solo los orígenes configurados pueden llamar a la API desde un navegador.
  app.use(cors({ origin: config.corsOrigins.length ? config.corsOrigins : false }))
  // Solo la subida de comprobantes acepta cuerpos grandes; el resto de la API queda en 100 kb.
  app.use('/api/orders/:id/proof', express.json({ limit: '11mb' }))
  app.use(express.json({ limit: '100kb' }))

  const limiter = (max, windowMs) => rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    skip: () => config.isTest,
    handler: (_req, res) => res.status(429).json({
      error: 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo', code: 'RATE_LIMITED',
    }),
  })
  app.use('/api', limiter(300, 60_000))
  app.use(['/api/auth/login', '/api/auth/register'], limiter(10, 15 * 60_000))

  // Lo consulta Docker para saber si la app está sana: responde 503 si no hay base de datos.
  app.get('/api/health', async (_req, res) => {
    try {
      await db.one('select 1 as ok')
      res.json({ status: 'ok' })
    } catch {
      res.status(503).json({ status: 'error', code: 'DB_DOWN' })
    }
  })
  app.use('/api/auth', authRoutes)
  app.use('/api/admin', adminRoutes)
  app.use('/api/admin', commerceRoutes)
  app.use('/api/admin', adminIntake)
  app.use('/api/admin', adminOrders)
  app.use('/api', clientIntake)
  app.use('/api', clientOrders)
  app.use('/api', clientRoutes)
  app.use('/api', (_req, _res, next) => next(new HttpError(404, 'Ruta no encontrada', 'NOT_FOUND')))

  // En producción el mismo servidor entrega el front compilado.
  const dist = join(config.root, '..', 'dist')
  if (config.isProd && existsSync(dist)) {
    app.use(express.static(dist, {
      index: false,
      setHeaders(res, file) {
        // Los archivos de /assets llevan un hash en el nombre: se pueden guardar para siempre.
        // El resto (service worker, manifiesto, íconos) se revalida en cada visita para que
        // una versión nueva llegue de inmediato.
        const hashed = file.includes(`${sep}assets${sep}`)
        res.setHeader('Cache-Control', hashed ? 'public, max-age=31536000, immutable' : 'no-cache')
      },
    }))
    // Un archivo que no existe es un 404, no la página de inicio.
    app.get(/^\/(assets|icons)\/|\.[a-z0-9]+$/i, (_req, _res, next) => next(new HttpError(404, 'No encontrado', 'NOT_FOUND')))
    app.get('*', (_req, res) => {
      res.setHeader('Cache-Control', 'no-cache')
      res.sendFile(join(dist, 'index.html'))
    })
  }

  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    if (err instanceof HttpError) {
      return res.status(err.status).json({ error: err.message, code: err.code, ...(err.extra || {}) })
    }
    if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: 'JSON inválido', code: 'VALIDATION' })
    if (err?.type === 'entity.too.large') return res.status(413).json({ error: 'Solicitud demasiado grande', code: 'TOO_LARGE' })
    if (['22P02', '22007', '22008'].includes(err?.code)) {
      return res.status(400).json({ error: 'Datos inválidos', code: 'VALIDATION' })
    }
    console.error(err)
    res.status(500).json({ error: 'Ocurrió un error. Inténtalo de nuevo', code: 'INTERNAL' })
  })

  return app
}
