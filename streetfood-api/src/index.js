// src/index.js
// Punto de entrada del servidor

require('dotenv').config()
const express = require('express')
const cors = require('cors')
const helmet = require('helmet')
const rateLimit = require('express-rate-limit')

const routes = require('./routes')
const manejarErrores = require('./middlewares/errores')
const db = require('./lib/db')

const app = express()
const PORT = process.env.PORT || 3000

// ---------------------------------------------------------------
//  Seguridad y middlewares base
// ---------------------------------------------------------------
app.use(helmet())
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  methods: ['GET', 'POST', 'PATCH', 'DELETE'],
}))
app.use(express.json({ limit: '1mb' }))

// Rate limiting — máximo 100 requests por minuto por IP
app.use('/api', rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  message: { error: 'Demasiadas solicitudes, esperá un momento' },
}))

// ---------------------------------------------------------------
//  Rutas
// ---------------------------------------------------------------
app.use('/api', routes)

// Health check — Railway lo usa para saber si el servidor está vivo
app.get('/health', async (req, res) => {
  try {
    await db.query('SELECT 1')
    res.json({ status: 'ok', timestamp: new Date().toISOString() })
  } catch {
    res.status(500).json({ status: 'error', message: 'Base de datos no disponible' })
  }
})

// 404
app.use((req, res) => {
  res.status(404).json({ error: `Ruta ${req.method} ${req.path} no encontrada` })
})

// Errores
app.use(manejarErrores)

// ---------------------------------------------------------------
//  Arrancar servidor
// ---------------------------------------------------------------
app.listen(PORT, () => {
  console.log(`✅ Streetfood API corriendo en puerto ${PORT}`)
  console.log(`   Entorno: ${process.env.NODE_ENV || 'development'}`)
})
